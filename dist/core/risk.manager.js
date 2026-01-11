"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RiskManager = void 0;
const logger_1 = require("./logger");
const env_1 = require("../config/env");
const math_1 = require("../utils/math");
const time_provider_1 = require("./time.provider");
class RiskManager {
    constructor(exchange, store, timeProvider = new time_provider_1.RealTimeProvider()) {
        this.initialBalance = 0;
        this.startOfDayBalance = 0;
        this.lastResetDay = 0; // Day of the month
        this.isInitialized = false;
        this.exchange = exchange;
        this.store = store;
        this.timeProvider = timeProvider;
    }
    async init(currentEquity) {
        const currentBalance = currentEquity ?? await this.exchange.getBalance(env_1.config.PAPER_BALANCE_ASSET);
        this.initialBalance = currentBalance;
        // Try to recover state
        const state = await this.store.getRiskState();
        const today = this.timeProvider.getUTCDate();
        if (state && state.lastResetDay === today) {
            this.startOfDayBalance = state.startOfDayBalance;
            this.lastResetDay = state.lastResetDay;
            logger_1.logger.info(`[RiskManager] State Recovered. Start-of-Day Balance: ${this.startOfDayBalance}`);
        }
        else {
            // New day or no state, initialize fresh
            this.startOfDayBalance = currentBalance;
            this.lastResetDay = today;
            await this.store.saveRiskState({
                startOfDayBalance: this.startOfDayBalance,
                lastResetDay: this.lastResetDay
            });
        }
        this.isInitialized = true;
        logger_1.logger.info(`[RiskManager] Initialized. Balance/Equity: ${this.initialBalance} ${env_1.config.PAPER_BALANCE_ASSET}`);
    }
    async validateOrder(order, currentEquity) {
        if (!this.isInitialized)
            await this.init(currentEquity);
        const currentBalance = currentEquity ?? await this.exchange.getBalance(env_1.config.PAPER_BALANCE_ASSET);
        const today = this.timeProvider.getUTCDate();
        // Check for Daily Reset (UTC)
        if (today !== this.lastResetDay) {
            this.startOfDayBalance = currentBalance;
            this.lastResetDay = today;
            logger_1.logger.info(`[RiskManager] Daily Reset. New Start-of-Day Balance: ${this.startOfDayBalance}`);
            await this.store.saveRiskState({
                startOfDayBalance: this.startOfDayBalance,
                lastResetDay: this.lastResetDay
            });
        }
        // 1. Daily Drawdown Check
        // Check before entering new risk (BUY or SELL)
        // Calculate drop from Start of Day Balance
        const drop = (this.startOfDayBalance - currentBalance) / this.startOfDayBalance;
        const limit = env_1.config.MAX_DAILY_DRAWDOWN_PERCENT / 100;
        if (drop > limit) {
            logger_1.logger.error(`[RiskManager] HALT. Max Daily Drawdown hit: ${(drop * 100).toFixed(2)}% (Limit: ${env_1.config.MAX_DAILY_DRAWDOWN_PERCENT}%)`);
            return false;
        }
        // 2. Max Open Trades Check
        const openTrades = await this.store.getOpenTrades();
        if (openTrades.length >= env_1.config.MAX_OPEN_TRADES) {
            logger_1.logger.warn(`[RiskManager] Order Rejected. Max Open Trades reached: ${openTrades.length} (Limit: ${env_1.config.MAX_OPEN_TRADES})`);
            return false;
        }
        return true;
    }
    async calculateQuantity(symbol, price, slPercent, currentEquity) {
        const equity = currentEquity ?? await this.exchange.getBalance(env_1.config.PAPER_BALANCE_ASSET);
        const availableBalance = await this.exchange.getBalance(env_1.config.PAPER_BALANCE_ASSET);
        const leverage = env_1.config.LEVERAGE_ENABLED ? env_1.config.LEVERAGE_VALUE : 1;
        // 1. Determine Stop Loss Distance
        const effectiveSLPercent = slPercent ?? env_1.config.DEFAULT_STOP_LOSS_PERCENT;
        const slDistance = price * (effectiveSLPercent / 100);
        // 2. Risk Amount Calculation
        // Use the minimum of equity and available balance to ensure we don't risk funds that aren't available
        // This prevents over-leveraging on unrealized profits
        const effectiveCapital = Math.min(equity, availableBalance);
        const riskAmount = effectiveCapital * (env_1.config.RISK_PER_TRADE_PERCENT / 100);
        // 3. Calculate Quantity based on Risk
        // Loss = Quantity * SL_Distance
        // Therefore: Quantity = Risk / SL_Distance
        let quantity = riskAmount / slDistance;
        // Apply precision (round down to 6 decimals safe for crypto)
        quantity = math_1.PrecisionUtils.normalizeQuantity(quantity);
        // 4. Calculate Constraints
        let positionValue = quantity * price;
        const requiredMargin = positionValue / leverage;
        // Constraint A: Available Margin Check (Buffer 10%)
        const maxAllowedMargin = availableBalance * 0.9;
        if (requiredMargin > maxAllowedMargin) {
            const adjustmentFactor = maxAllowedMargin / requiredMargin;
            quantity *= adjustmentFactor;
            quantity = math_1.PrecisionUtils.normalizeQuantity(quantity);
            positionValue = quantity * price;
            logger_1.logger.warn(`[RiskManager] Position size reduced by ${(adjustmentFactor * 100).toFixed(1)}% to fit available margin`);
        }
        // Constraint B: Maximum Position Size
        // Ensure position value doesn't exceed configured percentage of available balance
        const maxPositionSizePercent = env_1.config.MAX_POSITION_SIZE_PERCENT / 100;
        const maxPositionValueBySize = availableBalance * maxPositionSizePercent;
        if (positionValue > maxPositionValueBySize) {
            const adjustmentFactor = maxPositionValueBySize / positionValue;
            quantity *= adjustmentFactor;
            quantity = math_1.PrecisionUtils.normalizeQuantity(quantity);
            positionValue = quantity * price;
            logger_1.logger.warn(`[RiskManager] Position size capped to ${env_1.config.MAX_POSITION_SIZE_PERCENT}% of available balance`);
        }
        // Constraint C: Maximum Leverage Utilization
        // Ensure position value doesn't exceed X% of Max theoretical position
        // Max theoretical = Available Balance * Leverage
        const maxUtilizationPercent = env_1.config.MAX_LEVERAGE_UTILIZATION / 100;
        const maxPositionValue = availableBalance * leverage * maxUtilizationPercent;
        if (positionValue > maxPositionValue) {
            const adjustmentFactor = maxPositionValue / positionValue;
            quantity *= adjustmentFactor;
            quantity = math_1.PrecisionUtils.normalizeQuantity(quantity);
            positionValue = quantity * price;
            logger_1.logger.warn(`[RiskManager] Position size capped to prevent over-leveraging (max ${env_1.config.MAX_LEVERAGE_UTILIZATION}% utilization)`);
        }
        // Constraint D: Minimum Size
        const minPositionValue = 10; // Min $10 position (Hardcoded safe minimum)
        if (positionValue < minPositionValue) {
            logger_1.logger.warn(`[RiskManager] Position size too small: ${positionValue.toFixed(2)} < ${minPositionValue}`);
            return 0; // Skip trade
        }
        // Final Recalculations for logging
        const finalPositionValue = quantity * price;
        const finalMargin = finalPositionValue / leverage;
        const actualRiskAmount = quantity * slDistance;
        const actualRiskPercent = (actualRiskAmount / equity) * 100;
        logger_1.logger.info(`[RiskManager] Professional position sizing for ${symbol}:`);
        logger_1.logger.info(`  Risk Target: ${riskAmount.toFixed(2)} ${env_1.config.PAPER_BALANCE_ASSET} (${env_1.config.RISK_PER_TRADE_PERCENT}% of equity)`);
        logger_1.logger.info(`  Actual Risk: ${actualRiskAmount.toFixed(2)} ${env_1.config.PAPER_BALANCE_ASSET} (${actualRiskPercent.toFixed(2)}% of equity)`);
        logger_1.logger.info(`  SL Distance: ${slDistance.toFixed(2)} (${effectiveSLPercent.toFixed(2)}% of entry)`);
        logger_1.logger.info(`  Leverage: ${leverage}x`);
        logger_1.logger.info(`  Quantity: ${quantity.toFixed(6)} (Position Value: ${finalPositionValue.toFixed(2)} ${env_1.config.PAPER_BALANCE_ASSET}, Margin: ${finalMargin.toFixed(2)} ${env_1.config.PAPER_BALANCE_ASSET})`);
        return quantity;
    }
    calculateExitPrices(entryPrice, quantity, side, signalSL, signalTP) {
        // Professional approach: Interpret percentages as equity risk (not position value)
        // This follows the "Golden Sequence": Technical levels → Risk amount → Position size
        const slPercent = (signalSL ?? env_1.config.DEFAULT_STOP_LOSS_PERCENT) / 100;
        const tpPercent = (signalTP ?? env_1.config.DEFAULT_TAKE_PROFIT_PERCENT) / 100;
        // Calculate risk/reward as percentage of entry price (technical approach)
        // This gives consistent percentage moves regardless of position size
        let stopLoss = 0;
        let takeProfit = 0;
        if (side === 'BUY') {
            // For long positions: SL below entry, TP above entry
            stopLoss = entryPrice * (1 - slPercent);
            takeProfit = entryPrice * (1 + tpPercent);
        }
        else {
            // For short positions: SL above entry, TP below entry
            stopLoss = entryPrice * (1 + slPercent);
            takeProfit = entryPrice * (1 - tpPercent);
        }
        return { stopLoss, takeProfit };
    }
}
exports.RiskManager = RiskManager;
