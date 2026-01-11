import { BotEngine } from '../src/core/engine';
import { SimulationTimeProvider } from '../src/backtest/simulation.time.provider';
import { PaperExchange } from '../src/adapters/exchange/paper';
import { MemoryDataProvider } from '../src/adapters/data/memory_data';
import { BinancePublicData } from '../src/adapters/data/binance_public';
import { config } from '../src/config/env';
import { SupabaseDataStore } from '../src/adapters/database/supabase';
import { Candle } from '../src/core/types';
import { logger } from '../src/core/logger';
import { TimeUtils } from '../src/core/time.utils';

/**
 * Replay Script
 * 
 * Replays a historical period using the current trading configuration.
 * Results are stored in Supabase just like live trading.
 * 
 * IMPORTANT: This replay script functions identically to the production bot:
 * - Uses the same BotEngine, VaultManager, CommissionManager, and PortfolioManager
 * - Vault transactions are filtered by simulation time (deposits only count after their timestamp)
 * - Commission payments use trade timestamps
 * - Portfolio snapshots use simulation time
 * 
 * After running `npm run replay`, you can run `npm start` and it will continue
 * from the current real-time, seamlessly transitioning to live trading.
 * 
 * Usage: npm run replay [symbol] [interval] [days]
 * Example: npm run replay BTC/USDT 1h 120
 */

async function fetchHistoricalCandles(symbol: string, interval: string, days: number): Promise<Candle[]> {
    const publicData = new BinancePublicData();
    const candles: Candle[] = [];

    // Estimate total candles needed
    // 1h = 24/day, 15m = 96/day
    // Binance limit is 1000
    const msInDay = 24 * 60 * 60 * 1000;
    const startTime = Date.now() - (days * msInDay);
    let currentEndTime = Date.now() - msInDay;;

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
    const days = parseInt(args[2] || '200');
    const strategyName = config.STRATEGY_NAME;

    logger.info(`[Replay] =========================================`);
    logger.info(`[Replay] Starting replay for ${strategyName} on ${symbol} ${interval}`);
    logger.info(`[Replay] Replaying last ${days} days of historical data`);
    logger.info(`[Replay] Vault mode: ${config.VAULT_ENABLED ? 'enabled' : 'disabled'}`);
    logger.info(`[Replay] =========================================`);

    // 1. Fetch all candles for the period
    const allCandles = await fetchHistoricalCandles(symbol, interval, days);
    if (allCandles.length === 0) {
        logger.error('No candles fetched. Exiting.');
        return;
    }

    logger.info(`[Replay] Fetched ${allCandles.length} candles.`);
    logger.info(`[Replay] From: ${new Date(allCandles[0].startTime).toISOString()}`);
    logger.info(`[Replay] To: ${new Date(allCandles[allCandles.length - 1].startTime).toISOString()}`);
    logger.info(`[Replay] =========================================`);

    // 2. Setup Simulation Environment
    // CRITICAL: Use SimulationTimeProvider to ensure:
    // - VaultManager filters transactions by simulation time
    // - PortfolioManager uses simulation time for snapshots
    // - CommissionManager uses trade timestamps
    const timeProvider = new SimulationTimeProvider();
    const memoryData = new MemoryDataProvider([]);
    const db = new SupabaseDataStore(); // Using production DB as requested

    // Create PaperExchange with shared timeProvider
    // This ensures the internal VaultManager uses the same time provider
    const exchange = new PaperExchange(memoryData, timeProvider, undefined, db);

    // Create BotEngine with shared timeProvider
    // BotEngine will use this timeProvider for all time-sensitive operations
    const engine = new BotEngine(strategyName, timeProvider, exchange, db);

    // Initialize exchange (loads vault balance if VAULT_ENABLED)
    await exchange.start();

    // 3. Replay Loop
    // We need at least some lookback for indicators (typically 100+ candles)
    const lookback = Math.max(100, config.BACKTEST_CANDLE_COUNT || 100);

    logger.info(`[Replay] Starting replay loop with lookback: ${lookback} candles`);

    for (let i = lookback; i < allCandles.length; i++) {
        const currentCandle = allCandles[i];

        // CRITICAL: Update simulation time BEFORE processing this candle
        // This ensures all time-sensitive operations (vault filtering, commission timestamps)
        // use the correct simulation time
        const candleEndTime = currentCandle.closeTime || currentCandle.startTime + TimeUtils.parseIntervalToMs(interval);
        timeProvider.setTime(candleEndTime);

        // Update memory data with candles up to now
        // This ensures the engine sees historical data up to the simulation time
        memoryData.setCandles(allCandles.slice(0, i + 1));

        // Run one tick - this will:
        // 1. Recover active trade state (filtered by simulation time)
        // 2. Fetch candles (already in memoryData, filtered by time)
        // 3. Check and manage positions (SL/TP checks use simulation time)
        // 4. Update strategy and process signals
        // 5. Place orders if needed (order timestamps use simulation time)
        await engine.tick(symbol, interval);

        if (i % 100 === 0 || i === lookback) {
            const progress = ((i / allCandles.length) * 100).toFixed(1);
            const simTime = new Date(timeProvider.now()).toISOString();
            logger.info(`[Replay] Progress: ${progress}% | Sim Time: ${simTime} | Candle: ${i}/${allCandles.length}`);
        }
    }

    // 4. Close all remaining open positions at the end of replay
    // This ensures a clean transition to real-time trading without leaving
    // historical positions open
    /* const openTrades = await db.getOpenTrades();
    if (openTrades.length > 0) {
        logger.info(`[Replay] Closing ${openTrades.length} remaining open positions at end of replay`);

        for (const trade of openTrades) {
            // Force close at current market price
            await engine['tradeManager'].forceClosePosition(trade, 'REPLAY_END');
            logger.info(`[Replay] Closed position ${trade.id} (${trade.side}) at replay end`);
        }

        // Save final portfolio snapshot after closing positions
        await engine['portfolioManager'].saveSnapshot();
    } */

    logger.info(`[Replay] =========================================`);
    logger.info(`[Replay] Replay completed!`);
    logger.info(`[Replay] Final simulation time: ${new Date(timeProvider.now()).toISOString()}`);
    logger.info(`[Replay] You can now run 'npm start' to continue into real-time`);
    logger.info(`[Replay] =========================================`);
}

runReplay().catch(err => {
    logger.error('[Replay] Fatal error:', err);
    process.exit(1);
});
