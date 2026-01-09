import { IExchange } from '../interfaces/exchange.interface';
import { IStrategy, StrategyConfig } from '../interfaces/strategy.interface';
import { IDataStore } from '../interfaces/repository.interface';
import { ExchangeFactory } from '../adapters/exchange/factory';
import { StrategyManager } from './strategy.manager';
import { SupabaseDataStore } from '../adapters/database/supabase';
import { OrderRequest, Trade } from './types';
import { logger } from './logger';
import { RiskManager } from './risk.manager';
import { TradeManager } from './trade.manager';
import { PortfolioManager } from './portfolio.manager';
import { CommissionManager } from './commission.manager';
import { TimeUtils } from './time.utils';
import { config } from '../config/env';
import { ITimeProvider, RealTimeProvider } from './time.provider';

import { VaultManager } from './vault.manager';

export class BotEngine {
    private exchange: IExchange;
    private strategy: IStrategy;
    private db: IDataStore;
    private vaultManager?: VaultManager;
    private riskManager: RiskManager;
    private tradeManager: TradeManager;
    private portfolioManager: PortfolioManager;
    private commissionManager: CommissionManager;
    private isRunning: boolean = false;
    private activeTrade: Trade | null = null;
    private lastSnapshotTime: number = 0;
    private isProcessingSignal: boolean = false;
    private timeProvider: ITimeProvider;

    constructor(
        strategy: string | IStrategy,
        timeProvider: ITimeProvider = new RealTimeProvider(),
        exchange?: IExchange,
        db?: IDataStore
    ) {
        this.timeProvider = timeProvider;
        this.db = db || new SupabaseDataStore();

        this.exchange = exchange || ExchangeFactory.getExchange(this.db);

        // Get Vault Manager from exchange if it has one
        if (this.exchange.getVaultManager) {
            this.vaultManager = this.exchange.getVaultManager();
        }

        if (typeof strategy === 'string') {
            this.strategy = StrategyManager.getStrategy(strategy);
        } else {
            this.strategy = strategy;
        }

        this.riskManager = new RiskManager(this.exchange, this.db, this.timeProvider);
        this.tradeManager = new TradeManager(this.exchange, this.db);
        this.portfolioManager = new PortfolioManager(this.exchange, this.db, this.timeProvider, this.vaultManager);
        this.commissionManager = new CommissionManager(this.db);

        // Connect CommissionManager to TradeManager
        this.tradeManager.setCommissionManager(this.commissionManager);

        // Resolve circular dependency: Vault needs Equity from Portfolio
        if (this.vaultManager) {
            this.vaultManager.setEquityProvider(this.portfolioManager);
        }
    }

    async start(symbol: string, interval: string, config?: StrategyConfig) {
        logger.info(`[BotEngine] Starting... Symbol: ${symbol}, Interval: ${interval}, Strategy: ${this.strategy.name}`);
        await this.exchange.start();
        const initialEquity = await this.portfolioManager.getCurrentEquity();
        await this.riskManager.init(initialEquity);
        this.strategy.init(config || {}); // Pass config here if needed

        // Save initial snapshot to ensure dashboard is accurate from the start
        await this.portfolioManager.saveSnapshot();
        this.lastSnapshotTime = this.timeProvider.now();

        this.isRunning = true;
        this.runLoop(symbol, interval);
    }

    // Serverless entry point
    async tick(symbol: string, interval: string, strategyConfig?: StrategyConfig) {
        try {
            await this.exchange.start(); // Ensure connection (stateless safe)

            // Re-initialize strategy with config if provided
            if (strategyConfig) {
                this.strategy.init(strategyConfig);
            }

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

            // Save portfolio snapshot periodically (every 5 minutes)
            const now = this.timeProvider.now();
            if (now - this.lastSnapshotTime > 5 * 60 * 1000) {
                try {
                    await this.portfolioManager.saveSnapshot();
                    this.lastSnapshotTime = now;
                } catch (error) {
                    logger.error('[BotEngine] Error saving portfolio snapshot:', error);
                }
            }

            // 2. Check and manage all open positions (SL/TP)
            await this.tradeManager.checkAndManagePositions(lastCandle);
            await this.portfolioManager.saveSnapshot();

            // Refresh active trade status after position management
            if (this.activeTrade) {
                const updatedTrade = await this.db.getActiveTrade(symbol);
                if (!updatedTrade || updatedTrade.id !== this.activeTrade.id) {
                    this.activeTrade = null;
                }
            }

            // 3. Strategy Update - Always check for signals
            const signal = await this.strategy.update(lastCandle);

            if (signal && signal.action !== 'HOLD') {
                // RACE CONDITION PREVENTER: Atomic Lock
                if (this.isProcessingSignal) {
                    logger.debug(`[BotEngine] Signal skipped - processing in progress`);
                    return;
                }
                this.isProcessingSignal = true;

                try {
                    logger.info(`[Signal] ${signal.action} ${signal.symbol}`);

                    // Check for conflicting positions
                    let openTrades = await this.db.getOpenTrades();

                    // Re-enforce MAX_OPEN_TRADES strictly here (Double-check)
                    if (openTrades.length >= config.MAX_OPEN_TRADES) {
                        logger.warn(`[BotEngine] Limit hit. Max ${config.MAX_OPEN_TRADES} trades allowed.`);
                        return;
                    }

                    const symbolTrades = openTrades.filter(trade => trade.symbol === signal.symbol);
                    const conflictingTrades = symbolTrades.filter(trade => trade.side !== signal.action);

                    // Handle force close from signal
                    if (signal.forceClose && conflictingTrades.length > 0) {
                        logger.info(`[BotEngine] Force closing ${conflictingTrades.length} conflicting positions`);
                        for (const trade of conflictingTrades) {
                            await this.tradeManager.forceClosePosition(trade, 'FORCE_CLOSE');
                            await this.portfolioManager.saveSnapshot();
                        }
                    }
                    // Handle close on opposite signal configuration
                    else if (config.CLOSE_ON_OPPOSITE_SIGNAL && conflictingTrades.length > 0) {
                        logger.info(`[BotEngine] Closing ${conflictingTrades.length} positions due to opposite signal`);
                        for (const trade of conflictingTrades) {
                            await this.tradeManager.forceClosePosition(trade, 'OPPOSITE_SIGNAL');
                            await this.portfolioManager.saveSnapshot();
                        }
                    }
                    // Handle single position mode: close all existing positions before opening new one
                    else if (!config.ALLOW_MULTIPLE_POSITIONS && openTrades.length > 0) {
                        logger.info(`[BotEngine] Closing ${openTrades.length} existing positions for single position mode`);
                        for (const trade of openTrades) {
                            await this.tradeManager.forceClosePosition(trade, 'SINGLE_POSITION_MODE');
                            await this.portfolioManager.saveSnapshot();
                        }
                        // Refresh open trades list after closing
                        openTrades = await this.db.getOpenTrades();
                    }

                    // 4. Risk Check
                    const currentEquity = await this.portfolioManager.getCurrentEquity();
                    const quantity = await this.riskManager.calculateQuantity(signal.symbol, lastCandle.close, signal.stopLoss, currentEquity);
                    if (quantity <= 0) return;

                    // Check total portfolio risk
                    const existingTrades = await this.db.getOpenTrades();
                    let totalRisk = 0;
                    for (const trade of existingTrades) {
                        const risk = trade.quantity * Math.abs(trade.price - trade.stopLossPrice!);
                        totalRisk += risk;
                    }
                    const newRisk = quantity * (lastCandle.close * (signal.stopLoss ?? config.DEFAULT_STOP_LOSS_PERCENT) / 100);
                    const availableBalance = await this.exchange.getBalance(config.PAPER_BALANCE_ASSET);
                    const totalRiskPercent = ((totalRisk + newRisk) / availableBalance) * 100;

                    if (totalRiskPercent > config.MAX_TOTAL_RISK_PERCENT) {
                        logger.warn(`[BotEngine] Total portfolio risk would exceed limit: ${totalRiskPercent.toFixed(2)}% > ${config.MAX_TOTAL_RISK_PERCENT}%`);
                        return;
                    }

                    const orderRequest: OrderRequest = {
                        symbol: signal.symbol,
                        side: signal.action as 'BUY' | 'SELL',
                        type: 'MARKET',
                        quantity: quantity,
                    };

                    const isSafe = await this.riskManager.validateOrder(orderRequest, currentEquity);
                    if (!isSafe) {
                        logger.warn(`[BotEngine] Order validation failed for ${signal.symbol}`);
                        return;
                    }

                    // 5. Execution
                    const order = await this.exchange.placeOrder(orderRequest);

                    // 6. Persistence
                    const exitPrices = this.riskManager.calculateExitPrices(order.price, order.quantity, order.side, signal.stopLoss, signal.takeProfit);

                    const leverage = config.LEVERAGE_ENABLED ? config.LEVERAGE_VALUE : 1;
                    const margin = (order.price * order.quantity) / leverage;

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
                        takeProfitPrice: exitPrices.takeProfit,
                        strategyName: this.strategy.name,
                        leverage,
                        margin,
                        trailingStopEnabled: config.TRAILING_STOP_ENABLED,
                        trailingStopActivated: false,
                        trailingStopActivationPercent: config.TRAILING_STOP_ACTIVATION_PERCENT,
                        trailingStopTrailPercent: config.TRAILING_STOP_TRAIL_PERCENT,
                        trailingStopHighPrice: order.side === 'BUY' ? order.price : undefined,
                        trailingStopLowPrice: order.side === 'SELL' ? order.price : undefined
                    };

                    await this.db.saveTrade(trade);
                    await this.portfolioManager.saveSnapshot();

                    // Notify strategy
                    if (this.strategy.onPositionOpened) {
                        try {
                            await this.strategy.onPositionOpened(trade);
                        } catch (error) {
                            logger.error(`[BotEngine] Error in strategy onPositionOpened:`, error);
                        }
                    }

                    // Update activeTrade
                    if (!config.ALLOW_MULTIPLE_POSITIONS) {
                        this.activeTrade = trade;
                    }

                    logger.info(`[BotEngine] Position Opened. TP: ${trade.takeProfitPrice}, SL: ${trade.stopLossPrice}`);

                } catch (error: any) {
                    logger.error(`[BotEngine] Error processing signal:`, error);
                } finally {
                    this.isProcessingSignal = false;
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
            const snapshot = await this.portfolioManager.generateSnapshot();
            const asset = config.PAPER_BALANCE_ASSET;

            const unrealizedPnL = snapshot.currentEquity - snapshot.walletBalance;
            const pnlPercent = snapshot.initialBalance > 0 ? (unrealizedPnL / snapshot.initialBalance) * 100 : 0;

            logger.info(`[Portfolio] ${symbol} | Balance: ${snapshot.currentBalance.toFixed(2)} ${asset} | Equity: ${snapshot.currentEquity.toFixed(2)} ${asset} | Unrealized PnL: ${unrealizedPnL.toFixed(2)} ${asset} (${pnlPercent.toFixed(2)}%)`);
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
