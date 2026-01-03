import { SupabaseDataStore } from '../src/adapters/database/supabase';
import { PortfolioManager } from '../src/core/portfolio.manager';
import { ExchangeFactory } from '../src/adapters/exchange/factory';
import { RealTimeProvider } from '../src/core/time.provider';

export default async function handler(req: any, res: any) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const db = new SupabaseDataStore();
        const exchange = ExchangeFactory.getExchange();
        const portfolioManager = new PortfolioManager(exchange, db, new RealTimeProvider());

        // Generate a LIVE snapshot instead of fetching cached one
        const snapshot = await portfolioManager.generateSnapshot();

        if (!snapshot) {
            return res.status(404).json({ error: 'Failed to generate portfolio snapshot' });
        }

        res.status(200).json(snapshot);
    } catch (error: any) {
        console.error('Portfolio API error:', error);
        res.status(500).json({ error: error.message });
    }
}
