
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load env from ../.env
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY/SUPABASE_KEY');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function main() {
    console.log('--- CALCULATING ACCURATE REALIZED PNL BY USER ---');
    console.log('(Matching App weighting logic: PnL = Sum(TradePnL * UserOwnershipAtExitTime))');

    // 1. Fetch all data needed for the calculation
    console.log('Fetching data from Supabase...');
    const [{ data: allVaultTxs }, { data: closedTrades }, { data: vaultState }, { data: latestSnapshot }] = await Promise.all([
        supabase.from('vault_transactions').select('*').order('timestamp', { ascending: true }),
        supabase.from('trades').select('*').eq('status', 'CLOSED').not('exitPrice', 'is', null).order('exitTimestamp', { ascending: true }),
        supabase.from('vault_state').select('*').limit(1).maybeSingle(),
        supabase.from('portfolio_snapshots').select('totalMarginUsed, currentEquity').order('timestamp', { ascending: false }).limit(1).maybeSingle()
    ]);

    if (!allVaultTxs || !closedTrades) {
        console.error('Critical data missing from database.');
        process.exit(1);
    }

    const uniqueEmails = [...new Set(allVaultTxs.map(tx => tx.email))];
    const currentVaultEquity = Number(latestSnapshot?.currentEquity || 0);
    const vaultMarginUsed = Number(latestSnapshot?.totalMarginUsed || 0);
    const totalVaultShares = Number(vaultState?.total_shares || 0);

    console.log(`Found ${uniqueEmails.length} users, ${closedTrades.length} closed trades.`);
    console.log(`Current Vault Equity: $${currentVaultEquity.toFixed(2)}`);
    console.log('--------------------------------------');

    // Helper: Calculate total vault shares at a specific timestamp
    const getGlobalSharesAt = (ts: number) => {
        let shares = 0;
        for (const tx of allVaultTxs) {
            if (Number(tx.timestamp) > ts) break;
            if (tx.type === 'DEPOSIT') shares += Number(tx.shares);
            else if (tx.type === 'WITHDRAWAL') shares -= Number(tx.shares);
        }
        return shares;
    };

    // Helper: Calculate user shares at a specific timestamp
    const getUserSharesAt = (email: string, ts: number) => {
        let shares = 0;
        for (const tx of allVaultTxs) {
            if (tx.email !== email) continue;
            if (Number(tx.timestamp) > ts) break;
            if (tx.type === 'DEPOSIT') shares += Number(tx.shares);
            else if (tx.type === 'WITHDRAWAL') shares -= Number(tx.shares);
        }
        return shares;
    };

    const report: any[] = [];

    for (const email of uniqueEmails) {
        // A. Calculate Total Deposits (Cash Basis)
        let totalDeposited = 0;
        let currentUserShares = 0;
        let totalWithdrawn = 0;

        for (const tx of allVaultTxs.filter(tx => tx.email === email)) {
            const amount = Number(tx.amount);
            const shares = Number(tx.shares);

            if (tx.type === 'DEPOSIT') {
                totalDeposited += amount;
                currentUserShares += shares;
            } else if (tx.type === 'WITHDRAWAL') {
                totalWithdrawn += amount;
                currentUserShares -= shares;
            } else if (tx.type === 'COMMISSION_EARNED') {
                totalDeposited += amount; // Treat commission as an injection of value
            } else if (tx.type === 'COMMISSION_PAID') {
                totalDeposited -= Math.abs(amount);
            }
        }

        // B. Calculate Realized PnL (Weighted by historical ownership)
        let realizedPnL = 0;
        for (const trade of closedTrades) {
            const qty = Number(trade.quantity);
            const entry = Number(trade.price);
            const exit = Number(trade.exitPrice);
            const pnl = (trade.side === 'BUY') ? (exit - entry) * qty : (entry - exit) * qty;

            const ts = Number(trade.exitTimestamp);
            const globalShares = getGlobalSharesAt(ts);
            const userShares = getUserSharesAt(email, ts);
            const ownership = globalShares > 0 ? userShares / globalShares : 0;

            realizedPnL += pnl * ownership;
        }

        // C. Calculate current equity and margin
        const currentOwnership = totalVaultShares > 0 ? currentUserShares / totalVaultShares : 0;
        const userEquity = currentOwnership * currentVaultEquity;
        const userMarginLocked = currentOwnership * vaultMarginUsed;

        // D. Available Balance (matching summary.get.ts logic: deposits + realized - margin)
        // Actually, the app defines PnL as just realizedPnL.
        const roi = totalDeposited > 0 ? (realizedPnL / totalDeposited) * 100 : 0;

        report.push({
            User: email,
            Shares: currentUserShares.toFixed(4),
            Ownership: (currentOwnership * 100).toFixed(2) + '%',
            Deposits: totalDeposited.toFixed(2),
            Withdrawals: totalWithdrawn.toFixed(2),
            'Realized PnL': realizedPnL.toFixed(2),
            Equity: userEquity.toFixed(2),
            'Margin Locked': userMarginLocked.toFixed(2),
            ROI: roi.toFixed(2) + '%'
        });
    }

    // 3. Display table
    console.table(report);

    // 4. Grand Totals
    const grandTotals = report.reduce((acc, row) => {
        acc.totalEquity += Number(row.Equity);
        acc.totalRealizedPnL += Number(row['Realized PnL']);
        return acc;
    }, { totalEquity: 0, totalRealizedPnL: 0 });

    console.log('--------------------------------------');
    console.log(`GRAND TOTAL EQUITY:   $${grandTotals.totalEquity.toFixed(2)}`);
    console.log(`GRAND TOTAL REALIZED: $${grandTotals.totalRealizedPnL.toFixed(2)}`);
    console.log('--------------------------------------');
}

main().catch(console.error);
