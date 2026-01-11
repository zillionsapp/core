import { IDataStore } from '../interfaces/repository.interface';
import { Trade } from './types';
export interface InviterRelationship {
    inviterId: string;
    invitedUserId: string;
    commissionRate: number;
    invitedEmail: string;
}
export interface CommissionPayment {
    inviterId: string;
    invitedUserId: string;
    amount: number;
    commissionRate: number;
    tradeId: string;
    timestamp: number;
}
export declare class CommissionManager {
    private db;
    private relationshipCache;
    constructor(db: IDataStore);
    /**
     * Set the inviter relationship for a user
     * Called when a user registers with an invite code
     */
    setInviterRelationship(invitedUserId: string, inviterId: string, commissionRate: number, invitedEmail: string): Promise<void>;
    /**
     * Get the inviter relationship for a user
     */
    getInviterRelationship(userId: string): Promise<InviterRelationship | null>;
    /**
     * Clear relationship cache (useful for testing or cache invalidation)
     */
    clearCache(userId?: string): void;
    /**
     * Calculate commission amount for a trade
     * Commission is only paid on profitable trades
     * Returns the commission amount to be paid to the inviter
     */
    calculateCommission(trade: Trade, commissionRate: number): number;
    /**
     * Process vault-wide commission payments for a profitable trade
     * Distributes commissions proportionally based on each invited user's vault share
     */
    processVaultCommissionPayment(trade: Trade): Promise<number>;
    /**
     * Calculate trade P&L
     */
    private calculateTradePnL;
    /**
     * Calculate user's vault share based on net deposited capital
     */
    private calculateUserVaultShare;
    /**
     * Get user's net deposited capital (DEPOSIT + RECEIVE - WITHDRAWAL - SEND)
     */
    private getUserNetDepositedCapital;
    /**
     * Get total vault assets
     */
    private getTotalVaultAssets;
    /**
     * Get user email by user ID
     */
    private getUserEmail;
    /**
     * Get all inviter relationships
     */
    private getAllInviterRelationships;
    /**
     * Create commission transactions in vault
     */
    private createCommissionTransactions;
    /**
     * Legacy method for backwards compatibility - remove after migration
     * @deprecated Use processVaultCommissionPayment instead
     */
    processCommissionPayment(trade: Trade, userId: string, invitedEmail: string): Promise<number>;
    /**
     * Get total commissions earned by a user (as inviter)
     */
    getTotalCommissionsEarned(userId: string): Promise<number>;
    /**
     * Get total commissions paid by a user (as invited user)
     */
    getTotalCommissionsPaid(userId: string): Promise<number>;
    /**
     * Get commission summary for a user
     */
    getCommissionSummary(userId: string): Promise<{
        totalEarned: number;
        totalPaid: number;
        invitedCount: number;
    }>;
}
