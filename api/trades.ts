import { SupabaseDataStore } from '../src/adapters/database/supabase';

export default async function handler(req: any, res: any) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const db = new SupabaseDataStore();
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
        res.status(200).json({ trades, total });
    } catch (error: any) {
        console.error('Trades API error:', error);
        res.status(500).json({ error: error.message });
    }
}
