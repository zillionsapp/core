import { SupabaseDataStore } from '../src/adapters/database/supabase';
import { logger } from '../src/core/logger';
import dotenv from 'dotenv';

dotenv.config();

const deposits = [
    { email: 'user1@example.com', amount: 5240, date: '2025-10-06', time: '20:56:00' },
    { email: 'user2@example.com', amount: 60, date: '2025-10-06', time: '21:05:00' },
    { email: 'user3@example.com', amount: 1000, date: '2025-10-23', time: '22:16:00' },
    { email: 'user4@example.com', amount: 5000, date: '2025-11-13', time: '10:28:00' },
    { email: 'user5@example.com', amount: 1000, date: '2025-11-13', time: '12:00:00' },
    { email: 'user6@example.com', amount: 5000, date: '2025-11-14', time: '22:56:00' },
    { email: 'user7@example.com', amount: 100, date: '2025-11-20', time: '10:10:00' }
];

async function migrate() {
    console.log('--- Vault Deposit Migration ---');
    const db = new SupabaseDataStore();

    let totalAssets = 0;
    let totalShares = 0;

    // Check if vault is already populated
    const existingTransactions = await db.getVaultTransactions();
    if (existingTransactions.length > 0) {
        console.error('Vault already has transactions. Migration aborted to prevent duplicates.');
        return;
    }

    for (const d of deposits) {
        const timestamp = new Date(`${d.date}T${d.time}`).getTime();

        // At migration start, share price is 1.0
        const shares = d.amount;

        const transaction = {
            email: d.email,
            amount: d.amount,
            shares: shares,
            type: 'DEPOSIT',
            timestamp: timestamp
        };

        console.log(`Migrating: ${d.email} | $${d.amount} | ${new Date(timestamp).toLocaleString()}`);
        await db.saveVaultTransaction(transaction);

        totalAssets += d.amount;
        totalShares += shares;
    }

    // Final state update
    console.log(`Finalizing Vault State: Assets ${totalAssets}, Shares ${totalShares}`);
    await db.saveVaultState({
        total_assets: totalAssets,
        total_shares: totalShares
    });

    console.log('Migration completed successfully.');
}

migrate().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});
