
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from the parent directory's .env file
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Error: SUPABASE_URL or SUPABASE_KEY/SUPABASE_SERVICE_KEY is missing in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTransactionCounts() {
    console.log('--- CHECKING TRANSACTION COUNTS ---');

    // 1. Get User
    const { data: globalTx } = await supabase.from('vault_transactions').select('email');

    // Explicitly type the accumulator
    const counts: Record<string, number> = {};

    if (globalTx) {
        globalTx.forEach((t: any) => {
            const email = t.email || 'unknown';
            counts[email] = (counts[email] || 0) + 1;
        });
    }

    console.log('Transaction Counts per User:', counts);

    const targetEmail = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0]; // Most active user

    if (!targetEmail) {
        console.log('No users found with transactions.');
        return;
    }

    console.log(`Analyzing User: ${targetEmail} (Count: ${counts[targetEmail]})`);

    // 2. Fetch with default limit to see if we hit a cap
    const { data: defaultFetch } = await supabase
        .from('vault_transactions')
        .select('id, type, amount')
        .eq('email', targetEmail);

    console.log(`Default Fetch Count: ${defaultFetch?.length}`);
    if (defaultFetch?.length === 1000) {
        console.log('WARNING: HIT 1000 ROW LIMIT. Older transactions are likely missing.');
    }

    // 3. Check for specific DEPOSIT in this fetch
    const deposits = defaultFetch?.filter((t: any) => t.type === 'DEPOSIT');
    console.log(`Deposits found in Default Fetch: ${deposits?.length}`);

    // 4. Try fetching ALL using a loop or count
    const { count } = await supabase
        .from('vault_transactions')
        .select('*', { count: 'exact', head: true })
        .eq('email', targetEmail);

    console.log(`Total DB Count (head): ${count}`);

}

checkTransactionCounts();
