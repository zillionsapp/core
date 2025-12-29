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

    async saveBacktestResult(result: any): Promise<void> {
        if (!this.supabase) {
            console.log('[InMemoryDB] Saved Backtest result');
            return;
        }
        const { error } = await this.supabase.from('backtest_results').insert({ result, timestamp: Date.now() });
        if (error) console.error('Error saving backtest:', error);
    }
}
