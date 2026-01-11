"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VaultManager = void 0;
const logger_1 = require("./logger");
const time_provider_1 = require("./time.provider");
class VaultManager {
    constructor(db, timeProvider = new time_provider_1.RealTimeProvider()) {
        this.db = db;
        this.timeProvider = timeProvider;
    }
    /**
     * Set the equity provider to avoid circular dependencies
     */
    setEquityProvider(provider) {
        this.equityProvider = provider;
    }
    async getSharePrice() {
        const totalShares = await this.getTotalShares();
        if (totalShares === 0) {
            return 1.0; // Initial share price
        }
        const totalAssets = await this.getTotalAssets();
        return totalAssets / totalShares;
    }
    async getTotalAssets() {
        // If we have an equity provider (active trading), use its live equity
        if (this.equityProvider) {
            return await this.equityProvider.getCurrentEquity();
        }
        // Fallback: If no equity provider (e.g. at startup or simulation), 
        // use last snapshot or initial deposits
        const snapshot = await this.db.getLatestPortfolioSnapshot();
        if (snapshot && snapshot.timestamp <= this.timeProvider.now()) {
            return snapshot.currentEquity;
        }
        return await this.getTotalDepositedBalance();
    }
    async getTotalShares() {
        // In simulation or time-aware mode, we MUST calculate shares from transactions
        // to respect the timing of deposits.
        const transactions = await this.db.getVaultTransactions();
        const now = this.timeProvider.now();
        if (!transactions || transactions.length === 0)
            return 0;
        const filtered = transactions.filter(t => t.timestamp <= now);
        return filtered.reduce((sum, t) => {
            if (t.type === 'DEPOSIT')
                return sum + Number(t.shares);
            if (t.type === 'WITHDRAWAL')
                return sum - Number(t.shares);
            // SEND and RECEIVE are internal transfers - they don't affect total shares
            return sum;
        }, 0);
    }
    async getTotalDepositedBalance() {
        const transactions = await this.db.getVaultTransactions();
        const now = this.timeProvider.now();
        if (!transactions || transactions.length === 0)
            return 0;
        // Filter transactions to only include those that happened at or before "now"
        const filtered = transactions.filter(t => t.timestamp <= now);
        return filtered.reduce((sum, t) => {
            if (t.type === 'DEPOSIT')
                return sum + Number(t.amount);
            if (t.type === 'WITHDRAWAL')
                return sum - Number(t.amount);
            // COMMISSION_EARNED: User earned commission from their invitee - this is real funds available for trading
            if (t.type === 'COMMISSION_EARNED')
                return sum + Number(t.amount);
            // COMMISSION_PAID: User paid commission to their inviter - reduces available balance
            if (t.type === 'COMMISSION_PAID')
                return sum + Number(t.amount); // amount is negative in this case
            // SEND and RECEIVE are internal transfers - they don't affect total assets
            return sum;
        }, 0);
    }
    async deposit(email, amount) {
        const sharePrice = await this.getSharePrice();
        const shares = amount / sharePrice;
        const timestamp = this.timeProvider.now();
        const transaction = {
            email,
            amount,
            shares,
            type: 'DEPOSIT',
            timestamp
        };
        await this.db.saveVaultTransaction(transaction);
        // Update state
        const currentState = await this.db.getVaultState() || { total_assets: 0, total_shares: 0 };
        const currentTotalAssets = Number(currentState.total_assets || 0);
        const currentTotalShares = Number(currentState.total_shares || 0);
        await this.db.saveVaultState({
            total_assets: currentTotalAssets + amount,
            total_shares: currentTotalShares + shares
        });
        logger_1.logger.info(`[VaultManager] Deposit: ${email} deposited ${amount}, received ${shares.toFixed(4)} shares (Price: ${sharePrice.toFixed(4)})`);
        return transaction;
    }
    async withdraw(email, shares) {
        const sharePrice = await this.getSharePrice();
        const amount = shares * sharePrice;
        const timestamp = this.timeProvider.now();
        // Safety check: Don't allow withdrawing more shares than the user has 
        // (In this simple version we don't track per-user shares yet, but we check total)
        const currentState = await this.db.getVaultState();
        if (!currentState || shares > currentState.total_shares) {
            throw new Error(`Insufficient shares in vault. Requested: ${shares}, Available: ${currentState?.total_shares || 0}`);
        }
        // TODO: Check if enough CASH is available in the exchange (not locked in margin)
        // This check should happen at the exchange adapter level or here if we have access to margin info
        const transaction = {
            email,
            amount,
            shares,
            type: 'WITHDRAWAL',
            timestamp
        };
        await this.db.saveVaultTransaction(transaction);
        const currentTotalAssets = Number(currentState.total_assets || 0);
        const currentTotalShares = Number(currentState.total_shares || 0);
        await this.db.saveVaultState({
            total_assets: Math.max(0, currentTotalAssets - amount),
            total_shares: Math.max(0, currentTotalShares - shares)
        });
        logger_1.logger.info(`[VaultManager] Withdrawal: ${email} withdrew ${amount.toFixed(2)} for ${shares.toFixed(4)} shares (Price: ${sharePrice.toFixed(4)})`);
        return transaction;
    }
}
exports.VaultManager = VaultManager;
