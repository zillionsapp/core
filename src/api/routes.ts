import { Router } from 'express';
import { SupabaseDataStore } from '../adapters/database/supabase';
import { BacktestRunner } from '../backtest/runner';

const router = Router();
const db = new SupabaseDataStore();

// GET /api/portfolio - Latest portfolio snapshot
router.get('/portfolio', async (req, res) => {
    try {
        const snapshot = await db.getLatestPortfolioSnapshot();
        if (!snapshot) {
            return res.status(404).json({ error: 'No portfolio snapshots found' });
        }
        res.json(snapshot);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/trades - Recent execution history
router.get('/trades', async (req, res) => {
    try {
        const symbol = req.query.symbol as string;
        const limit = parseInt(req.query.limit as string) || 50;
        const trades = await db.getTrades(symbol, limit);
        res.json(trades);
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
