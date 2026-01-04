import { IVaultManager, VaultTransaction, VaultState } from '../interfaces/vault.interface';
import { IDataStore } from '../interfaces/repository.interface';
import { logger } from './logger';

export interface EquityProvider {
    getCurrentEquity(): Promise<number>;
}

export class VaultManager implements IVaultManager {
    private equityProvider?: EquityProvider;

    constructor(private db: IDataStore) { }

    /**
     * Set the equity provider to avoid circular dependencies
     */
    setEquityProvider(provider: EquityProvider) {
        this.equityProvider = provider;
    }

    async getSharePrice(): Promise<number> {
        const state = await this.db.getVaultState();
        if (!state || state.total_shares === 0) {
            return 1.0; // Initial share price
        }

        const totalAssets = await this.getTotalAssets();
        return totalAssets / state.total_shares;
    }

    async getTotalAssets(): Promise<number> {
        if (this.equityProvider) {
            return await this.equityProvider.getCurrentEquity();
        }

        // Fallback: If no equity provider (e.g. at startup), use last snapshot or initial deposits
        const snapshot = await this.db.getLatestPortfolioSnapshot();
        if (snapshot) {
            return snapshot.currentEquity;
        }

        return await this.getTotalDepositedBalance();
    }

    async getTotalShares(): Promise<number> {
        const state = await this.db.getVaultState();
        return state?.total_shares || 0;
    }

    async getTotalDepositedBalance(): Promise<number> {
        const transactions = await this.db.getVaultTransactions();
        if (!transactions || transactions.length === 0) return 0;
        return transactions.reduce((sum, t) => {
            return t.type === 'DEPOSIT' ? sum + Number(t.amount) : sum - Number(t.amount);
        }, 0);
    }

    async deposit(email: string, amount: number): Promise<VaultTransaction> {
        const sharePrice = await this.getSharePrice();
        const shares = amount / sharePrice;
        const timestamp = Date.now();

        const transaction: VaultTransaction = {
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

        logger.info(`[VaultManager] Deposit: ${email} deposited ${amount}, received ${shares.toFixed(4)} shares (Price: ${sharePrice.toFixed(4)})`);
        return transaction;
    }

    async withdraw(email: string, shares: number): Promise<VaultTransaction> {
        const sharePrice = await this.getSharePrice();
        const amount = shares * sharePrice;
        const timestamp = Date.now();

        // Safety check: Don't allow withdrawing more shares than the user has 
        // (In this simple version we don't track per-user shares yet, but we check total)
        const currentState = await this.db.getVaultState();
        if (!currentState || shares > currentState.total_shares) {
            throw new Error(`Insufficient shares in vault. Requested: ${shares}, Available: ${currentState?.total_shares || 0}`);
        }

        // TODO: Check if enough CASH is available in the exchange (not locked in margin)
        // This check should happen at the exchange adapter level or here if we have access to margin info

        const transaction: VaultTransaction = {
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

        logger.info(`[VaultManager] Withdrawal: ${email} withdrew ${amount.toFixed(2)} for ${shares.toFixed(4)} shares (Price: ${sharePrice.toFixed(4)})`);
        return transaction;
    }
}
