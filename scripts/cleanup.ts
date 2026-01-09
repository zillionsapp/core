import { createClient } from '@supabase/supabase-js';
import { config } from '../src/config/env';
import dotenv from 'dotenv';

dotenv.config();

async function cleanup() {
    console.log('--- Database Cleanup Script ---');

    if (!config.SUPABASE_URL || !config.SUPABASE_KEY) {
        console.error('Missing SUPABASE_URL or SUPABASE_KEY environment variables');
        process.exit(1);
    }

    const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_KEY);

    const tables = [
        'trades',
        'portfolio_snapshots',
        'portfolio_chart_cache',
        'backtest_results',
        'kv_store',
        'vault_transactions',
        'vault_state'
    ];

    console.log('Truncating all tables...');

    for (const table of tables) {
        try {
            console.log(`Clearing ${table}...`);
            let query = supabase.from(table).delete();

            // Add a condition that matches all records
            if (table === 'portfolio_chart_cache') {
                query = query.not('period', 'is', null);
            } else if (table === 'kv_store') {
                query = query.not('key', 'is', null);
            } else if (table === 'vault_state') {
                query = query.not('id', 'is', null);
            } else {
                // For tables with 'id' as primary key
                query = query.not('id', 'is', null);
            }

            const { error } = await query;

            if (error) {
                console.error(`Error clearing ${table}:`, error.message);
            } else {
                console.log(`✓ Cleared ${table}`);
            }
        } catch (err) {
            console.error(`Error processing ${table}:`, err);
        }
    }

    console.log('Cleanup completed.');
}

cleanup().catch(err => {
    console.error('Cleanup failed:', err);
    process.exit(1);
});
