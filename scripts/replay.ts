import { BotEngine } from '../src/core/engine';
import { SimulationTimeProvider } from '../src/backtest/simulation.time.provider';
import { PaperExchange } from '../src/adapters/exchange/paper';
import { MemoryDataProvider } from '../src/adapters/data/memory_data';
import { BinancePublicData } from '../src/adapters/data/binance_public';
import { config } from '../src/config/env';
import { SupabaseDataStore } from '../src/adapters/database/supabase';
import { Candle } from '../src/core/types';
import { logger } from '../src/core/logger';

/**
 * Replay Script
 * 
 * Replays a historical period using the current trading configuration.
 * Results are stored in Supabase just like live trading.
 * 
 * Usage: ts-node scripts/replay.ts [symbol] [interval] [days]
 */

async function fetchHistoricalCandles(symbol: string, interval: string, days: number): Promise<Candle[]> {
    const publicData = new BinancePublicData();
    const candles: Candle[] = [];

    // Estimate total candles needed
    // 1h = 24/day, 15m = 96/day
    // Binance limit is 1000
    const msInDay = 24 * 60 * 60 * 1000;
    const startTime = Date.now() - (days * msInDay);
    let currentEndTime = Date.now();

    logger.info(`Fetching historical candles for ${symbol} ${interval} from ${new Date(startTime).toISOString()}...`);

    while (true) {
        const chunk = await publicData.getCandles(symbol, interval, 1000, currentEndTime);
        if (chunk.length === 0) break;

        // Binance returns older candles first? 
        // Actually, klines returns up to 1000 candles ENDING at endTime.
        // So the first one is the oldest in the chunk.

        const chunkStartTime = chunk[0].startTime;

        // Add chunk to the beginning of our list (since we are going backwards)
        candles.unshift(...chunk);

        if (chunkStartTime < startTime || chunk.length < 1000) {
            break;
        }

        // Update currentEndTime to the earliest candle in this chunk
        currentEndTime = chunkStartTime - 1;
    }

    // Filter out duplicates and sort by time
    const unique = Array.from(new Map(candles.map(c => [c.startTime, c])).values());
    return unique.sort((a, b) => a.startTime - b.startTime).filter(c => c.startTime >= startTime);
}

async function runReplay() {
    const args = process.argv.slice(2);
    const symbol = args[0] || config.STRATEGY_SYMBOL;
    const interval = args[1] || config.STRATEGY_INTERVAL;
    const days = parseInt(args[2] || '10');
    const strategyName = config.STRATEGY_NAME;

    logger.info(`[Replay] Starting replay for ${strategyName} on ${symbol} ${interval} for the last ${days} days`);

    // 1. Fetch all candles for the period
    const allCandles = await fetchHistoricalCandles(symbol, interval, days);
    if (allCandles.length === 0) {
        logger.error('No candles fetched. Exiting.');
        return;
    }

    logger.info(`[Replay] Fetched ${allCandles.length} candles.`);

    // 2. Setup Simulation Environment
    const timeProvider = new SimulationTimeProvider();
    const memoryData = new MemoryDataProvider([]);
    const db = new SupabaseDataStore(); // Using production DB as requested

    const exchange = new PaperExchange(memoryData, timeProvider, undefined, db);

    // We pass the exchange and db to BotEngine to override defaults
    const engine = new BotEngine(strategyName, timeProvider, exchange, db);

    // 3. Replay Loop
    // We need at least some lookback for indicators
    const lookback = 100; // Typical lookback for indicators

    for (let i = lookback; i < allCandles.length; i++) {
        const currentCandle = allCandles[i];

        // Update simulation time
        timeProvider.setTime(currentCandle.closeTime || currentCandle.startTime + (TimeUtils.getIntervalMs(interval)));

        // Update memory data with candles up to now
        memoryData.setCandles(allCandles.slice(0, i + 1));

        // Run one tick
        // Note: engine.tick normally fetches candles itself. 
        // Our memoryData will return the candles up to our current simulation time.
        await engine.tick(symbol, interval);

        if (i % 100 === 0) {
            logger.info(`[Replay] Progress: ${((i / allCandles.length) * 100).toFixed(1)}%`);
        }
    }

    logger.info('[Replay] Completed.');
}

// Minimal TimeUtils helper since we need getIntervalMs
class TimeUtils {
    static getIntervalMs(interval: string): number {
        const unit = interval.slice(-1);
        const value = parseInt(interval.slice(0, -1));
        switch (unit) {
            case 'm': return value * 60 * 1000;
            case 'h': return value * 60 * 60 * 1000;
            case 'd': return value * 24 * 60 * 60 * 1000;
            default: return 60 * 1000;
        }
    }
}

runReplay().catch(err => {
    logger.error('[Replay] Fatal error:', err);
});
