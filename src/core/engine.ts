import { IExchange } from '../interfaces/exchange.interface';
import { IStrategy } from '../interfaces/strategy.interface';
import { IDataStore } from '../interfaces/repository.interface';
import { ExchangeFactory } from '../adapters/exchange/factory';
import { StrategyManager } from './strategy.manager';
import { SupabaseDataStore } from '../adapters/database/supabase';
import { OrderRequest } from './types';
import { logger } from './logger';
import { RiskManager } from './risk.manager';

export class BotEngine {
    private exchange: IExchange;
    private strategy: IStrategy;
    private db: IDataStore;
    private riskManager: RiskManager;
    private isRunning: boolean = false;

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

    async stop() {
        this.isRunning = false;
        logger.info('[BotEngine] Stopped.');
    }

    private async runLoop(symbol: string, interval: string) {
        while (this.isRunning) {
            try {
                // 1. Fetch Data
                const candles = await this.exchange.getCandles(symbol, interval, 200);
                if (candles.length === 0) continue;

                const lastCandle = candles[candles.length - 1];

                // 2. Strategy Update
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
                        if (!isSafe) continue;

                        // 4. Execution
                        const order = await this.exchange.placeOrder(orderRequest);

                        // 5. Persistence
                        await this.db.saveTrade({
                            id: order.id,
                            orderId: order.id,
                            symbol: order.symbol,
                            side: order.side,
                            quantity: order.quantity,
                            price: order.price,
                            timestamp: order.timestamp
                        });
                    }
                }
            } catch (error) {
                logger.error('[BotEngine] Error in loop:', error);
            }

            // Wait for next tick (simulated)
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
}
