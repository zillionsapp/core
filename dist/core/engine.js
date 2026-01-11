"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BotEngine = void 0;
const factory_1 = require("../adapters/exchange/factory");
const strategy_manager_1 = require("./strategy.manager");
const supabase_1 = require("../adapters/database/supabase");
const logger_1 = require("./logger");
const risk_manager_1 = require("./risk.manager");
const trade_manager_1 = require("./trade.manager");
const portfolio_manager_1 = require("./portfolio.manager");
const commission_manager_1 = require("./commission.manager");
const env_1 = require("../config/env");
const time_provider_1 = require("./time.provider");
class BotEngine {
    constructor(strategy, timeProvider = new time_provider_1.RealTimeProvider(), exchange, db) {
        this.isRunning = false;
        this.activeTrade = null;
        this.lastSnapshotTime = 0;
        this.isProcessingSignal = false;
        this.timeProvider = timeProvider;
        this.db = db || new supabase_1.SupabaseDataStore();
        this.exchange = exchange || factory_1.ExchangeFactory.getExchange(this.db);
        // Get Vault Manager from exchange if it has one
        if (this.exchange.getVaultManager) {
            this.vaultManager = this.exchange.getVaultManager();
        }
        if (typeof strategy === 'string') {
            this.strategy = strategy_manager_1.StrategyManager.getStrategy(strategy);
        }
        else {
            this.strategy = strategy;
        }
        this.riskManager = new risk_manager_1.RiskManager(this.exchange, this.db, this.timeProvider);
        this.tradeManager = new trade_manager_1.TradeManager(this.exchange, this.db);
        this.portfolioManager = new portfolio_manager_1.PortfolioManager(this.exchange, this.db, this.timeProvider, this.vaultManager);
        this.commissionManager = new commission_manager_1.CommissionManager(this.db);
        // Connect CommissionManager to TradeManager
        this.tradeManager.setCommissionManager(this.commissionManager);
        // Resolve circular dependency: Vault needs Equity from Portfolio
        if (this.vaultManager) {
            this.vaultManager.setEquityProvider(this.portfolioManager);
        }
    }
    async start(symbol, interval, config) {
        logger_1.logger.info(`[BotEngine] Starting... Symbol: ${symbol}, Interval: ${interval}, Strategy: ${this.strategy.name}`);
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
    async tick(symbol, interval, strategyConfig) {
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
                    logger_1.logger.info(`[BotEngine] Recovered active trade: ${this.activeTrade.id} (${this.activeTrade.side})`);
                }
            }
            // 1. Fetch Data
            const candles = await this.exchange.getCandles(symbol, interval, 200);
            if (candles.length === 0)
                return;
            // Get current price for real-time monitoring
            const currentTicker = await this.exchange.getTicker(symbol);
            const currentPrice = currentTicker.price;
            const lastCandle = candles[candles.length - 1];
            await this.logPortfolioState(symbol, currentPrice);
            // Save portfolio snapshot periodically (every 5 minutes)
            const now = this.timeProvider.now();
            if (now - this.lastSnapshotTime > 5 * 60 * 1000) {
                try {
                    await this.portfolioManager.saveSnapshot();
                    this.lastSnapshotTime = now;
                }
                catch (error) {
                    logger_1.logger.error('[BotEngine] Error saving portfolio snapshot:', error);
                }
            }
            // 2. Check and manage all open positions (SL/TP) using LIVE PRICE
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
            const signal = await this.strategy.update(lastCandle, currentPrice);
            if (signal && signal.action !== 'HOLD') {
                // RACE CONDITION PREVENTER: Atomic Lock
                if (this.isProcessingSignal) {
                    logger_1.logger.debug(`[BotEngine] Signal skipped - processing in progress`);
                    return;
                }
                this.isProcessingSignal = true;
                try {
                    logger_1.logger.info(`[Signal] ${signal.action} ${signal.symbol}`);
                    // Check for conflicting positions
                    let openTrades = await this.db.getOpenTrades();
                    // Re-enforce MAX_OPEN_TRADES strictly here (Double-check)
                    const maxTrades = env_1.config.ALLOW_MULTIPLE_POSITIONS ? env_1.config.MAX_OPEN_TRADES : 1;
                    if (openTrades.length >= maxTrades) {
                        logger_1.logger.warn(`[BotEngine] Limit hit. Max ${maxTrades} trades allowed.`);
                        return;
                    }
                    const symbolTrades = openTrades.filter(trade => trade.symbol === signal.symbol);
                    const conflictingTrades = symbolTrades.filter(trade => trade.side !== signal.action);
                    // Handle force close from signal
                    if (signal.forceClose && conflictingTrades.length > 0) {
                        logger_1.logger.info(`[BotEngine] Force closing ${conflictingTrades.length} conflicting positions`);
                        for (const trade of conflictingTrades) {
                            await this.tradeManager.forceClosePosition(trade, 'FORCE_CLOSE');
                            await this.portfolioManager.saveSnapshot();
                        }
                    }
                    // Handle close on opposite signal configuration
                    else if (env_1.config.CLOSE_ON_OPPOSITE_SIGNAL && conflictingTrades.length > 0) {
                        logger_1.logger.info(`[BotEngine] Closing ${conflictingTrades.length} positions due to opposite signal`);
                        for (const trade of conflictingTrades) {
                            await this.tradeManager.forceClosePosition(trade, 'OPPOSITE_SIGNAL');
                            await this.portfolioManager.saveSnapshot();
                        }
                    }
                    // Handle single position mode: close all existing positions before opening new one
                    /* else if (!config.ALLOW_MULTIPLE_POSITIONS && openTrades.length > 0) {
                        logger.info(`[BotEngine] Closing ${openTrades.length} existing positions for single position mode`);
                        for (const trade of openTrades) {
                            await this.tradeManager.forceClosePosition(trade, 'SINGLE_POSITION_MODE');
                            await this.portfolioManager.saveSnapshot();
                        }
                        // Refresh open trades list after closing
                        openTrades = await this.db.getOpenTrades();
                    } */
                    // 4. Risk Check
                    const currentEquity = await this.portfolioManager.getCurrentEquity();
                    const quantity = await this.riskManager.calculateQuantity(signal.symbol, lastCandle.close, signal.stopLoss, currentEquity);
                    if (quantity <= 0)
                        return;
                    // Check total portfolio risk
                    const existingTrades = await this.db.getOpenTrades();
                    let totalRisk = 0;
                    for (const trade of existingTrades) {
                        const risk = trade.quantity * Math.abs(trade.price - trade.stopLossPrice);
                        totalRisk += risk;
                    }
                    const newRisk = quantity * (lastCandle.close * (signal.stopLoss ?? env_1.config.DEFAULT_STOP_LOSS_PERCENT) / 100);
                    const availableBalance = await this.exchange.getBalance(env_1.config.PAPER_BALANCE_ASSET);
                    const totalRiskPercent = ((totalRisk + newRisk) / availableBalance) * 100;
                    if (totalRiskPercent > env_1.config.MAX_TOTAL_RISK_PERCENT) {
                        logger_1.logger.warn(`[BotEngine] Total portfolio risk would exceed limit: ${totalRiskPercent.toFixed(2)}% > ${env_1.config.MAX_TOTAL_RISK_PERCENT}%`);
                        return;
                    }
                    const orderRequest = {
                        symbol: signal.symbol,
                        side: signal.action,
                        type: 'MARKET',
                        quantity: quantity,
                    };
                    const isSafe = await this.riskManager.validateOrder(orderRequest, currentEquity);
                    if (!isSafe) {
                        logger_1.logger.warn(`[BotEngine] Order validation failed for ${signal.symbol}`);
                        return;
                    }
                    // 5. Execution
                    const order = await this.exchange.placeOrder(orderRequest);
                    // 6. Persistence
                    const exitPrices = this.riskManager.calculateExitPrices(order.price, order.quantity, order.side, signal.stopLoss, signal.takeProfit);
                    const leverage = env_1.config.LEVERAGE_ENABLED ? env_1.config.LEVERAGE_VALUE : 1;
                    const margin = (order.price * order.quantity) / leverage;
                    const trade = {
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
                        trailingStopEnabled: env_1.config.TRAILING_STOP_ENABLED,
                        trailingStopActivated: false,
                        trailingStopActivationPercent: env_1.config.TRAILING_STOP_ACTIVATION_PERCENT,
                        trailingStopTrailPercent: env_1.config.TRAILING_STOP_TRAIL_PERCENT,
                        trailingStopHighPrice: order.side === 'BUY' ? order.price : undefined,
                        trailingStopLowPrice: order.side === 'SELL' ? order.price : undefined
                    };
                    await this.db.saveTrade(trade);
                    await this.portfolioManager.saveSnapshot();
                    // Notify strategy
                    if (this.strategy.onPositionOpened) {
                        try {
                            await this.strategy.onPositionOpened(trade);
                        }
                        catch (error) {
                            logger_1.logger.error(`[BotEngine] Error in strategy onPositionOpened:`, error);
                        }
                    }
                    // Update activeTrade
                    if (!env_1.config.ALLOW_MULTIPLE_POSITIONS) {
                        this.activeTrade = trade;
                    }
                    logger_1.logger.info(`[BotEngine] Position Opened. TP: ${trade.takeProfitPrice}, SL: ${trade.stopLossPrice}`);
                }
                catch (error) {
                    logger_1.logger.error(`[BotEngine] Error processing signal:`, error);
                }
                finally {
                    this.isProcessingSignal = false;
                }
            }
        }
        catch (error) {
            logger_1.logger.error('[BotEngine] Error in tick:', error);
        }
    }
    async stop() {
        this.isRunning = false;
        logger_1.logger.info('[BotEngine] Stopped.');
    }
    async logPortfolioState(symbol, currentPrice) {
        if (process.env.NODE_ENV === 'test')
            return;
        try {
            const snapshot = await this.portfolioManager.generateSnapshot();
            const asset = env_1.config.PAPER_BALANCE_ASSET;
            const unrealizedPnL = snapshot.currentEquity - snapshot.walletBalance;
            const pnlPercent = snapshot.initialBalance > 0 ? (unrealizedPnL / snapshot.initialBalance) * 100 : 0;
            logger_1.logger.info(`[Portfolio] ${symbol} | Balance: ${snapshot.currentBalance.toFixed(2)} ${asset} | Equity: ${snapshot.currentEquity.toFixed(2)} ${asset} | Unrealized PnL: ${unrealizedPnL.toFixed(2)} ${asset} (${pnlPercent.toFixed(2)}%)`);
        }
        catch (error) {
            logger_1.logger.error('[BotEngine] Error logging portfolio state:', error);
        }
    }
    async runLoop(symbol, interval) {
        while (this.isRunning) {
            await this.tick(symbol, interval);
            // Run tick at configured interval for real-time monitoring, regardless of candle INTERVAL
            const sleepTime = env_1.config.TICK_INTERVAL_SECONDS * 1000;
            logger_1.logger.debug(`[BotEngine] Sleeping for ${(sleepTime / 1000).toFixed(1)}s until next check...`);
            await new Promise(resolve => setTimeout(resolve, sleepTime));
        }
    }
}
exports.BotEngine = BotEngine;
