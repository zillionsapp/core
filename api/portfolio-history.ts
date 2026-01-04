import { SupabaseDataStore } from '../src/adapters/database/supabase';

export default async function handler(req: any, res: any) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const db = new SupabaseDataStore();
        const period = req.query.period as string || 'all';

        // Use the chart cache logic which is synchronized with the main app
        const snapshots = await db.getChartCache(period);

        res.status(200).json(snapshots);
    } catch (error: any) {
        console.error('Portfolio history API error:', error);
        res.status(500).json({ error: error.message });
    }
}
