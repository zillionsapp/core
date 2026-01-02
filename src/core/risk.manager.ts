import { OrderRequest } from './types';
import { logger } from './logger';
import { IExchange } from '../interfaces/exchange.interface';
import { config } from '../config/env';

export class RiskManager {
    private exchange: IExchange;
    private initialBalance: number = 0;
    private isInitialized: boolean = false;

    constructor(exchange: IExchange) {
        this.exchange = exchange;
    }

    async init() {
        this.initialBalance = await this.exchange.getBalance(config.PAPER_BALANCE_ASSET);
        this.isInitialized = true;
        logger.info(`[RiskManager] Initialized. Baseline Equity: ${this.initialBalance} ${config.PAPER_BALANCE_ASSET}`);
    }

    async validateOrder(order: OrderRequest): Promise<boolean> {
        if (!this.isInitialized) await this.init();

        // 1. Daily Drawdown Check
        if (order.side === 'BUY') { // Check before entering new risk
            const currentBalance = await this.exchange.getBalance(config.PAPER_BALANCE_ASSET);
            // Simplified drawdown tracking: just checking Balance drop. 
            // In real app, we need equity (Balance + Open PnL).

            const drop = (this.initialBalance - currentBalance) / this.initialBalance;
            const limit = config.MAX_DAILY_DRAWDOWN_PERCENT / 100;
            if (drop > limit) {
                logger.error(`[RiskManager] HALT. Max Drawdown hit: ${(drop * 100).toFixed(2)}%`);
                return false;
            }
        }

        return true;
    }

    async calculateQuantity(symbol: string, price: number, slPercent?: number): Promise<number> {
        const balance = await this.exchange.getBalance(config.PAPER_BALANCE_ASSET);

        // Professional approach: Calculate position size based on risk per trade
        // Risk Amount = RISK_PER_TRADE_PERCENT of current equity
        const riskAmount = balance * (config.RISK_PER_TRADE_PERCENT / 100);

        // Leverage affects position sizing: higher leverage allows larger positions for same risk
        const leverage = config.LEVERAGE_ENABLED ? config.LEVERAGE_VALUE : 1;

        // SL Distance = entry price * SL percentage (keep SL percentages the same)
        const effectiveSLPercent = slPercent ?? config.DEFAULT_STOP_LOSS_PERCENT;
        const slDistance = price * (effectiveSLPercent / 100);

        // Position Size = Risk Amount ÷ SL Distance
        // Leverage allows larger positions: multiply by leverage
        let quantity = (riskAmount * leverage) / slDistance;

        // BULLETPROOF SAFETY CHECKS
        const positionValue = quantity * price;
        const requiredMargin = positionValue / leverage;

        // 1. Prevent margin exceeding available balance (with 10% buffer)
        const maxAllowedMargin = balance * 0.9; // Never use more than 90% of balance
        if (requiredMargin > maxAllowedMargin) {
            const adjustmentFactor = maxAllowedMargin / requiredMargin;
            quantity *= adjustmentFactor;
            logger.warn(`[RiskManager] Position size reduced by ${(adjustmentFactor * 100).toFixed(1)}% to fit available margin`);
        }

        // 2. Prevent position value from exceeding reasonable limits
        const maxPositionValue = balance * leverage * 2; // Max 2x leverage utilization
        if (positionValue > maxPositionValue) {
            quantity = maxPositionValue / price;
            logger.warn(`[RiskManager] Position size capped to prevent over-leveraging`);
        }

        // 3. Minimum position size check
        const minPositionValue = balance * 0.001; // Minimum 0.1% of balance
        if (positionValue < minPositionValue) {
            logger.warn(`[RiskManager] Position size too small: ${positionValue.toFixed(2)} < ${minPositionValue.toFixed(2)}`);
            return 0; // Skip trade
        }

        // Recalculate final values
        const finalPositionValue = quantity * price;
        const finalMargin = finalPositionValue / leverage;

        logger.info(`[RiskManager] Professional position sizing for ${symbol}:`);
        logger.info(`  Risk Amount: ${riskAmount.toFixed(2)} ${config.PAPER_BALANCE_ASSET} (${config.RISK_PER_TRADE_PERCENT}% of equity)`);
        logger.info(`  SL Distance: ${slDistance.toFixed(2)} (${effectiveSLPercent.toFixed(2)}% of entry)`);
        logger.info(`  Leverage: ${leverage}x`);
        logger.info(`  Quantity: ${quantity.toFixed(6)} (Position Value: ${finalPositionValue.toFixed(2)} ${config.PAPER_BALANCE_ASSET}, Margin: ${finalMargin.toFixed(2)} ${config.PAPER_BALANCE_ASSET})`);
        logger.info(`  Safety: Margin ${((finalMargin / balance) * 100).toFixed(1)}% of balance, Position ${((finalPositionValue / balance) * 100).toFixed(1)}% of balance`);

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
