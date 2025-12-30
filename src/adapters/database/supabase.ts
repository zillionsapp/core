import { IDataStore, PortfolioSnapshot } from '../../interfaces/repository.interface';
import { Trade } from '../../core/types';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../../config/env';

export class SupabaseDataStore implements IDataStore {
    private supabase: SupabaseClient | null = null;

    constructor() {
        if (config.SUPABASE_URL && config.SUPABASE_KEY) {
            this.supabase = createClient(config.SUPABASE_URL, config.SUPABASE_KEY);
            console.log('[SupabaseDataStore] Connected to Supabase');
        } else {
            console.warn('[SupabaseDataStore] Missing credentials. Running in InMemory mode (data will be lost).');
        }
    }

    async saveTrade(trade: Trade): Promise<void> {
        if (!this.supabase) {
            console.log('[InMemoryDB] Saved trade:', trade.id);
            return;
        }
        const { error } = await this.supabase.from('trades').insert(trade);
        if (error) console.error('Error saving trade:', error);
    }

    async getTrades(symbol?: string, limit: number = 100): Promise<Trade[]> {
        if (!this.supabase) return [];

        let query = this.supabase.from('trades').select('*').order('timestamp', { ascending: false }).limit(limit);
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
        const { error } = await this.supabase.from('portfolio_snapshots').insert(snapshot);
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
        return data as PortfolioSnapshot;
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
        if (!this.supabase) return null;

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

    async updateTrade(id: string, updates: Partial<Trade>): Promise<void> {
        if (!this.supabase) return;

        const { error } = await this.supabase
            .from('trades')
            .update(updates)
            .eq('id', id);

        if (error) {
            console.error('Error updating trade:', error);
        }
    }
}
