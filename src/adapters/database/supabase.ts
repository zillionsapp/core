import { IDataStore, PortfolioSnapshot } from '../../interfaces/repository.interface';
import { Trade } from '../../core/types';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../../config/env';

export class SupabaseDataStore implements IDataStore {
    private supabase: SupabaseClient | null = null;
    private inMemoryTrades: Trade[] = [];

    constructor() {
        if (config.SUPABASE_URL && config.SUPABASE_KEY) {
            this.supabase = createClient(config.SUPABASE_URL, config.SUPABASE_KEY);
        } else {
            console.warn('[SupabaseDataStore] Missing credentials. Running in InMemory mode (data will be lost).');
        }
    }

    async saveTrade(trade: Trade): Promise<void> {
        if (!this.supabase) {
            console.log('[InMemoryDB] Saved trade:', trade.id);
            this.inMemoryTrades.push(trade);
            return;
        }
        const { error } = await this.supabase.from('trades').insert(trade);
        if (error) console.error('Error saving trade:', error);
    }

    async getTrades(symbol?: string, limit?: number, offset?: number): Promise<Trade[]> {
        if (!this.supabase) {
            let trades = [...this.inMemoryTrades];
            if (symbol) {
                trades = trades.filter(t => t.symbol === symbol);
            }
            const sorted = trades.sort((a, b) => b.timestamp - a.timestamp);
            if (limit !== undefined) {
                return sorted.slice(offset || 0, (offset || 0) + limit);
            }
            return sorted;
        }

        let query = this.supabase.from('trades').select('*').order('timestamp', { ascending: false });
        if (symbol) query = query.eq('symbol', symbol);

        if (limit !== undefined) {
            query = query.limit(limit).range(offset || 0, (offset || 0) + limit - 1);
        } else {
            // If no limit provided, fetch a very large batch (unlimited for practical purposes)
            // default is often 1,000 in Supabase, we'll request a much higher ceiling.
            query = query.limit(100000);
        }

        const { data, error } = await query;
        if (error) {
            console.error('Error fetching trades:', error);
            return [];
        }
        return (data as any[]) || [];
    }

    async savePortfolioSnapshot(snapshot: PortfolioSnapshot): Promise<void> {
        if (!this.supabase) return;
        const { error } = await this.supabase.from('portfolio_snapshots').insert({
            timestamp: snapshot.timestamp,
            totalValue: snapshot.totalValue,
            holdings: snapshot.holdings,
            pnl: snapshot.pnl,
            "pnlPercentage": snapshot.pnlPercentage,
            "winRate": snapshot.winRate,
            "profitFactor": snapshot.profitFactor,
            "winningTrades": snapshot.winningTrades,
            "losingTrades": snapshot.losingTrades,
            "openTradesCount": snapshot.openTradesCount,
            "totalNotionalValue": snapshot.totalNotionalValue,
            "currentEquity": snapshot.currentEquity,
            "currentBalance": snapshot.currentBalance,
            "walletBalance": snapshot.walletBalance,
            "totalMarginUsed": snapshot.totalMarginUsed,
            "initialBalance": snapshot.initialBalance
        });
        if (error) console.error('Error saving snapshot:', error);
    }

    async getLatestPortfolioSnapshot(): Promise<PortfolioSnapshot | null> {
        if (!this.supabase) return null;

        const { data, error } = await this.supabase
            .from('portfolio_snapshots')
            .select('*')
            .order('timestamp', { ascending: false })
            .limit(1)
            .single();

        if (error) {
            console.error('Error fetching snapshot:', error);
            return null;
        }

        const snapshot = data as any;
        return {
            timestamp: snapshot.timestamp,
            totalValue: snapshot.totalValue,
            holdings: snapshot.holdings || {},
            pnl: snapshot.pnl || 0,
            pnlPercentage: snapshot.pnlPercentage || 0,
            winRate: snapshot.winRate || 0,
            profitFactor: snapshot.profitFactor || 0,
            winningTrades: snapshot.winningTrades || 0,
            losingTrades: snapshot.losingTrades || 0,
            openTradesCount: snapshot.openTradesCount || 0,
            totalNotionalValue: snapshot.totalNotionalValue || 0,
            currentEquity: snapshot.currentEquity || snapshot.totalValue,
            currentBalance: snapshot.currentBalance || snapshot.totalValue,
            walletBalance: snapshot.walletBalance || snapshot.currentBalance || snapshot.totalValue,
            totalMarginUsed: snapshot.totalMarginUsed || 0,
            initialBalance: snapshot.initialBalance || 10000
        } as PortfolioSnapshot;
    }

    async getPortfolioSnapshots(limit: number = 50, period?: string): Promise<PortfolioSnapshot[]> {
        if (!this.supabase) return [];

        let query = this.supabase
            .from('portfolio_snapshots')
            .select('*');

        // Apply period filter if specified
        if (period && period !== 'all') {
            const now = Date.now();
            let cutoffTime = now;

            switch (period) {
                case '1d':
                    cutoffTime = now - (24 * 60 * 60 * 1000); // 24 hours
                    break;
                case '1w':
                    cutoffTime = now - (7 * 24 * 60 * 60 * 1000); // 7 days
                    break;
                case '1m':
                    cutoffTime = now - (30 * 24 * 60 * 60 * 1000); // 30 days
                    break;
                case '1y':
                    cutoffTime = now - (365 * 24 * 60 * 60 * 1000); // 365 days
                    break;
            }

            query = query.gte('timestamp', cutoffTime);
        }

        // For any period filter (including 1d/1w), we want to fetch all relevant data
        // and let the consolidation logic (or natural size) handle the density.
        let queryLimit = limit;
        if (period) {
            queryLimit = 1000; // Fetch enough for consolidation but stay within safe timeout limits
        }

        const { data, error } = await query
            .order('timestamp', { ascending: false }) // Get most recent first
            .limit(queryLimit);

        if (error) {
            console.error('Error fetching portfolio snapshots:', error);
            return [];
        }

        // Transform the data to match our interface
        let snapshots = (data || []).map((snapshot: any) => ({
            timestamp: snapshot.timestamp,
            totalValue: snapshot.totalValue,
            holdings: snapshot.holdings || {},
            pnl: snapshot.pnl || 0,
            pnlPercentage: snapshot.pnlPercentage || 0,
            winRate: snapshot.winRate || 0,
            profitFactor: snapshot.profitFactor || 0,
            winningTrades: snapshot.winningTrades || 0,
            losingTrades: snapshot.losingTrades || 0,
            openTradesCount: snapshot.openTradesCount || 0,
            totalNotionalValue: snapshot.totalNotionalValue || 0,
            currentEquity: snapshot.currentEquity || snapshot.totalValue,
            currentBalance: snapshot.currentBalance || snapshot.totalValue,
            walletBalance: snapshot.walletBalance || snapshot.currentBalance || snapshot.totalValue,
            totalMarginUsed: snapshot.totalMarginUsed || 0,
            initialBalance: snapshot.initialBalance || 10000
        })) as PortfolioSnapshot[];

        // Reverse to get chronological order (oldest to newest) for chart display
        snapshots = snapshots.reverse();

        // Consolidate data if too large (target ~500 points for chart)
        const TARGET_POINTS = 500;
        if (snapshots.length > TARGET_POINTS) {
            snapshots = this.consolidateSnapshots(snapshots, TARGET_POINTS);
        }

        return snapshots;
    }

    private consolidateSnapshots(data: PortfolioSnapshot[], targetCount: number): PortfolioSnapshot[] {
        if (data.length <= targetCount) return data;

        const blockSize = data.length / targetCount;
        const consolidated: PortfolioSnapshot[] = [];

        for (let i = 0; i < targetCount; i++) {
            const startIdx = Math.floor(i * blockSize);
            const endIdx = Math.floor((i + 1) * blockSize);
            const slice = data.slice(startIdx, endIdx);

            if (slice.length === 0) continue;

            const last = slice[slice.length - 1]; // Use latest state properties

            // Average the values for smoother chart
            const avgTotalValue = slice.reduce((sum, item) => sum + item.totalValue, 0) / slice.length;
            const avgEquity = slice.reduce((sum, item) => sum + item.currentEquity, 0) / slice.length;

            consolidated.push({
                ...last,
                totalValue: avgTotalValue,
                currentEquity: avgEquity,
                timestamp: last.timestamp // Use the timestamp of the last item in bucket
            });
        }

        return consolidated;
    }

    async saveBacktestResult(result: any): Promise<void> {
        if (!this.supabase) {
            console.log('[InMemoryDB] Saved Backtest result');
            return;
        }
        const { error } = await this.supabase.from('backtest_results').insert({ result, timestamp: Date.now() });
        if (error) console.error('Error saving backtest:', error);
    }

    async getBacktestResults(limit: number = 10): Promise<any[]> {
        if (!this.supabase) return [];

        const { data, error } = await this.supabase
            .from('backtest_results')
            .select('*')
            .order('timestamp', { ascending: false })
            .limit(limit);

        if (error) {
            console.error('Error fetching backtests:', error);
            return [];
        }
        return data || [];
    }

    async getActiveTrade(symbol: string): Promise<Trade | null> {
        if (!this.supabase) {
            const openTrades = this.inMemoryTrades.filter(t => t.symbol === symbol && t.status === 'OPEN');
            return openTrades.sort((a, b) => b.timestamp - a.timestamp)[0] || null;
        }

        const { data, error } = await this.supabase
            .from('trades')
            .select('*')
            .eq('symbol', symbol)
            .eq('status', 'OPEN')
            .order('timestamp', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) {
            console.error('Error fetching active trade:', error);
            return null;
        }
        return data as Trade;
    }

    async getOpenTrades(): Promise<Trade[]> {
        if (!this.supabase) {
            return this.inMemoryTrades.filter(t => t.status === 'OPEN').sort((a, b) => b.timestamp - a.timestamp);
        }

        const allOpenTrades: Trade[] = [];
        let from = 0;
        const batchSize = 1000;
        let hasMore = true;

        while (hasMore) {
            const { data, error } = await this.supabase
                .from('trades')
                .select('*')
                .eq('status', 'OPEN')
                .order('timestamp', { ascending: false })
                .range(from, from + batchSize - 1);

            if (error) {
                console.error('Error fetching open trades:', error);
                return allOpenTrades; // Return what we have so far
            }

            if (data && data.length > 0) {
                allOpenTrades.push(...(data as Trade[]));
                from += batchSize;
                // If we got fewer results than requested, we've reached the end
                if (data.length < batchSize) {
                    hasMore = false;
                }
            } else {
                hasMore = false;
            }
        }

        return allOpenTrades;
    }

    async updateTrade(id: string, updates: Partial<Trade>): Promise<void> {
        if (!this.supabase) {
            const index = this.inMemoryTrades.findIndex(t => t.id === id);
            if (index !== -1) {
                this.inMemoryTrades[index] = { ...this.inMemoryTrades[index], ...updates };
            }
            return;
        }

        const { error } = await this.supabase
            .from('trades')
            .update(updates)
            .eq('id', id);

        if (error) {
            console.error('Error updating trade:', error);
        }
    }

    async getRiskState(): Promise<{ startOfDayBalance: number, lastResetDay: number } | null> {
        if (!this.supabase) return null;

        const { data, error } = await this.supabase
            .from('kv_store')
            .select('value')
            .eq('key', 'risk_state')
            .maybeSingle();

        if (error) {
            // Table might not exist yet, ignore error or log debug
            return null;
        }
        return data?.value || null;
    }

    async saveRiskState(state: { startOfDayBalance: number, lastResetDay: number }): Promise<void> {
        if (!this.supabase) return;

        const { error } = await this.supabase
            .from('kv_store')
            .upsert({ key: 'risk_state', value: state });

        if (error) console.error('Error saving risk state:', error);
    }
}
