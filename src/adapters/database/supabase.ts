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

    async getTrades(symbol?: string, limit: number = 100, offset: number = 0): Promise<Trade[]> {
        if (!this.supabase) {
            let trades = [...this.inMemoryTrades];
            if (symbol) {
                trades = trades.filter(t => t.symbol === symbol);
            }
            return trades.sort((a, b) => b.timestamp - a.timestamp).slice(offset, offset + limit);
        }

        let query = this.supabase.from('trades').select('*').order('timestamp', { ascending: false }).limit(limit).range(offset, offset + limit - 1);
        if (symbol) query = query.eq('symbol', symbol);

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
            "openTrades": snapshot.openTrades,
            "closedTrades": snapshot.closedTrades,
            "currentEquity": snapshot.currentEquity,
            "currentBalance": snapshot.currentBalance
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

        // Ensure the data matches the PortfolioSnapshot interface
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
            openTrades: snapshot.openTrades || [],
            closedTrades: snapshot.closedTrades || [],
            currentEquity: snapshot.currentEquity || snapshot.totalValue,
            currentBalance: snapshot.currentBalance || snapshot.totalValue
        } as PortfolioSnapshot;
    }

    async getPortfolioSnapshots(limit: number = 50): Promise<PortfolioSnapshot[]> {
        if (!this.supabase) return [];

        const { data, error } = await this.supabase
            .from('portfolio_snapshots')
            .select('*')
            .order('timestamp', { ascending: true })
            .limit(limit);

        if (error) {
            console.error('Error fetching portfolio snapshots:', error);
            return [];
        }

        // Transform the data to match our interface
        return (data || []).map((snapshot: any) => ({
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
        })) as PortfolioSnapshot[];
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

        const { data, error } = await this.supabase
            .from('trades')
            .select('*')
            .eq('status', 'OPEN')
            .order('timestamp', { ascending: false });

        if (error) {
            console.error('Error fetching open trades:', error);
            return [];
        }
        return (data as Trade[]) || [];
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
