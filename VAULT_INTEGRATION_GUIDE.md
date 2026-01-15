# Vault Integration Architecture Guide

This guide defines the architectural separation between the **Core Trading Bot** (this repository) and the **Optional Frontend Application**.

## 1. System Components

The system is designed as two distinct but integrated components.

### A. The Core Trading Bot (Backend)
**Role**: The Engine & Manager.
*   **Trading Execution**: Runs strategies and executes trades on Drift.
*   **Vault Management**: Managing the Vault, redeeming fees, and re-balancing.
*   **Commission Engine**: Calculates & records commissions **Real-Time** upon trade closure.
*   **Database**: Owns the PostgreSQL/Supabase database and write-access to ledgers.
*   **API**: Provides data endpoints for the frontend (if enabled).

### B. The Frontend Application (Optional Extension)
**Role**: The User Interface.
*   **User Connectivity**: Allows users to connect Solana Wallets (Phantom/Solflare).
*   **Vault Interactions**: Provides UI for **Depositing** and **Withdrawing** funds (signing transactions).
*   **Dashboard**: Displays performance, balances, and commission history (read-only from DB).
*   **Referral System**: UI for generating and sharing invite codes.

---

## 2. The User Journey & Responsibility Split

Here is how the two components interact during a user's lifecycle.

### Step 1: User Onboarding & Deposit
*   **Frontend (App)**:
    1.  User connects Wallet.
    2.  User enters an **Invite Code**.
    3.  Frontend links `Wallet Address` <-> `Invite Code` in the database.
    4.  User clicks "Deposit". Frontend interacts with **Drift SDK** to deposit USDC into the Vault on-chain.
*   **Backend (Core)**:
    1.  **Sync**: Detects the on-chain deposit (via Indexer or Webhook) and updates the `vault_transactions` table.
    2.  **State**: Updates the global `Total Assets` used for position sizing.

### Step 2: Trading & Profit Generation
*   **Frontend (App)**: Idle. Users just watch the charts.
*   **Backend (Core)**:
    1.  **BotEngine**: Analyzes market, opens/closes positions.
    2.  **Trade Closure**: When a profitable trade is closed:
        *   **Event**: `CommissionManager.handleTradeClose(trade, pnl)` is triggered.
        *   **Calculation**: System calculates `Inviter Share` and `Platform Share`.
        *   **Ledger Update**: Inserts `COMMISSION_EARNED` (Credit Inviter) and `COMMISSION_PAID` (Debit User) records immediately.
        *   **Result**: "Virtual Reinvestment" happens instantly. The Manager retains the fee shares in the vault to back these credits.

### Step 3: Withdrawals & Claims
*   **Frontend (App)**:
    1.  **Withdraw**: User clicks "Withdraw".
    2.  **Logic**: Frontend calculates max withdrawable amount (On-Chain Shares + Virtual Credits).
    3.  **Action**: User signs a withdrawal transaction.
    4.  **Claim**: If retrieving Commission Rewards, the Frontend requests the Backend (via API) to execute a transfer or unlock shares.

---

## 3. Data Flow & Integration Points

### Database Schema (Shared Source of Truth)
Both the Core and the Frontend read from the same Supabase database.

*   `auth.users`: User Identity (managed by Frontend/Supabase Auth).
*   `user_wallets`: Maps `User ID` <-> `Solana Wallet Address`.
*   `campaigns` / `invite_codes`: Referral logic.
*   `vault_transactions`: **The Master Ledger**.
    *   `DEPOSIT` / `WITHDRAWAL`: Sourced from On-Chain Events.
    *   `COMMISSION_EARNED`: Sourced from **Core Trading Bot** (Real-Time).
    *   `COMMISSION_PAID`: Sourced from **Core Trading Bot** (Real-Time).

### The "Bridge" (Drift Vaults)
*   The **Core** operates as the **Vault Manager**. It has authority to trade and manage fees.
*   The **App** operates as a **Vault Depositor Interface**. It has no special authority; it just facilitates user access to the smart contract.

---

## 4. Commission Logic (Detailed)

### The "Virtual Reinvestment" Model
We use an **Internal Loop** to handle commissions efficiently without requiring constant on-chain transfers.

1.  **Trade Closes**: Core Bot closes a trade with `$100` Profit.
2.  **Real-Time Trigger**: `CommissionManager` activates.
3.  **Accounting**:
    *   Inviter (Alice) earns `$10` (10%).
    *   Invited (Bob) pays `$10`.
4.  **Ledger Entry**:
    *   `COMMISSION_EARNED`: Alice +$10 (converted to Shares).
    *   `COMMISSION_PAID`: Bob -$10 (converted to Shares).
5.  **Asset Backing**:
    *   The Bot **DOES NOT** withdraw this `$10` from the vault.
    *   The Bot **retains** the Performance Fee shares in the vault.
    *   These retained shares "back" the `$10` virtual credit given to Alice.
6.  **Result**: Alice's balance grows immediately on her Dashboard, effectively auto-compounding her rewards.

### Why this approach?
*   **Gas Savings**: No transaction fees for every single trade.
*   **Auto-Compounding**: Rewards are immediately reinvested into the strategy.
*   **Simplicity**: No need for users to manually "claim" small amounts constantly.

---

## 5. Developer Checklist

If enabling the Drift Vault feature:

1.  [ ] **Env Config**: Set `ENABLE_DRIFT_VAULT=true` in `.env`.
2.  [ ] **Deployment**: Run `npm run vault:deploy` to verify Vault settings.
3.  [ ] **Frontend**: Deploy the App Repo (Next.js/Vue) and connect it to the same Supabase instance.
4.  [ ] **Indexer**: Ensure the "Deposit Listener" (in App or Core) is running to sync on-chain deposits to the DB.
