
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load env
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) { console.error('Missing Env Vars'); process.exit(1); }

async function verifyManualClientLogic() {
    console.log('--- VERIFYING MANUAL ADMIN CLIENT LOGIC ---');

    // 1. Manually create client (Simulate what we will do in transactions.get.ts)
    const supabaseAdmin = createClient(supabaseUrl!, supabaseKey!);

    const userEmail = 'chris@brane.media'; // Target

    // 2. Run the Exact Logic to be implemented

    // A. Fetch User Vault Tx (Admin)
    const { data: userVaultTx, error: vaultError } = await supabaseAdmin
        .from('vault_transactions')
        .select('amount, type, timestamp, shares, email')
        .eq('email', userEmail);

    if (vaultError) console.error('Vault Error:', vaultError);
    console.log(`User Vault Txs Found: ${userVaultTx?.length}`);

    // B. Calculate Deposited
    let totalDeposited = 0;
    if (userVaultTx) {
        for (const tx of userVaultTx) {
            if (tx.type === 'DEPOSIT' || tx.type === 'RECEIVE') totalDeposited += Number(tx.amount);
            else if (tx.type === 'WITHDRAWAL' || tx.type === 'SEND') totalDeposited -= Number(tx.amount);
            else if (tx.type === 'COMMISSION_EARNED') totalDeposited += Number(tx.amount);
            else if (tx.type === 'COMMISSION_PAID') totalDeposited -= Math.abs(Number(tx.amount));
        }
    }
    console.log(`Total Deposited: ${totalDeposited}`);

    if (totalDeposited < 1000) {
        console.warn('WARNING: Total Deposited is suspiciously low. RLS bypass might have failed or data is missing.');
    } else {
        console.log('SUCCESS: Total Deposited matches expected range (~$5k).');
    }
}

verifyManualClientLogic();
