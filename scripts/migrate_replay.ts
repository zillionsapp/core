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
 * Vault Migration Replay Script
 * 
 * This script replays trading history starting from the very first vault deposit.
 * It uses the VaultManager's time-awareness to simulate capital injections
 * at the correct historical moments.
 * 
 * Usage: ts-node scripts/migrate_replay.ts [symbol] [interval]
 */

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

async function fetchHistoricalCandles(symbol: string, interval: string, startTime: number): Promise<Candle[]> {
    const publicData = new BinancePublicData();
    const candles: Candle[] = [];
    const endTime = Date.now();

    logger.info(`Fetching historical candles for ${symbol} ${interval} from ${new Date(startTime).toISOString()}...`);

    let currentEndTime = endTime;
    while (true) {
        const chunk = await publicData.getCandles(symbol, interval, 1000, currentEndTime);
        if (chunk.length === 0) break;

        const chunkStartTime = chunk[0].startTime;
        candles.unshift(...chunk);

        if (chunkStartTime <= startTime || chunk.length < 1000) {
            break;
        }

        currentEndTime = chunkStartTime - 1;
    }

    const unique = Array.from(new Map(candles.map(c => [c.startTime, c])).values());
    const sorted = unique.sort((a, b) => a.startTime - b.startTime);
    // Be generous with lookback
    return sorted.filter(c => c.startTime >= startTime || (sorted.length - sorted.indexOf(c) <= 300));
}

async function runMigrateReplay() {
    const args = process.argv.slice(2);
    const symbol = args[0] || config.STRATEGY_SYMBOL;
    const interval = args[1] || config.STRATEGY_INTERVAL;
    const strategyName = config.STRATEGY_NAME;

    const db = new SupabaseDataStore();

    // 1. Find the earliest deposit timestamp
    const transactions = await db.getVaultTransactions();
    if (transactions.length === 0) {
        logger.error('No vault transactions found. Run npm run migrate:data first.');
        return;
    }

    const firstDepositTime = Math.min(...transactions.map(t => t.timestamp));
    logger.info(`[MigrateReplay] First deposit found at ${new Date(firstDepositTime).toLocaleString()}`);

    // 2. Fetch all candles for the period
    // Add 150 candles of lookback BEFORE the first deposit to warm up indicators
    const intervalMs = TimeUtils.getIntervalMs(interval);
    const lookbackCount = 150;
    const startTime = firstDepositTime - (lookbackCount * intervalMs);

    const allCandles = await fetchHistoricalCandles(symbol, interval, startTime);

    if (allCandles.length === 0) {
        logger.error('No candles fetched. Exiting.');
        return;
    }

    logger.info(`[MigrateReplay] Fetched ${allCandles.length} candles.`);

    // 3. Setup Simulation Environment
    const timeProvider = new SimulationTimeProvider();
    const memoryData = new MemoryDataProvider([]);

    // Create PaperExchange - it will internally create its own simulation-synced VaultManager
    const exchange = new PaperExchange(memoryData, timeProvider, undefined, db);
    const engine = new BotEngine(strategyName, timeProvider, exchange, db);

    // 4. Replay Loop
    // Start at exactly the first deposit time
    const startIndex = allCandles.findIndex(c => c.startTime >= firstDepositTime);
    if (startIndex === -1) {
        logger.error('Could not find first deposit time in candle set.');
        return;
    }

    logger.info(`[MigrateReplay] Starting simulation loop from candle index ${startIndex}...`);

    for (let i = startIndex; i < allCandles.length; i++) {
        const currentCandle = allCandles[i];

        // Update simulation time to the CLOSE of the candle
        const candleTime = currentCandle.closeTime || (currentCandle.startTime + intervalMs);
        timeProvider.setTime(candleTime);

        // Update memory data with ALL candles up to this point (for indicators)
        memoryData.setCandles(allCandles.slice(0, i + 1));

        // Periodically log progress and current simulation balance
        if (i % 20 === 0 || i === startIndex) {
            const vaultManager = (exchange as any).getVaultManager?.();
            const currentBalance = await vaultManager?.getTotalDepositedBalance() || 0;
            logger.info(`[MigrateReplay] Progress: ${(((i - startIndex) / (allCandles.length - startIndex)) * 100).toFixed(1)}% | SimTime: ${new Date(timeProvider.now()).toLocaleString()} | Avail. Capital: $${currentBalance.toFixed(2)}`);
        }

        // Run one tick
        await engine.tick(symbol, interval);
    }

    logger.info('[MigrateReplay] Completed successfully.');
}

runMigrateReplay().catch(err => {
    logger.error('[MigrateReplay] Fatal error:', err);
});
