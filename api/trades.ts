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

        // Get total count for pagination
        const allTrades = await db.getTrades(symbol, 10000); // Get a large number to count
        const total = allTrades.length;

        const trades = await db.getTrades(symbol, limit, offset);

        res.status(200).json({ trades, total });
    } catch (error: any) {
        console.error('Trades API error:', error);
        res.status(500).json({ error: error.message });
    }
}
