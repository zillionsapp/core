import { OrderRequest } from './types';
import { logger } from './logger';
import { IExchange } from '../interfaces/exchange.interface';
import { config } from '../config/env';

// Hardcoded limits for MVP - should be config driven
const MAX_ORDER_AMOUNT_USDT = 10000;
const DAILY_LOSS_LIMIT_PERCENT = 0.05; // 5%

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

        const ticker = await this.exchange.getTicker(order.symbol);
        const estimatedValue = order.quantity * ticker.price;

        // 1. Max Order Value Check
        if (estimatedValue > MAX_ORDER_AMOUNT_USDT) {
            logger.warn(`[RiskManager] REJECTED order. Value ${estimatedValue} > Limit ${MAX_ORDER_AMOUNT_USDT}`);
            return false;
        }

        // 2. Daily Drawdown Check
        if (order.side === 'BUY') { // Check before entering new risk
            const currentBalance = await this.exchange.getBalance(config.PAPER_BALANCE_ASSET);
            // Simplified drawdown tracking: just checking Balance drop. 
            // In real app, we need equity (Balance + Open PnL).

            const drop = (this.initialBalance - currentBalance) / this.initialBalance;
            if (drop > DAILY_LOSS_LIMIT_PERCENT) {
                logger.error(`[RiskManager] HALT. Max Drawdown hit: ${(drop * 100).toFixed(2)}%`);
                return false;
            }
        }

        return true;
    }

    calculateExitPrices(entryPrice: number, side: 'BUY' | 'SELL',
        signalSL?: number, signalTP?: number): { stopLoss: number, takeProfit: number } {

        // Use Defaults from Config (or hardcoded for now until config is wired)
        // Hardcoded as fallback if config import fails or is circular, but ideally use config.
        const defaultSL = 0.05; // 5%
        const defaultTP = 0.10; // 10%

        let stopLoss = 0;
        let takeProfit = 0;

        if (side === 'BUY') {
            stopLoss = signalSL ? signalSL : entryPrice * (1 - defaultSL);
            takeProfit = signalTP ? signalTP : entryPrice * (1 + defaultTP);
        } else {
            // SHORT logic (future proofing)
            stopLoss = signalSL ? signalSL : entryPrice * (1 + defaultSL);
            takeProfit = signalTP ? signalTP : entryPrice * (1 - defaultTP);
        }

        return { stopLoss, takeProfit };
    }
}
