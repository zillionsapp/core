import { SupabaseDataStore } from '../src/adapters/database/supabase';

export default async function handler(req: any, res: any) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const db = new SupabaseDataStore();
        const snapshot = await db.getLatestPortfolioSnapshot();

        if (!snapshot) {
            return res.status(404).json({ error: 'No portfolio snapshots found' });
        }

        res.status(200).json(snapshot);
    } catch (error: any) {
        console.error('Portfolio API error:', error);
        res.status(500).json({ error: error.message });
    }
}
