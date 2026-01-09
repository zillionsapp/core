import { BinancePublicData } from '../src/adapters/data/binance_public';

export default async function handler(req: any, res: any) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const symbols = (req.query.symbols as string)?.split(',').filter(s => s.trim()) || [];
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

        res.status(200).json(prices);
    } catch (error: any) {
        console.error('Prices API error:', error);
        res.status(500).json({ error: error.message });
    }
}
