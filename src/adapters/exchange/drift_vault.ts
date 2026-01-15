import { IVaultManager, VaultTransaction, VaultTransactionType } from '../../interfaces/vault.interface';
import { DriftClient, BN, QUOTE_PRECISION, convertToNumber } from '@drift-labs/sdk';
import { VaultClient, Vault, IDL, WithdrawUnit } from '@drift-labs/vaults-sdk';
import { PublicKey } from '@solana/web3.js';
import { config } from '../../config/env';
import { Program, AnchorProvider } from '@coral-xyz/anchor';
import {
    createTransferInstruction,
    getAssociatedTokenAddress,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
    getAccount,
    createAssociatedTokenAccountInstruction
} from '@solana/spl-token';
import { Transaction, SystemProgram } from '@solana/web3.js';

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

    async payoutCommission(destinationAddress: string, amount: number): Promise<string> {
        if (amount <= 0) {
            throw new Error('Commission amount must be greater than 0');
        }

        console.log(`[DriftVaultManager] Payout Commission. Dest: ${destinationAddress}, Amount: ${amount}`);

        const wallet = this.driftClient.wallet;
        if (!wallet) throw new Error('Wallet not initialized');

        const usdcMarket = this.driftClient.getSpotMarketAccount(0);
        if (!usdcMarket) throw new Error('USDC Spot Market not found');
        const usdcMint = usdcMarket.mint;

        const sourceAta = await getAssociatedTokenAddress(usdcMint, wallet.publicKey);
        const destPubkey = new PublicKey(destinationAddress);
        const destAta = await getAssociatedTokenAddress(usdcMint, destPubkey);

        const transaction = new Transaction();

        // 1. Check if Destination ATA exists
        let createAta = false;
        try {
            await getAccount(this.driftClient.connection, destAta);
        } catch (e: any) {
            createAta = true;
        }

        if (createAta) {
            console.log(`[DriftVaultManager] Creating ATA for destination ${destinationAddress}`);
            transaction.add(
                createAssociatedTokenAccountInstruction(
                    wallet.publicKey,
                    destAta,
                    destPubkey,
                    usdcMint
                )
            );
        }

        // 2. Add Transfer Instruction
        const amountNative = BigInt(Math.floor(amount * 1000000)); // USDC 6 decimals
        transaction.add(
            createTransferInstruction(
                sourceAta,
                destAta,
                wallet.publicKey,
                amountNative
            )
        );

        // 3. Send Transaction
        const txSig = await this.driftClient.txSender.send(
            transaction,
            [],
            this.driftClient.opts
        );

        console.log(`[DriftVaultManager] Commission payout successful: ${txSig.txSig}`);
        return txSig.txSig;
    }

    async redeemManagerShares(): Promise<string> {
        console.log('[DriftVaultManager] Checking for manager shares to redeem...');

        try {
            const vault = await this.vaultClient.getVault(this.vaultAddress);

            // Calculate total shares available to manager (profit share + management fee)
            // Fix: property is managerTotalFee, not managerTotalFeeShare
            const totalManagerShares = vault.managerTotalProfitShare.add(vault.managerTotalFee);
            const sharesNumber = convertToNumber(totalManagerShares, QUOTE_PRECISION); // Shares use quote precision usually 6? Or 9? SDK says PRECISION

            if (sharesNumber <= 0.01) { // Minimum threshold
                console.log(`[DriftVaultManager] No significant manager shares to redeem (${sharesNumber}).`);
                return 'skipped-low-balance';
            }

            console.log(`[DriftVaultManager] Found ${sharesNumber} shares to redeem.`);

            // Drift Vault Withdrawal Flow:
            // 1. Manager requests withdrawal (if not already pending equivalent amount)
            // 2. Withdrawal period passes (if configured) -> For Manager fees usually instant or shorter?
            // Note: Manager fees might be withdrawable instantly depending on vault config.

            // Check if we can withdraw directly
            // Using managerWithdraw which handles

            // Attempt request first just in case
            try {
                const requestTx = await this.vaultClient.managerRequestWithdraw(
                    this.vaultAddress,
                    totalManagerShares,
                    WithdrawUnit.SHARES
                );
                console.log(`[DriftVaultManager] Manager withdrawal requested: ${requestTx}`);
            } catch (e) {
                // Ignore if it fails (might be because we can already withdraw or request exists)
                console.log('[DriftVaultManager] Request withdraw note:', (e as any).message);
            }

            // Execute withdrawal
            const tx = await this.vaultClient.managerWithdraw(this.vaultAddress);
            console.log(`[DriftVaultManager] Manager shares redeemed: ${tx}`);
            return tx;

        } catch (error) {
            console.error('[DriftVaultManager] Error redeeming manager shares:', error);
            throw error;
        }
    }

}
