
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) { process.exit(1); }
const supabase = createClient(supabaseUrl, supabaseKey);

async function debugBalance() {
    const userEmail = 'chris@brane.media'; // Target User
    console.log(`DEBUG BALANCE for: ${userEmail}`);

    // 1. FETCH ALL DATA
    // Vault Txs (User)
    const { data: userVaultTx } = await supabase
        .from('vault_transactions')
        .select('amount, type, timestamp, shares')
        .eq('email', userEmail);

    // Global Txs (for ownership)
    const { data: globalVaultTx } = await supabase
        .from('vault_transactions')
        .select('shares, type, timestamp')
        .order('timestamp', { ascending: true }); // Default limit 1000

    console.log(`User Vault Txs: ${userVaultTx?.length}`);
    console.log(`Global Vault Txs: ${globalVaultTx?.length}`);

    // 2. CALCULATE DEPOSITS
    let totalDeposited = 0;
    let currentUserShares = 0;

    if (userVaultTx) {
        for (const tx of userVaultTx) {
            if (tx.type === 'DEPOSIT' || tx.type === 'RECEIVE') {
                totalDeposited += Number(tx.amount);
                currentUserShares += Number(tx.shares);
            } else if (tx.type === 'WITHDRAWAL' || tx.type === 'SEND') {
                totalDeposited -= Number(tx.amount);
                currentUserShares -= Number(tx.shares);
            } else if (tx.type === 'COMMISSION_EARNED') {
                totalDeposited += Number(tx.amount);
            } else if (tx.type === 'COMMISSION_PAID') {
                totalDeposited -= Math.abs(Number(tx.amount));
            }
        }
    }
    console.log(`Total Deposited: ${totalDeposited}`);
    console.log(`Current User Shares: ${currentUserShares}`);

    // 3. CALCULATE REALIZED PNL
    const { data: closedTrades } = await supabase.from('trades').select('*').eq('status', 'CLOSED');
    console.log(`Closed Trades: ${closedTrades?.length}`);

    let totalRealizedPnl = 0;

    const getGlobalSharesAt = (ts: number) => {
        let shares = 0;
        if (globalVaultTx) {
            for (const tx of globalVaultTx) {
                if (Number(tx.timestamp) > ts) break;
                // Simplified summary logic match
                if (tx.type === 'DEPOSIT' || tx.type === 'RECEIVE') shares += Number(tx.shares);
                else if (tx.type === 'WITHDRAWAL' || tx.type === 'SEND') shares -= Number(tx.shares);
            }
        }
        return shares;
    };

    const getUserSharesAt = (ts: number) => {
        let shares = 0;
        if (userVaultTx) {
            // Need sorted for playback
            const sorted = [...userVaultTx].sort((a, b) => Number(a.timestamp) - Number(b.timestamp));
            for (const tx of sorted) {
                if (Number(tx.timestamp) > ts) break;
                if (tx.type === 'DEPOSIT' || tx.type === 'RECEIVE') shares += Number(tx.shares);
                else if (tx.type === 'WITHDRAWAL' || tx.type === 'SEND') shares -= Number(tx.shares);
            }
        }
        return shares;
    };

    if (closedTrades) {
        for (const trade of closedTrades) {
            if (!trade.exitPrice) continue;
            const qty = Number(trade.quantity);
            const entry = Number(trade.price);
            const exit = Number(trade.exitPrice);
            const pnl = (trade.side === 'BUY') ? (exit - entry) * qty : (entry - exit) * qty;

            const ts = Number(trade.exitTimestamp);
            const globalShares = getGlobalSharesAt(ts);
            const userShares = getUserSharesAt(ts);
            const ownership = globalShares > 0 ? userShares / globalShares : 0;

            totalRealizedPnl += pnl * ownership;
        }
    }
    console.log(`Total Realized PnL: ${totalRealizedPnl}`);

    // 4. MARGIN LOCKED
    const { data: vaultState } = await supabase.from('vault_state').select('total_shares').limit(1).single();
    const currentTotalShares = Number(vaultState?.total_shares || 0);
    const currentOwnership = currentTotalShares > 0 ? currentUserShares / currentTotalShares : 0;

    const { data: latestSnapshot } = await supabase
        .from('portfolio_snapshots')
        .select('totalMarginUsed')
        .order('timestamp', { ascending: false })
        .limit(1)
        .single();

    const vaultMarginUsed = Number(latestSnapshot?.totalMarginUsed || 0);
    const userMarginLocked = vaultMarginUsed * currentOwnership;

    console.log(`Vault Margin Used: ${vaultMarginUsed}`);
    console.log(`User Margin Locked: ${userMarginLocked}`);

    // 5. FINAL BALANCE
    const finalBalance = totalDeposited + totalRealizedPnl - userMarginLocked;
    console.log(`CALCULATED FINAL BALANCE: ${finalBalance}`);
}

debugBalance();
