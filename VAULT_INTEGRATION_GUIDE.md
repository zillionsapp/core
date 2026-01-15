# Drift Vault Integration Guide

This guide explains how to integrate a frontend application (using Phantom/Solflare) with the Zillion Trading Bot's vault system, enabling a complete cycle of **On-Chain Deposits -> Trading -> Commission Calculation**.

## 1. Architecture Overview

The system bridges two worlds:
1.  **On-Chain (Solana/Drift)**: Where real funds live. Users deposit specific tokens (USDC) into the Drift Vault via their wallet.
2.  **Off-Chain (Supabase/Postgres)**: Where your user accounts, invite codes, and commission dashboard live.

### The "Bridge" Problem
Your `frontend_extension.sql` calculates commissions based on entries in the `vault_transactions` table. However, since users deposit directly on-chain (using Phantom), these deposits **do not automatically appear** in your database.

**Solution**: You must implement a **Wait-for-Event** or **Indexer** mechanism to detect on-chain deposits and sync them to Supabase.

---

## 2. Frontend Implementation (Wallet Connection)

Your frontend needs to allow users to connect a wallet and deposit into the Vault.

### Prerequisites
*   `@solana/wallet-adapter-react` (or similar)
*   `@drift-labs/vaults-sdk`
*   `@drift-labs/sdk`

### A. Wallet Connection
Use standard Solana Wallet Adapter to connect Phantom/Solflare.

### B. Performing a Deposit
Use the `VaultClient` to interact with the Vault program.

```typescript
import { AnchorProvider, Program } from '@coral-xyz/anchor';
import { VaultClient, IDL } from '@drift-labs/vaults-sdk';
import { PublicKey } from '@solana/web3.js';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';

const VAULT_ADDRESS = new PublicKey("YOUR_VAULT_ADDRESS_FROM_ENV");

// Inside your component
const { connection } = useConnection();
const wallet = useWallet();

const handleDeposit = async (amountUSDC: number) => {
    if (!wallet.publicKey) return;

    // 1. Setup Provider
    const provider = new AnchorProvider(connection, wallet as any, {});
    const programId = new PublicKey('vAuLTsyrvSjzZ2dnLXRNxUkyQQGKxnN6bXadUACqWxl');
    
    // 2. Initialize Vault Client
    const vaultClient = new VaultClient({
        driftClient: driftClient, // Initialize basic DriftClient first
        program: new Program(IDL, programId, provider)
    });

    // 3. Deposit
    const tx = await vaultClient.deposit(
        VAULT_ADDRESS,
        new BN(amountUSDC).mul(QUOTE_PRECISION)
    );
    
    // 4. IMPORTANT: Notify Backend (The "Lazy" Bridge)
    // While the backend should ideally listen to chain events, 
    // you can trigger a sync manually after success.
    await api.post('/vault/sync-deposit', { txSignature: tx });
}
```

---

## 3. Backend Integration (The Commission Bridge)

To make your `frontend_extension.sql` logic work, you need to populate `vault_transactions` with these on-chain deposits.

### Step 1: Link Wallet to User
Your `auth.users` table needs to know which Wallet Address belongs to which User UUID.
*   **Action**: Add a `wallet_address` column to your user profile table or metadata.
*   **Why**: When `Address A` deposits 1000 USDC, we need to know it is `User UUID X` to calculate their inviter's commission.

### Step 2: Sync Service (The "Indexer")
**Ideally, implementing this in your App Backend (Next.js/Node) is better than the Trading Bot.**

**Logic for your Backend Dev:**
1.  **Poll/Listen**: Use `@drift-labs/vaults-sdk` to watch the Vault Address.
2.  **Event**: When `Deposit` event occurs:
    *   **Extract**: `userAuthority` (Wallet), `amount`, `shares`.
    *   **Lookup**: Find the User ID in your `auth.users` who owns that Wallet.
    *   **Insert**:
        ```sql
        INSERT INTO vault_transactions (
            email, amount, shares, type, timestamp, inviter_id, ...
        ) VALUES (
            'user@email.com', 1000, 1000, 'DEPOSIT', now(), ...
        );
        ```
    *   **Commission**: The generic `frontend_extension.sql` trigger/function will handle the rest once the row is inserted.

### Step 3: Commission Calculation
Once the row exists in `vault_transactions`, your existing `calculate_daily_commissions` function in `frontend_extension.sql` will work exactly as designed:
1.  It iterates users.
2.  It sees the valid `DEPOSIT` in `vault_transactions`.
3.  It calculates profit share based on the `portfolio_snapshots` (which the bot already generates).
4.  It generates `COMMISSION_EARNED` records.

---

## 4. Commission Payouts (Real vs. Accounting)

Your SQL system creates `COMMISSION_PAID` records in the database. 
*   **Current State**: These are "Accounting Entries". The money is still in the Inviter's name in the Vault (or mixed in the pool).
*   **Real Payouts**: If you want inviters to be able to *spend* this commission:
    1.  **Manual**: Admin calculates total commissions owed at end of month, withdraws from Vault/Treasury, and airdrops USDC to inviters.
    2.  **Automated**: The bot needs a `process_payouts` script that reads `COMMISSION_EARNED` and executes an on-chain transfer or Vault Share transfer to the inviter.

## Summary Checklist

1.  [ ] **Frontend**: Implement `connectWallet` and `vaultClient.deposit` for Phantom/Solflare.
2.  [ ] **Database**: Add `wallet_address` column to map Users <-> Solana Keys.
3.  [ ] **Backend**: Implement a "Deposit Listener" that inserts on-chain deposits into the `vault_transactions` table.
4.  [ ] **Logic**: Ensure `calculate_daily_commissions` runs nightly (e.g., via `pg_cron` or a bot cron job).

---

## 5. How Commission Distribution Works (The "Realization" Problem)

You asked: *"How does the commission distribution from profitable trades work?"*

This is the most critical part of the integration because of the difference between **Database Accounting** and **On-Chain Reality**.

### The Logic in `frontend_extension.sql`
Your SQL script implements a **Shadow Ledger**:
1.  **Daily Check**: The `calculate_daily_commissions` function runs every 24 hours.
2.  **Profit Calculation**: It looks at the Vault's PnL for that day.
3.  **Virtual Transfer**:
    *   It **deducts** money from User B (The Invited) in the database (`COMMISSION_PAID` record).
    *   It **adds** money to User A (The Inviter) in the database (`COMMISSION_EARNED` record).

### 🚨 The "DeFi" Conflict
In a **Non-Custodial Drift Vault**, users hold their own shares.
*   **Scenario**: User B makes $100 profit.
*   **Database**: Says User B owes $10 commission.
*   **On-Chain**: User B can withdraw the full $100 profit directly from Drift. The SQL cannot stop them.

### The Solution: "Manager Fee Revenue Share"
To make this work in reality, you cannot take extra money from the user *after* they withdraw. Instead, you must use the **Vault Performance Fee**.

**Recommended Flow:**
1.  **Set Vault Fee**: Configure your Drift Vault with a Manager Performance Fee (e.g., **20%**).
2.  **On-Chain Enforcement**: When User B withdraws profit, Drift Protocol *automatically* takes 20% and gives it to YOU (The Manager/Bot).
3.  **Off-Chain Distribution (The Affiliate Commission)**:
    *   You use the SQL logic to calculate that **half** of that fee (10%) belongs to the Inviter.
    *   **Adjustment**: Update the SQL to calculate commission based on the *Manager Fee collected*, not the raw User Profit.
    *   **Payout**: You (The Manager) manually or automatically send that 10% share to the Inviter from your collected fees.

**Revised SQL Logic for DeFi**:
Instead of `User Balance - Commission`, think of it as `Manager Revenue -> Split to Inviter`.

```mermaid
graph TD
    User[Invited User] -->|1. Earns Profit| Vault[Drift Vault]
    Vault -->|2. Protocol Deducts 20% Fee| Manager[Bot Wallet]
    Manager -->|3. Syncs with DB| DB[(Supabase)]
    DB -->|4. Calculates Affiliate Share (e.g. 50% of Fee)| Ledger[Commission Ledger]
    Manager -->|5. Payout| Inviter[Affiliate Wallet]
```

```

This ensures you are distributing money you **actually have** (the performance fee), rather than trying to claw back money the user controls.

### 6. The "Tax Free" Question (Advanced)

You asked: *"Can I let some users be tax free? Because I have to take 20% at least?"*

Yes, you can, but it requires a **Rebate Mechanism**.

**The Challenge**:
*   Drift Vaults apply one fee (e.g., 20%) to **everyone**. You cannot whitelist specific wallets to have 0% fee on-chain.

**The Solution: "Fee Rebates" (Cashback)**
If you want a VIP user to be "Tax Free", you must **refund** them the fee you collected.

1.  **On-Chain**: VIP User makes $100 profit. Drift takes $20 fee. User gets $80.
2.  **Off-Chain (Your DB)**:
    *   System detects User is "VIP / Tax Free".
    *   System calculates: *"I took $20 from VIP User. I need to give it back."*
    *   **Action**: You send $20 (USDC or Custom Token) back to the user as a "Rebate" or "Cashback".

**Result**:
*   User Net: $80 (Withdrawal) + $20 (Rebate) = $100 (Tax Free).

This is how major exchanges and referral programs work. They charge the standard fee first, then "kick back" the discount at the end of the day/month. This is much safer than trying to build complex custom contracts.
