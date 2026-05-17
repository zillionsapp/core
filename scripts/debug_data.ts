
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load env from ../.env (relative to core/scripts)
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY/SUPABASE_KEY');
    console.error('Resolved .env path:', path.resolve(__dirname, '../.env'));
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function main() {
    console.log('--- DEBUGGING DATA ---');

    console.log('\n1. FETCHING VAULT STATE...');
    const { data: vaultState, error: vaultError } = await supabase.from('vault_state').select('*');
    if (vaultError) console.error('Vault Error:', vaultError);
    console.table(vaultState);

    console.log('\n2. FETCHING LATEST PORTFOLIO SNAPSHOT...');
    const { data: snapshot, error: snapError } = await supabase
        .from('portfolio_snapshots')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(1);

    if (snapshot && snapshot[0]) {
        const s = snapshot[0];
        console.log({
            id: s.id,
            timestamp: new Date(s.timestamp).toISOString(),
            initialBalance: s.initialBalance,
            walletBalance: s.walletBalance,
            currentBalance: s.currentBalance,
            currentEquity: s.currentEquity,
            pnl: s.pnl,
            pnlPercentage: s.pnlPercentage,
            openTradesCount: s.openTradesCount,
            totalMarginUsed: s.totalMarginUsed
        });
    } else {
        console.log('No snapshot found (or error)', snapError);
    }

    console.log('\n3. FETCHING VAULT TRANSACTIONS (SUMMARY)...');
    const { data: txs, error: txError } = await supabase
        .from('vault_transactions')
        .select('type, amount, shares');

    if (txs) {
        const totals = txs.reduce((acc: any, tx: any) => {
            acc[tx.type] = (acc[tx.type] || 0) + Number(tx.amount);
            return acc;
        }, {});
        console.log('Transaction Totals by Type:', totals);

        const totalDeposited = (totals['DEPOSIT'] || 0)
            - (totals['WITHDRAWAL'] || 0)
            + (totals['COMMISSION_EARNED'] || 0)
            - (totals['COMMISSION_PAID'] || 0); // subtraction if COMMISSION_PAID is positive in DB, but typical usage is negative for outgoing. Let's assume absolute.
        // Actually better to just sum signed amounts if they are stored signed.
        // But my reading of code suggests they are stored as positive usually and signs applied in logic?
        // Transactions seem to store "amount". 
        // Let's check logic:
        // vault.manager.ts: "if COMMISSION_PAID return sum + Number(t.amount); // amount is negative in this case"
        // So COMMISSION_PAID amount is stored as negative?

        console.log('Calculated net deposits (approx):', totalDeposited);
    } else {
        console.error('Tx Error:', txError);
    }

    console.log('\n4. FETCHING TRADES (SUMMARY)...');
    const { data: trades, error: tradesError } = await supabase
        .from('trades')
        .select('status, pnl, exitTimestamp, side');

    if (trades) {
        const closed = trades.filter((t: any) => t.status === 'CLOSED');
        const open = trades.filter((t: any) => t.status === 'OPEN');

        const realizedPnL = closed.reduce((sum: number, t: any) => sum + Number(t.pnl || 0), 0);
        console.log(`Total Trades: ${trades.length} (Open: ${open.length}, Closed: ${closed.length})`);
        console.log(`Total Realized PnL (from trades table): ${realizedPnL}`);
    } else {
        console.error('Trades Error:', tradesError);
    }
}

main().catch(console.error);
