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

    async calculateQuantity(symbol: string, price: number): Promise<number> {
        const balance = await this.exchange.getBalance(config.PAPER_BALANCE_ASSET);
        const tradeValue = balance * (config.POSITION_SIZE_PERCENT / 100);
        const quantity = tradeValue / price;

        logger.info(`[RiskManager] Calculated quantity for ${symbol}: ${quantity.toFixed(6)} (Value: ${tradeValue.toFixed(2)} ${config.PAPER_BALANCE_ASSET})`);
        return quantity;
    }

    calculateExitPrices(entryPrice: number, side: 'BUY' | 'SELL',
        signalSL?: number, signalTP?: number): { stopLoss: number, takeProfit: number } {

        // Use signal percentages if provided, otherwise use defaults from config
        // All values are percentages (e.g., 5 means 5%)
        const slPercent = (signalSL ?? config.DEFAULT_STOP_LOSS_PERCENT) / 100;
        const tpPercent = (signalTP ?? config.DEFAULT_TAKE_PROFIT_PERCENT) / 100;

        let stopLoss = 0;
        let takeProfit = 0;

        if (side === 'BUY') {
            stopLoss = entryPrice * (1 - slPercent);
            takeProfit = entryPrice * (1 + tpPercent);
        } else {
            // SHORT logic (future proofing)
            stopLoss = entryPrice * (1 + slPercent);
            takeProfit = entryPrice * (1 - tpPercent);
        }

        return { stopLoss, takeProfit };
    }
}
