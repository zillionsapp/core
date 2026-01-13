import { IVaultManager, VaultTransaction, VaultTransactionType } from '../../interfaces/vault.interface';
import { DriftClient, BN, QUOTE_PRECISION, convertToNumber } from '@drift-labs/sdk';
import { VaultClient, Vault, IDL } from '@drift-labs/vaults-sdk';
import { PublicKey } from '@solana/web3.js';
import { config } from '../../config/env';
import { Program, AnchorProvider } from '@coral-xyz/anchor';

export class DriftVaultManager implements IVaultManager {
    private vaultClient: VaultClient;
    private vaultAddress: PublicKey;
    private driftClient: DriftClient;

    constructor(driftClient: DriftClient, vaultAddressStr: string) {
        this.driftClient = driftClient;
        this.vaultAddress = new PublicKey(vaultAddressStr);

        // Initialize Anchor Program for Vaults
        // driftClient.provider should act as AnchorProvider
        const provider = this.driftClient.provider;
        const programId = new PublicKey('vAuLTsyrvSjzZ2dnLXRNxUkyQQGKxnN6bXadUACqWxl');
        const program = new Program(IDL, programId, provider as any); // Cast provider if needed

        this.vaultClient = new VaultClient({
            driftClient: this.driftClient,
            program: program as any
        });
    }

    async getSharePrice(): Promise<number> {
        const vaultAccount = await this.vaultClient.getVault(this.vaultAddress);
        const totalAssets = await this.getTotalAssets(vaultAccount);
        const totalShares = await this.getTotalShares(vaultAccount);

        if (totalShares === 0) return 1;
        return totalAssets / totalShares;
    }

    async deposit(email: string, amount: number): Promise<VaultTransaction> {
        // In Drift Vaults, deposit is an on-chain interacting.
        // Usually the "Manager" doesn't deposit for others, users deposit themselves.
        // However, if this bot is acting as a UI backend, maybe it constructs the tx?
        // OR if this is "Manager Deposit".
        // The interface `deposit` implies taking an email (user identifier) and amount.
        // This implies the standard Zillion Vault interface is a "Notebook Vault" (internal ledger),
        // whereas Drift Vault is on-chain.

        // If we are using Drift Vaults, the "User" is the one depositing on-chain.
        // The Bot just manages the trading.
        // So `deposit` here might be irrelevant or we assume functionality to "monitor" deposits?
        // OR the user meant "Simulate a vault behavior" using Drift?
        // No, user said "use this with a vault ... simple trading bot mode or for community purpose".
        // This implies the bot is the Manager.
        // So `deposit` method in the interface is likely used by the API to process user deposits into the internal DB.
        // But if using Drift Vault, the users deposit strictly on-chain.

        // We should throw error or log that manual deposit via API is not supported for On-Chain Vaults,
        // unless we are automating a manager deposit.

        throw new Error('On-chain vault deposits must be done via Solana wallet, not via this API.');
    }

    async withdraw(email: string, shares: number): Promise<VaultTransaction> {
        throw new Error('On-chain vault withdrawals must be done via Solana wallet, not via this API.');
    }

    async getTotalAssets(vaultAccount?: any): Promise<number> {
        const vault = vaultAccount || await this.vaultClient.getVault(this.vaultAddress);
        // Calculate equity
        const vaultEquity = await this.vaultClient.calculateVaultEquity({
            vault
        });
        return convertToNumber(vaultEquity, QUOTE_PRECISION);
    }

    async getTotalShares(vaultAccount?: any): Promise<number> {
        const vault = vaultAccount || await this.vaultClient.getVault(this.vaultAddress);
        return convertToNumber(vault.totalShares, QUOTE_PRECISION); // Shares usually have specific precision, assuming Quote for now or similar
    }

    async getTotalDepositedBalance(): Promise<number> {
        // This usually tracks "Net Deposits".
        // Drift vaults track this via `total_shares` and `user_shares`.
        // We can return Total Assets as a proxy or just net deposits if available.
        return this.getTotalAssets();
    }
}
