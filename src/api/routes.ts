import { Router } from 'express';
import { SupabaseDataStore } from '../adapters/database/supabase';
import { BacktestRunner } from '../backtest/runner';
import { BinancePublicData } from '../adapters/data/binance_public';

const router = Router();
const db = new SupabaseDataStore();

// GET /api/portfolio - Latest portfolio snapshot
/**
 * Retrieves the most recent portfolio snapshot.
 * Returns 404 if no snapshot is found.
 */
router.get('/portfolio', async (req, res) => {
    try {
        const snapshot = await db.getLatestPortfolioSnapshot();
        if (!snapshot) {
            return res.status(404).json({ error: 'No portfolio snapshots found' });
        }
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.json(snapshot);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/portfolio-history - Historical portfolio snapshots (cached)
/**
 * Retrieves historical portfolio chart data from cache.
 * @query period - Time period filter (default: 'all')
 */
router.get('/portfolio-history', async (req, res) => {
    try {
        const period = req.query.period as string || 'all';
        const snapshots = await db.getChartCache(period);
        res.json(snapshots);
    } catch (error: any) {
        console.error('[API] Error fetching portfolio history:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/trades - Recent execution history
router.get('/trades', async (req, res) => {
    try {
        const symbol = req.query.symbol as string;
        const limit = parseInt(req.query.limit as string) || 50;
        const offset = parseInt(req.query.offset as string) || 0;

        // Get both closed and open trades
        const allTradesHistory = await db.getTrades(symbol);
        const closedTrades = allTradesHistory.filter(t => t.status === 'CLOSED');
        const openTrades = await db.getOpenTrades();

        // Filter open trades by symbol if specified
        const filteredOpenTrades = symbol ? openTrades.filter(t => t.symbol === symbol) : openTrades;

        // Combine and sort by timestamp (most recent first)
        const rawCombined = [...closedTrades, ...filteredOpenTrades.map(t => ({
            ...t,
            status: 'OPEN' as const,
            exitPrice: undefined
        }))];

        // Deduplicate by ID
        const seenIds = new Set();
        const allTrades = rawCombined.filter(t => {
            if (seenIds.has(t.id)) return false;
            seenIds.add(t.id);
            return true;
        }).sort((a, b) => b.timestamp - a.timestamp);

        console.log(`[API] Trades: raw=${rawCombined.length}, deduped=${allTrades.length}, open=${filteredOpenTrades.length}`);

        const total = allTrades.length;

        // Apply pagination
        const trades = allTrades.slice(offset, offset + limit);

        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.json({ trades, total });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/prices - Current market prices for symbols
router.get('/prices', async (req, res) => {
    try {
        const symbols = (req.query.symbols as string)?.split(',') || [];
        const marketData = new BinancePublicData();

        const prices: { [symbol: string]: number } = {};
        for (const symbol of symbols) {
            try {
                const ticker = await marketData.getTicker(symbol);
                prices[symbol] = ticker.price;
            } catch (error) {
                console.warn(`Failed to get price for ${symbol}:`, error);
                prices[symbol] = 0; // Fallback
            }
        }

        res.json(prices);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/backtests - Backtest result history
router.get('/backtests', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit as string) || 10;
        const results = await db.getBacktestResults(limit);
        res.json(results);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/backtest/run - Trigger a new backtest
router.post('/backtest/run', async (req, res) => {
    try {
        const { strategyName, symbol, interval } = req.body;

        if (!strategyName || !symbol || !interval) {
            return res.status(400).json({ error: 'Missing required parameters: strategyName, symbol, interval' });
        }

        const runner = new BacktestRunner();
        const result = await runner.run(strategyName, symbol, interval);

        res.json({
            message: 'Backtest completed successfully',
            result
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
