import { StrategyManager } from '../core/strategy.manager';
import { PaperExchange } from '../adapters/exchange/paper';
import { BinancePublicData } from '../adapters/data/binance_public';
import { Candle, OrderRequest } from '../core/types';
import { SupabaseDataStore } from '../adapters/database/supabase';

export class BacktestRunner {
    private exchange: PaperExchange;
    private db: SupabaseDataStore;

    constructor() {
        // Shared Data Provider
        const publicData = new BinancePublicData();
        this.exchange = new PaperExchange(publicData);
        this.db = new SupabaseDataStore();
    }

    async run(strategyName: string, symbol: string, interval: string) {
        console.log(`[Backtest] Running ${strategyName} on ${symbol} ${interval}...`);

        // 1. Get History (Mocking 1000 candles)
        const candles = await this.exchange.getCandles(symbol, interval, 1000);
        const strategy = StrategyManager.getStrategy(strategyName);
        strategy.init({});

        let tradesCount = 0;

        // 2. Iterate
        // Note: A real backtester needs to feed candles in one by one and maintain state carefully.
        // This is a simplified "loop" version.
        for (let i = 50; i < candles.length; i++) {
            const slice = candles.slice(0, i + 1); // Historical context
            const currentCandle = candles[i];

            const signal = await strategy.update(currentCandle);

            if (signal && signal.action !== 'HOLD') {
                // Execute on Paper Exchange (Simulate)
                // In backtest, we might skip the "Balance check" strictness or reset it, 
                // here we reuse the logic from PaperExchange.
                try {
                    const order = await this.exchange.placeOrder({
                        symbol,
                        side: signal.action as 'BUY' | 'SELL',
                        type: 'MARKET',
                        quantity: 0.1 // Fixed
                    });
                    tradesCount++;

                    // Save result to DB (optional, maybe flag as backtest)
                    const trade = { ...order, id: `bt-${order.id}`, orderId: order.id, commission: 0 };
                    // await this.db.saveTrade(trade); // Don't spam DB with backtest data by default
                } catch (e) {
                    // Ignore funds error in simple loop
                }
            }
        }

        // 3. Report
        const finalBalance = await this.exchange.getBalance('USDT');
        // const results = { trades: tradesCount, finalBalance };
        // await this.db.saveBacktestResult(results);

        console.log('--- Backtest Complete ---');
        console.log(`Trades: ${tradesCount}`);
        console.log(`Final USDT: ${finalBalance}`);
    }
}

// Simple CLI runner if executed directly
if (require.main === module) {
    const runner = new BacktestRunner();
    runner.run('SMA_CROSSOVER', 'BTC/USDT', '1h');
}
