import { OrderRequest } from './types';
import { logger } from './logger';
import { IExchange } from '../interfaces/exchange.interface';
import { config } from '../config/env';
import { PrecisionUtils } from '../utils/math';
import { IDataStore } from '../interfaces/repository.interface';
import { ITimeProvider, RealTimeProvider } from './time.provider';

export class RiskManager {
    private exchange: IExchange;
    private store: IDataStore;
    private timeProvider: ITimeProvider;
    private initialBalance: number = 0;
    private startOfDayBalance: number = 0;
    private lastResetDay: number = 0; // Day of the month
    private isInitialized: boolean = false;

    constructor(exchange: IExchange, store: IDataStore, timeProvider: ITimeProvider = new RealTimeProvider()) {
        this.exchange = exchange;
        this.store = store;
        this.timeProvider = timeProvider;
    }

    async init(currentEquity?: number) {
        const currentBalance = currentEquity ?? await this.exchange.getBalance(config.PAPER_BALANCE_ASSET);
        this.initialBalance = currentBalance;

        // Try to recover state
        const state = await this.store.getRiskState();
        const today = this.timeProvider.getUTCDate();

        if (state && state.lastResetDay === today) {
            this.startOfDayBalance = state.startOfDayBalance;
            this.lastResetDay = state.lastResetDay;
            logger.info(`[RiskManager] State Recovered. Start-of-Day Balance: ${this.startOfDayBalance}`);
        } else {
            // New day or no state, initialize fresh
            this.startOfDayBalance = currentBalance;
            this.lastResetDay = today;
            await this.store.saveRiskState({
                startOfDayBalance: this.startOfDayBalance,
                lastResetDay: this.lastResetDay
            });
        }

        this.isInitialized = true;
        logger.info(`[RiskManager] Initialized. Balance/Equity: ${this.initialBalance} ${config.PAPER_BALANCE_ASSET}`);
    }

    async validateOrder(order: OrderRequest, currentEquity?: number): Promise<boolean> {
        if (!this.isInitialized) await this.init(currentEquity);

        const currentBalance = currentEquity ?? await this.exchange.getBalance(config.PAPER_BALANCE_ASSET);
        const today = this.timeProvider.getUTCDate();

        // Check for Daily Reset (UTC)
        if (today !== this.lastResetDay) {
            this.startOfDayBalance = currentBalance;
            this.lastResetDay = today;
            logger.info(`[RiskManager] Daily Reset. New Start-of-Day Balance: ${this.startOfDayBalance}`);

            await this.store.saveRiskState({
                startOfDayBalance: this.startOfDayBalance,
                lastResetDay: this.lastResetDay
            });
        }


        // 1. Daily Drawdown Check
        // Check before entering new risk (BUY or SELL)
        // Calculate drop from Start of Day Balance
        const drop = (this.startOfDayBalance - currentBalance) / this.startOfDayBalance;
        const limit = config.MAX_DAILY_DRAWDOWN_PERCENT / 100;

        if (drop > limit) {
            logger.error(`[RiskManager] HALT. Max Daily Drawdown hit: ${(drop * 100).toFixed(2)}% (Limit: ${config.MAX_DAILY_DRAWDOWN_PERCENT}%)`);
            return false;
        }

        // 2. Max Open Trades Check
        const openTrades = await this.store.getOpenTrades();
        if (openTrades.length >= config.MAX_OPEN_TRADES) {
            logger.warn(`[RiskManager] Order Rejected. Max Open Trades reached: ${openTrades.length} (Limit: ${config.MAX_OPEN_TRADES})`);
            return false;
        }

        return true;
    }

    async calculateQuantity(symbol: string, price: number, slPercent?: number, currentEquity?: number): Promise<number> {
        const equity = currentEquity ?? await this.exchange.getBalance(config.PAPER_BALANCE_ASSET);
        const availableBalance = await this.exchange.getBalance(config.PAPER_BALANCE_ASSET);
        const leverage = config.LEVERAGE_ENABLED ? config.LEVERAGE_VALUE : 1;

        // 1. Determine Stop Loss Distance
        const effectiveSLPercent = slPercent ?? config.DEFAULT_STOP_LOSS_PERCENT;
        const slDistance = price * (effectiveSLPercent / 100);

        // 2. Risk Amount Calculation
        // Use the minimum of equity and available balance to ensure we don't risk funds that aren't available
        // This prevents over-leveraging on unrealized profits
        const effectiveCapital = Math.min(equity, availableBalance);
        const riskAmount = effectiveCapital * (config.RISK_PER_TRADE_PERCENT / 100);

        // 3. Calculate Quantity based on Risk
        // Loss = Quantity * SL_Distance
        // Therefore: Quantity = Risk / SL_Distance
        let quantity = riskAmount / slDistance;

        // Apply precision (round down to 6 decimals safe for crypto)
        quantity = PrecisionUtils.normalizeQuantity(quantity);

        // 4. Calculate Constraints
        let positionValue = quantity * price;
        const requiredMargin = positionValue / leverage;

        // Constraint A: Available Margin Check (Buffer 10%)
        const maxAllowedMargin = availableBalance * 0.9;
        if (requiredMargin > maxAllowedMargin) {
            const adjustmentFactor = maxAllowedMargin / requiredMargin;
            quantity *= adjustmentFactor;
            quantity = PrecisionUtils.normalizeQuantity(quantity);
            positionValue = quantity * price;
            logger.warn(`[RiskManager] Position size reduced by ${(adjustmentFactor * 100).toFixed(1)}% to fit available margin`);
        }

        // Constraint B: Maximum Position Size
        // Ensure position value doesn't exceed configured percentage of available balance
        const maxPositionSizePercent = config.MAX_POSITION_SIZE_PERCENT / 100;
        const maxPositionValueBySize = availableBalance * maxPositionSizePercent;

        if (positionValue > maxPositionValueBySize) {
            const adjustmentFactor = maxPositionValueBySize / positionValue;
            quantity *= adjustmentFactor;
            quantity = PrecisionUtils.normalizeQuantity(quantity);
            positionValue = quantity * price;
            logger.warn(`[RiskManager] Position size capped to ${config.MAX_POSITION_SIZE_PERCENT}% of available balance`);
        }

        // Constraint C: Maximum Leverage Utilization
        // Ensure position value doesn't exceed X% of Max theoretical position
        // Max theoretical = Available Balance * Leverage
        const maxUtilizationPercent = config.MAX_LEVERAGE_UTILIZATION / 100;
        const maxPositionValue = availableBalance * leverage * maxUtilizationPercent;

        if (positionValue > maxPositionValue) {
            const adjustmentFactor = maxPositionValue / positionValue;
            quantity *= adjustmentFactor;
            quantity = PrecisionUtils.normalizeQuantity(quantity);
            positionValue = quantity * price;
            logger.warn(`[RiskManager] Position size capped to prevent over-leveraging (max ${config.MAX_LEVERAGE_UTILIZATION}% utilization)`);
        }

        // Constraint D: Minimum Size
        const minPositionValue = 10; // Min $10 position (Hardcoded safe minimum)
        if (positionValue < minPositionValue) {
            logger.warn(`[RiskManager] Position size too small: ${positionValue.toFixed(2)} < ${minPositionValue}`);
            return 0; // Skip trade
        }

        // Final Recalculations for logging
        const finalPositionValue = quantity * price;
        const finalMargin = finalPositionValue / leverage;
        const actualRiskAmount = quantity * slDistance;
        const actualRiskPercent = (actualRiskAmount / equity) * 100;

        logger.info(`[RiskManager] Professional position sizing for ${symbol}:`);
        logger.info(`  Risk Target: ${riskAmount.toFixed(2)} ${config.PAPER_BALANCE_ASSET} (${config.RISK_PER_TRADE_PERCENT}% of equity)`);
        logger.info(`  Actual Risk: ${actualRiskAmount.toFixed(2)} ${config.PAPER_BALANCE_ASSET} (${actualRiskPercent.toFixed(2)}% of equity)`);
        logger.info(`  SL Distance: ${slDistance.toFixed(2)} (${effectiveSLPercent.toFixed(2)}% of entry)`);
        logger.info(`  Leverage: ${leverage}x`);
        logger.info(`  Quantity: ${quantity.toFixed(6)} (Position Value: ${finalPositionValue.toFixed(2)} ${config.PAPER_BALANCE_ASSET}, Margin: ${finalMargin.toFixed(2)} ${config.PAPER_BALANCE_ASSET})`);

        return quantity;
    }

    calculateExitPrices(entryPrice: number, quantity: number, side: 'BUY' | 'SELL',
        signalSL?: number, signalTP?: number): { stopLoss: number, takeProfit: number } {

        // Professional approach: Interpret percentages as equity risk (not position value)
        // This follows the "Golden Sequence": Technical levels → Risk amount → Position size
        const slPercent = (signalSL ?? config.DEFAULT_STOP_LOSS_PERCENT) / 100;
        const tpPercent = (signalTP ?? config.DEFAULT_TAKE_PROFIT_PERCENT) / 100;

        // Calculate risk/reward as percentage of entry price (technical approach)
        // This gives consistent percentage moves regardless of position size
        let stopLoss = 0;
        let takeProfit = 0;

        if (side === 'BUY') {
            // For long positions: SL below entry, TP above entry
            stopLoss = entryPrice * (1 - slPercent);
            takeProfit = entryPrice * (1 + tpPercent);
        } else {
            // For short positions: SL above entry, TP below entry
            stopLoss = entryPrice * (1 + slPercent);
            takeProfit = entryPrice * (1 - tpPercent);
        }

        return { stopLoss, takeProfit };
    }
}
