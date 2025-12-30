import { IExchange } from '../interfaces/exchange.interface';
import { IStrategy } from '../interfaces/strategy.interface';
import { IDataStore } from '../interfaces/repository.interface';
import { ExchangeFactory } from '../adapters/exchange/factory';
import { StrategyManager } from './strategy.manager';
import { SupabaseDataStore } from '../adapters/database/supabase';
import { OrderRequest, Trade } from './types';
import { logger } from './logger';
import { RiskManager } from './risk.manager';
import { TimeUtils } from './time.utils';
import { config } from '../config/env';

export class BotEngine {
    private exchange: IExchange;
    private strategy: IStrategy;
    private db: IDataStore;
    private riskManager: RiskManager;
    private isRunning: boolean = false;
    private activeTrade: Trade | null = null;

    constructor(strategyName: string) {
        this.exchange = ExchangeFactory.getExchange();
        this.strategy = StrategyManager.getStrategy(strategyName);
        this.db = new SupabaseDataStore();
        this.riskManager = new RiskManager(this.exchange);
    }

    async start(symbol: string, interval: string) {
        logger.info(`[BotEngine] Starting... Symbol: ${symbol}, Interval: ${interval}`);
        await this.exchange.start();
        await this.riskManager.init();
        this.strategy.init({}); // Pass config here if needed

        this.isRunning = true;
        this.runLoop(symbol, interval);
    }

    // Serverless entry point
    async tick(symbol: string, interval: string) {
        try {
            await this.exchange.start(); // Ensure connection (stateless safe)
            if (!this.riskManager['isInitialized']) await this.riskManager.init(); // Access private or make public

            // 0. State Recovery (for Serverless / Cold Starts)
            if (!this.activeTrade) {
                this.activeTrade = await this.db.getActiveTrade(symbol);
                if (this.activeTrade) {
                    logger.info(`[BotEngine] Recovered active trade: ${this.activeTrade.id} (${this.activeTrade.side})`);
                }
            }

            // 1. Fetch Data
            const candles = await this.exchange.getCandles(symbol, interval, 200);
            if (candles.length === 0) return;

            const lastCandle = candles[candles.length - 1];
            await this.logPortfolioState(symbol, lastCandle.close);

            // 2. Risk Checks (Stop Loss / Take Profit) independent of Strategy
            if (this.activeTrade) {
                const price = lastCandle.close;
                let exitReason = '';

                if (this.activeTrade.stopLossPrice && price <= this.activeTrade.stopLossPrice) {
                    exitReason = 'STOP_LOSS';
                } else if (this.activeTrade.takeProfitPrice && price >= this.activeTrade.takeProfitPrice) {
                    exitReason = 'TAKE_PROFIT';
                }

                if (exitReason) {
                    logger.info(`[RiskManager] Triggered ${exitReason} at ${price}`);
                    // Force Exit
                    const orderRequest: OrderRequest = {
                        symbol,
                        side: 'SELL',
                        type: 'MARKET',
                        quantity: this.activeTrade.quantity
                    };

                    const order = await this.exchange.placeOrder(orderRequest);

                    // Close Trade in DB
                    await this.db.updateTrade(this.activeTrade.id, {
                        status: 'CLOSED',
                        exitPrice: order.price,
                        exitTimestamp: order.timestamp
                    });

                    logger.info(`[BotEngine] Position Closed: ${exitReason} | ID: ${this.activeTrade.id}`);
                    this.activeTrade = null;
                    return; // Exit tick after closing
                }
            }

            // 3. Strategy Update
            const signal = await this.strategy.update(lastCandle);

            if (signal) {
                logger.info(`[Signal] ${signal.action} ${signal.symbol}`);

                if (signal.action !== 'HOLD') {
                    // 3. Risk Check
                    const quantity = await this.riskManager.calculateQuantity(signal.symbol, lastCandle.close);

                    const orderRequest: OrderRequest = {
                        symbol: signal.symbol,
                        side: signal.action as 'BUY' | 'SELL',
                        type: 'MARKET',
                        quantity: quantity,
                    };

                    const isSafe = await this.riskManager.validateOrder(orderRequest);
                    if (!isSafe) return;

                    // 4. Execution
                    const order = await this.exchange.placeOrder(orderRequest);

                    // 5. Persistence
                    const exitPrices = this.riskManager.calculateExitPrices(order.price, order.side, signal.stopLoss, signal.takeProfit);

                    const trade: Trade = {
                        id: order.id,
                        orderId: order.id,
                        symbol: order.symbol,
                        side: order.side,
                        quantity: order.quantity,
                        price: order.price,
                        timestamp: order.timestamp,
                        status: 'OPEN',
                        stopLossPrice: exitPrices.stopLoss,
                        takeProfitPrice: exitPrices.takeProfit
                    };

                    this.activeTrade = trade;
                    await this.db.saveTrade(trade);
                    logger.info(`[BotEngine] Position Opened. TP: ${trade.takeProfitPrice}, SL: ${trade.stopLossPrice}`);
                }
            }
        } catch (error) {
            logger.error('[BotEngine] Error in tick:', error);
        }
    }

    async stop() {
        this.isRunning = false;
        logger.info('[BotEngine] Stopped.');
    }

    private async logPortfolioState(symbol: string, currentPrice: number) {
        if (process.env.NODE_ENV === 'test') return;
        try {
            const asset = config.PAPER_BALANCE_ASSET;
            const balance = await this.exchange.getBalance(asset);
            let equity = balance;
            let pnl = 0;
            let pnlPercent = 0;

            if (this.activeTrade) {
                const entryValue = this.activeTrade.price * this.activeTrade.quantity;
                const currentValue = currentPrice * this.activeTrade.quantity;

                if (this.activeTrade.side === 'BUY') {
                    pnl = currentValue - entryValue;
                } else {
                    pnl = entryValue - currentValue;
                }

                pnlPercent = (pnl / entryValue) * 100;
                equity = balance + pnl; // Simplified: balance is after margin deduction in PaperExchange
            }

            logger.info(`[Portfolio] ${symbol} | Balance: ${balance.toFixed(2)} ${asset} | Equity: ${equity.toFixed(2)} ${asset} | PnL: ${pnl.toFixed(2)} ${asset} (${pnlPercent.toFixed(2)}%)`);
        } catch (error) {
            logger.error('[BotEngine] Error logging portfolio state:', error);
        }
    }

    private async runLoop(symbol: string, interval: string) {
        while (this.isRunning) {
            await this.tick(symbol, interval);

            const sleepTime = TimeUtils.getSleepDuration(interval);
            logger.info(`[BotEngine] Sleeping for ${(sleepTime / 1000).toFixed(1)}s until next candle boundary...`);
            await new Promise(resolve => setTimeout(resolve, sleepTime));
        }
    }


}
