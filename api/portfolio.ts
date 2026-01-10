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

        // Get current total deposited balance from vault transactions
        const vaultTransactions = await db.getVaultTransactions();
        let currentTotalDeposited = 0;
        if (vaultTransactions) {
            currentTotalDeposited = vaultTransactions.reduce((sum: number, tx: any) => {
                if (tx.type === 'DEPOSIT') return sum + Number(tx.amount);
                if (tx.type === 'WITHDRAWAL') return sum - Number(tx.amount);
                if (tx.type === 'COMMISSION_EARNED') return sum + Number(tx.amount);
                if (tx.type === 'COMMISSION_PAID') return sum + Number(tx.amount);
                return sum;
            }, 0);
        }

        // Get current open trades to calculate unrealized PnL
        const openTrades = await db.getOpenTrades();
        let currentUnrealizedPnL = 0;
        if (openTrades?.length > 0) {
            const symbols = [...new Set(openTrades.map((trade: any) => trade.symbol))];
            if (symbols.length > 0) {
                try {
                    const pricesResponse = await fetch(`${process.env.API_BASE_URL || 'http://localhost:3000'}/api/prices?symbols=${symbols.join(',')}`);
                    const prices = await pricesResponse.json() as Record<string, number>;

                    if (prices) {
                        openTrades.forEach((trade: any) => {
                            const currentPrice = prices[trade.symbol];
                            if (!currentPrice) return;

                            const entryPrice = Number(trade.price);
                            const quantity = Number(trade.quantity);

                            const dollarPnL = trade.side === 'BUY'
                                ? (currentPrice - entryPrice) * quantity
                                : (entryPrice - currentPrice) * quantity;

                            currentUnrealizedPnL += dollarPnL;
                        });
                    }
                } catch (pricesError) {
                    console.error('Error fetching prices for unrealized PnL:', pricesError);
                }
            }
        }

        // Adjust based on difference between current deposited and snapshot's initial balance
        const snapshotInitialBalance = snapshot.initialBalance || 0;
        const snapshotUnrealizedPnL = (snapshot.currentEquity || 0) - (snapshot.walletBalance || 0);

        const depositedAdjustment = currentTotalDeposited - snapshotInitialBalance;
        const unrealizedPnLAdjustment = currentUnrealizedPnL - snapshotUnrealizedPnL;

        snapshot.currentBalance = Math.max(0, (snapshot.currentBalance || 0) + depositedAdjustment);
        snapshot.currentEquity = (snapshot.currentEquity || 0) + depositedAdjustment + unrealizedPnLAdjustment;
        snapshot.walletBalance = snapshot.currentBalance;

        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.status(200).json(snapshot);
    } catch (error: any) {
        console.error('Portfolio API error:', error);
        res.status(500).json({ error: error.message });
    }
}
