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
     * Process commission payment for a closed trade
     * Called by TradeManager when a trade closes with profit
     */
    async processCommissionPayment(trade: Trade, userId: string, invitedEmail: string): Promise<number> {
        const relationship = await this.getInviterRelationship(userId);
        
        if (!relationship) {
            logger.debug(`[CommissionManager] No inviter relationship for user ${userId}`);
            return 0;
        }

        const commissionAmount = this.calculateCommission(trade, relationship.commissionRate);
        
        if (commissionAmount <= 0) {
            return 0;
        }

        // Create commission transaction for inviter (credit)
        const inviterTransaction = {
            email: '', // Will be looked up or stored separately
            amount: commissionAmount,
            shares: 0,
            type: 'COMMISSION_EARNED',
            timestamp: trade.exitTimestamp || Date.now(),
            inviter_id: relationship.inviterId,
            invited_user_id: userId,
            invited_email: invitedEmail,
            trade_id: trade.id,
            commission_rate: relationship.commissionRate,
            pnl: (trade.exitPrice! - trade.price) * trade.quantity
        };

        // Create commission transaction for invited user (debit)
        const invitedTransaction = {
            email: invitedEmail,
            amount: -commissionAmount,
            shares: 0,
            type: 'COMMISSION_PAID',
            timestamp: trade.exitTimestamp || Date.now(),
            inviter_id: relationship.inviterId,
            invited_user_id: userId,
            invited_email: invitedEmail,
            trade_id: trade.id,
            commission_rate: relationship.commissionRate,
            pnl: (trade.exitPrice! - trade.price) * trade.quantity
        };

        // Save both transactions
        await this.db.saveCommissionTransaction(inviterTransaction);
        await this.db.saveCommissionTransaction(invitedTransaction);

        logger.info(`[CommissionManager] Commission processed: ${commissionAmount.toFixed(4)} from ${invitedEmail} to ${relationship.inviterId}`);
        
        return commissionAmount;
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
