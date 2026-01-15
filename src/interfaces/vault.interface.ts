export type VaultTransactionType = 'DEPOSIT' | 'WITHDRAWAL' | 'SEND' | 'RECEIVE' | 'COMMISSION_EARNED' | 'COMMISSION_PAID';

export interface VaultTransaction {
    id?: string;
    email: string;
    amount: number;
    shares: number;
    type: VaultTransactionType;
    timestamp: number;
    // Commission fields
    inviter_id?: string;
    invited_user_id?: string;
    commission_rate?: number;
}

export interface VaultState {
    totalAssets: number;
    totalShares: number;
    updatedAt?: string;
}

export interface IVaultManager {
    /**
     * Get the current share price (Total Assets / Total Shares)
     */
    getSharePrice(): Promise<number>;

    /**
     * Handle a deposit: calculate shares to issue and persist transaction
     */
    deposit(email: string, amount: number): Promise<VaultTransaction>;

    /**
     * Handle a withdrawal: calculate amount to return and persist transaction
     * Throws error if withdrawal exceeds available cash (Total Assets - Margin)
     */
    withdraw(email: string, shares: number): Promise<VaultTransaction>;

    /**
     * Get the total amount of assets in the vault (Cash + Unrealized PnL)
     */
    getTotalAssets(): Promise<number>;

    /**
     * Get the total number of shares issued
     */
    getTotalShares(): Promise<number>;

    /**
     * Get the current vault balance (Total Deposits - Total Withdrawals)
     * This is useful for the "initial balance" logic
     */
    getTotalDepositedBalance(): Promise<number>;

    /**
     * Pay out commission to a specific wallet address
     * @param destinationAddress format: depends on implementation (e.g., Solana PublicKey, or Email for Paper)
     * @param amount amount in USDC
     */
    payoutCommission?(destinationAddress: string, amount: number): Promise<string>;

    /**
     * Redeem manager shares/fees from the vault to the manager's wallet.
     * Essential for funding the payout wallet.
     */
    redeemManagerShares?(): Promise<string>;
}
