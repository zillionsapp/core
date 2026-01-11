import { IDataStore } from '../interfaces/repository.interface';
import { Trade } from './types';
import { logger } from './logger';

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

export class CommissionManager {
    private db: IDataStore;
    private relationshipCache: Map<string, InviterRelationship | null> = new Map();

    constructor(db: IDataStore) {
        this.db = db;
    }

    /**
     * Set the inviter relationship for a user
     * Called when a user registers with an invite code
     */
    async setInviterRelationship(invitedUserId: string, inviterId: string, commissionRate: number, invitedEmail: string): Promise<void> {
        const relationship: InviterRelationship = {
            inviterId,
            invitedUserId,
            commissionRate,
            invitedEmail
        };
        
        // Cache the relationship
        this.relationshipCache.set(invitedUserId, relationship);
        
        logger.info(`[CommissionManager] Set inviter relationship: ${inviterId} -> ${invitedUserId} (rate: ${commissionRate * 100}%)`);
    }

    /**
     * Get the inviter relationship for a user
     */
    async getInviterRelationship(userId: string): Promise<InviterRelationship | null> {
        // Check cache first
        if (this.relationshipCache.has(userId)) {
            return this.relationshipCache.get(userId)!;
        }

        // Fetch from database
        const dbRelationship = await this.db.getInviterRelationship(userId);
        
        if (!dbRelationship) {
            this.relationshipCache.set(userId, null);
            return null;
        }

        // Transform database relationship to our interface
        const relationship: InviterRelationship = {
            inviterId: dbRelationship.inviterId,
            invitedUserId: userId,
            commissionRate: dbRelationship.commissionRate,
            invitedEmail: dbRelationship.invitedEmail
        };
        
        this.relationshipCache.set(userId, relationship);
        
        return relationship;
    }

    /**
     * Clear relationship cache (useful for testing or cache invalidation)
     */
    clearCache(userId?: string): void {
        if (userId) {
            this.relationshipCache.delete(userId);
        } else {
            this.relationshipCache.clear();
        }
    }

    /**
     * Calculate commission amount for a trade
     * Commission is only paid on profitable trades
     * Returns the commission amount to be paid to the inviter
     */
    calculateCommission(trade: Trade, commissionRate: number): number {
        if (trade.status !== 'CLOSED' || !trade.exitPrice) {
            return 0;
        }

        // Calculate profit/loss
        let pnl: number;
        if (trade.side === 'BUY') {
            pnl = (trade.exitPrice - trade.price) * trade.quantity;
        } else {
            pnl = (trade.price - trade.exitPrice) * trade.quantity;
        }

        // Only pay commission on profit
        if (pnl <= 0) {
            return 0;
        }

        const commission = pnl * commissionRate;
        logger.info(`[CommissionManager] Calculated commission: ${commission.toFixed(4)} (PNL: ${pnl.toFixed(4)}, rate: ${commissionRate * 100}%)`);
        
        return commission;
    }

    /**
     * Process vault-wide commission payments for a profitable trade
     * Distributes commissions proportionally based on each invited user's vault share
     */
    async processVaultCommissionPayment(trade: Trade): Promise<number> {
        console.log(`[CommissionManager] processVaultCommissionPayment called for trade ${trade.id}`);

        // Calculate trade P&L
        const tradePnL = this.calculateTradePnL(trade);
        console.log(`[CommissionManager] Trade P&L: ${tradePnL}`);

        if (tradePnL <= 0) {
            console.log(`[CommissionManager] No commission - trade is not profitable`);
            return 0; // No commissions on losing trades
        }

        // Get all inviter relationships
        const allRelationships = await this.getAllInviterRelationships();
        if (allRelationships.length === 0) {
            return 0;
        }

        let totalCommissionDistributed = 0;

        for (const relationship of allRelationships) {
            try {
                // Calculate user's vault share based on net deposited capital
                const userVaultShare = await this.calculateUserVaultShare(relationship.invitedUserId);
                if (userVaultShare <= 0) {
                    continue; // User has no vault share
                }

                // Calculate user's share of the trade P&L
                const userShareOfPnL = tradePnL * userVaultShare;

                // Calculate commission amount
                const commissionAmount = userShareOfPnL * relationship.commissionRate;

                if (commissionAmount > 0) {
                    // Create commission transactions
                    await this.createCommissionTransactions(
                        relationship.inviterId,
                        relationship.invitedUserId,
                        commissionAmount,
                        trade.id,
                        tradePnL
                    );

                    totalCommissionDistributed += commissionAmount;

                    logger.info(`[CommissionManager] Distributed ${commissionAmount.toFixed(4)} commission from ${relationship.invitedUserId} to ${relationship.inviterId} (share: ${(userVaultShare * 100).toFixed(2)}%, rate: ${(relationship.commissionRate * 100).toFixed(1)}%)`);
                }
            } catch (error) {
                logger.error(`[CommissionManager] Error processing commission for relationship ${relationship.inviterId} -> ${relationship.invitedUserId}:`, error);
            }
        }

        if (totalCommissionDistributed > 0) {
            logger.info(`[CommissionManager] Total commission distributed for trade ${trade.id}: ${totalCommissionDistributed.toFixed(4)}`);
        }

        return totalCommissionDistributed;
    }

    /**
     * Calculate trade P&L
     */
    private calculateTradePnL(trade: Trade): number {
        if (trade.status !== 'CLOSED' || !trade.exitPrice) {
            return 0;
        }

        if (trade.side === 'BUY') {
            return (trade.exitPrice - trade.price) * trade.quantity;
        } else {
            return (trade.price - trade.exitPrice) * trade.quantity;
        }
    }

    /**
     * Calculate user's vault share based on net deposited capital
     */
    private async calculateUserVaultShare(userId: string): Promise<number> {
        const userNetDeposits = await this.getUserNetDepositedCapital(userId);
        const totalVaultAssets = await this.getTotalVaultAssets();

        return totalVaultAssets > 0 ? userNetDeposits / totalVaultAssets : 0;
    }

    /**
     * Get user's net deposited capital (DEPOSIT + RECEIVE - WITHDRAWAL - SEND)
     */
    private async getUserNetDepositedCapital(userId: string): Promise<number> {
        const userEmail = await this.getUserEmail(userId);
        const transactions = await this.db.getVaultTransactions(userEmail);

        return transactions.reduce((sum, t) => {
            if (t.type === 'DEPOSIT') return sum + Number(t.amount);
            if (t.type === 'WITHDRAWAL') return sum - Number(t.amount);
            if (t.type === 'RECEIVE') return sum + Number(t.amount);
            if (t.type === 'SEND') return sum - Number(t.amount);
            // Exclude COMMISSION_EARNED/PAID to avoid circularity
            return sum;
        }, 0);
    }

    /**
     * Get total vault assets
     */
    private async getTotalVaultAssets(): Promise<number> {
        return this.db.getTotalVaultAssets ? await this.db.getTotalVaultAssets() : 0;
    }

    /**
     * Get user email by user ID
     */
    private async getUserEmail(userId: string): Promise<string> {
        // Use the database adapter method
        return this.db.getUserEmail ? await this.db.getUserEmail(userId) : '';
    }

    /**
     * Get all inviter relationships
     */
    private async getAllInviterRelationships(): Promise<InviterRelationship[]> {
        return this.db.getAllInviterRelationships ? await this.db.getAllInviterRelationships() : [];
    }

    /**
     * Create commission transactions in vault
     */
    private async createCommissionTransactions(
        inviterId: string,
        invitedUserId: string,
        amount: number,
        tradeId: string,
        tradePnL: number
    ): Promise<void> {
        const inviterEmail = await this.getUserEmail(inviterId);
        const invitedEmail = await this.getUserEmail(invitedUserId);
        const timestamp = Date.now();

        // Get the commission rate for this relationship
        const relationship = await this.getInviterRelationship(invitedUserId);
        const commissionRate = relationship?.commissionRate || 0.1;

        // Credit inviter
        const inviterTransaction = {
            email: inviterEmail,
            amount: amount,
            shares: 0,
            type: 'COMMISSION_EARNED',
            timestamp,
            inviter_id: inviterId,
            invited_user_id: invitedUserId,
            invited_portfolio_value: 0, // Could be calculated if needed
            invited_daily_pnl: tradePnL, // This is the trade P&L, not daily
            commission_rate: commissionRate
        };

        // Debit invited user
        const invitedTransaction = {
            email: invitedEmail,
            amount: -amount,
            shares: 0,
            type: 'COMMISSION_PAID',
            timestamp,
            inviter_id: inviterId,
            invited_user_id: invitedUserId,
            invited_portfolio_value: 0, // Could be calculated if needed
            invited_daily_pnl: tradePnL, // This is the trade P&L, not daily
            commission_rate: commissionRate
        };

        // Save to vault transactions
        await this.db.saveVaultTransaction(inviterTransaction);
        await this.db.saveVaultTransaction(invitedTransaction);
    }

    /**
     * Legacy method for backwards compatibility - remove after migration
     * @deprecated Use processVaultCommissionPayment instead
     */
    async processCommissionPayment(trade: Trade, userId: string, invitedEmail: string): Promise<number> {
        logger.warn('[CommissionManager] processCommissionPayment is deprecated, use processVaultCommissionPayment');
        return 0;
    }

    /**
     * Get total commissions earned by a user (as inviter)
     */
    async getTotalCommissionsEarned(userId: string): Promise<number> {
        return this.db.getTotalCommissionsEarned(userId);
    }

    /**
     * Get total commissions paid by a user (as invited user)
     */
    async getTotalCommissionsPaid(userId: string): Promise<number> {
        return this.db.getTotalCommissionsPaid(userId);
    }

    /**
     * Get commission summary for a user
     */
    async getCommissionSummary(userId: string): Promise<{
        totalEarned: number;
        totalPaid: number;
        invitedCount: number;
    }> {
        const [totalEarned, totalPaid] = await Promise.all([
            this.getTotalCommissionsEarned(userId),
            this.getTotalCommissionsPaid(userId)
        ]);

        // Count invited users
        const invitedCount = await this.db.getInvitedUsersCount(userId);

        return {
            totalEarned,
            totalPaid,
            invitedCount
        };
    }
}
