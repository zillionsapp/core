import { SupabaseDataStore } from '../src/adapters/database/supabase';

export default async function handler(req: any, res: any) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const db = new SupabaseDataStore();
        const limit = parseInt(req.query.limit as string) || 50;

        // Get historical portfolio snapshots ordered by timestamp
        const { data, error } = await (db as any).supabase
            .from('portfolio_snapshots')
            .select('*')
            .order('timestamp', { ascending: true })
            .limit(limit);

        if (error) {
            console.error('Portfolio history API error:', error);
            return res.status(500).json({ error: error.message });
        }

        // Transform the data to match our interface
        const snapshots = (data || []).map((snapshot: any) => ({
            timestamp: snapshot.timestamp,
            totalValue: snapshot.totalValue,
            holdings: snapshot.holdings || {},
            pnl: snapshot.pnl || 0,
            pnlPercentage: snapshot.pnlPercentage || 0,
            winRate: snapshot.winRate || 0,
            profitFactor: snapshot.profitFactor || 0,
            winningTrades: snapshot.winningTrades || 0,
            losingTrades: snapshot.losingTrades || 0,
            openTrades: snapshot.openTrades || [],
            closedTrades: snapshot.closedTrades || [],
            currentEquity: snapshot.currentEquity || snapshot.totalValue,
            currentBalance: snapshot.currentBalance || snapshot.totalValue
        }));

        res.status(200).json(snapshots);
    } catch (error: any) {
        console.error('Portfolio history API error:', error);
        res.status(500).json({ error: error.message });
    }
}
