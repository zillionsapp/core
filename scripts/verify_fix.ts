
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load env 
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('Missing credentials');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function verifyLogic() {
    console.log('--- VERIFICATION SIMULATION ---');

    console.log('\n1. VERIFYING VAULT STATE...');
    const { data: vaultState } = await supabase.from('vault_state').select('*').single();
    if (vaultState) {
        console.log('Vault Total Assets:', vaultState.total_assets);
        console.log('Vault Total Shares:', vaultState.total_shares);
    }

    console.log('\n2. VERIFYING RLS POLICIES...');
    // Inspect pg_policies to see if 'trades' has any policies and if they are correct
    const { data: policies, error: policyError } = await (supabase as any)
        .from('pg_policies')
        .select('*')
        .in('tablename', ['trades', 'vault_transactions']);

    if (policyError) {
        console.error('Error fetching policies (Might be restricted even for service key if not superuser):', policyError.message);
    } else {
        if (policies && policies.length > 0) {
            console.table(policies);
        } else {
            console.log('No policies found for trades/vault_transactions. (RLS might be disabled or no policies exist)');
        }
    }

    console.log('\n3. VERIFYING TRADES FETCH (DESC)...');
    // Simulate what the API does: Fetch user trades DESC
    const { data: userTrades } = await supabase.from('trades').select('*').order('timestamp', { ascending: false }).limit(5); // Newest 5

    console.log(`Fetched ${userTrades?.length} recent trades (DESC).`);

    if (userTrades && userTrades.length > 0) {
        console.log('Most Recent Trade:', {
            symbol: userTrades[0].symbol,
            timestamp: new Date(userTrades[0].timestamp).toISOString(),
            status: userTrades[0].status,
            price: userTrades[0].price
        });

        // Check columns to confirm no user_id
        console.log('Table Columns:', Object.keys(userTrades[0]));

    } else {
        console.log('No recent trades found.');
    }
}

verifyLogic().catch(console.error);
