import { IExchange } from '../interfaces/exchange.interface';
import { IStrategy } from '../interfaces/strategy.interface';
import { IDataStore } from '../interfaces/repository.interface';
import { ExchangeFactory } from '../adapters/exchange/factory';
import { StrategyManager } from './strategy.manager';
import { SupabaseDataStore } from '../adapters/database/supabase';
import { OrderRequest, Trade } from './types';
import { logger } from './logger';
import { RiskManager } from './risk.manager';

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

            // 1. Fetch Data
            const candles = await this.exchange.getCandles(symbol, interval, 200);
            if (candles.length === 0) return;

            const lastCandle = candles[candles.length - 1];

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

                    // Close Trade in DB (update exit price, etc - simplified here as new trade entry)
                    // Real implementation should update the existing trade row. 
                    this.activeTrade = null;
                    logger.info(`[BotEngine] Position Closed: ${exitReason}`);
                    return; // Exit tick after closing
                }
            }

            // 3. Strategy Update
            const signal = await this.strategy.update(lastCandle);

            if (signal) {
                logger.info(`[Signal] ${signal.action} ${signal.symbol}`);

                if (signal.action !== 'HOLD') {
                    // 3. Risk Check
                    const orderRequest: OrderRequest = {
                        symbol: signal.symbol,
                        side: signal.action as 'BUY' | 'SELL',
                        type: 'MARKET',
                        quantity: 0.001, // Fixed for demo, should come from risk management
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

    private async runLoop(symbol: string, interval: string) {
        while (this.isRunning) {
            await this.tick(symbol, interval);

            // Wait for next tick (simulated)
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }


}
