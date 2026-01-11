"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommissionManager = void 0;
const logger_1 = require("./logger");
class CommissionManager {
    constructor(db) {
        this.relationshipCache = new Map();
        this.db = db;
    }
    /**
     * Set the inviter relationship for a user
     * Called when a user registers with an invite code
     */
    async setInviterRelationship(invitedUserId, inviterId, commissionRate, invitedEmail) {
        const relationship = {
            inviterId,
            invitedUserId,
            commissionRate,
            invitedEmail
        };
        // Cache the relationship
        this.relationshipCache.set(invitedUserId, relationship);
        logger_1.logger.info(`[CommissionManager] Set inviter relationship: ${inviterId} -> ${invitedUserId} (rate: ${commissionRate * 100}%)`);
    }
    /**
     * Get the inviter relationship for a user
     */
    async getInviterRelationship(userId) {
        // Check cache first
        if (this.relationshipCache.has(userId)) {
            return this.relationshipCache.get(userId);
        }
        // Fetch from database
        const dbRelationship = await this.db.getInviterRelationship(userId);
        if (!dbRelationship) {
            this.relationshipCache.set(userId, null);
            return null;
        }
        // Transform database relationship to our interface
        const relationship = {
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
    clearCache(userId) {
        if (userId) {
            this.relationshipCache.delete(userId);
        }
        else {
            this.relationshipCache.clear();
        }
    }
    /**
     * Calculate commission amount for a trade
     * Commission is only paid on profitable trades
     * Returns the commission amount to be paid to the inviter
     */
    calculateCommission(trade, commissionRate) {
        if (trade.status !== 'CLOSED' || !trade.exitPrice) {
            return 0;
        }
        // Calculate profit/loss
        let pnl;
        if (trade.side === 'BUY') {
            pnl = (trade.exitPrice - trade.price) * trade.quantity;
        }
        else {
            pnl = (trade.price - trade.exitPrice) * trade.quantity;
        }
        // Only pay commission on profit
        if (pnl <= 0) {
            return 0;
        }
        const commission = pnl * commissionRate;
        logger_1.logger.info(`[CommissionManager] Calculated commission: ${commission.toFixed(4)} (PNL: ${pnl.toFixed(4)}, rate: ${commissionRate * 100}%)`);
        return commission;
    }
    /**
     * Process vault-wide commission payments for a profitable trade
     * Distributes commissions proportionally based on each invited user's vault share
     */
    async processVaultCommissionPayment(trade) {
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
                    await this.createCommissionTransactions(relationship.inviterId, relationship.invitedUserId, commissionAmount, trade.id, tradePnL, trade.exitTimestamp);
                    totalCommissionDistributed += commissionAmount;
                    logger_1.logger.info(`[CommissionManager] Distributed ${commissionAmount.toFixed(4)} commission from ${relationship.invitedUserId} to ${relationship.inviterId} (share: ${(userVaultShare * 100).toFixed(2)}%, rate: ${(relationship.commissionRate * 100).toFixed(1)}%)`);
                }
            }
            catch (error) {
                logger_1.logger.error(`[CommissionManager] Error processing commission for relationship ${relationship.inviterId} -> ${relationship.invitedUserId}:`, error);
            }
        }
        if (totalCommissionDistributed > 0) {
            logger_1.logger.info(`[CommissionManager] Total commission distributed for trade ${trade.id}: ${totalCommissionDistributed.toFixed(4)}`);
        }
        return totalCommissionDistributed;
    }
    /**
     * Calculate trade P&L
     */
    calculateTradePnL(trade) {
        if (trade.status !== 'CLOSED' || !trade.exitPrice) {
            return 0;
        }
        if (trade.side === 'BUY') {
            return (trade.exitPrice - trade.price) * trade.quantity;
        }
        else {
            return (trade.price - trade.exitPrice) * trade.quantity;
        }
    }
    /**
     * Calculate user's vault share based on net deposited capital
     */
    async calculateUserVaultShare(userId) {
        const userNetDeposits = await this.getUserNetDepositedCapital(userId);
        const totalVaultAssets = await this.getTotalVaultAssets();
        return totalVaultAssets > 0 ? userNetDeposits / totalVaultAssets : 0;
    }
    /**
     * Get user's net deposited capital (DEPOSIT + RECEIVE - WITHDRAWAL - SEND)
     */
    async getUserNetDepositedCapital(userId) {
        const userEmail = await this.getUserEmail(userId);
        const transactions = await this.db.getVaultTransactions(userEmail);
        return transactions.reduce((sum, t) => {
            if (t.type === 'DEPOSIT')
                return sum + Number(t.amount);
            if (t.type === 'WITHDRAWAL')
                return sum - Number(t.amount);
            if (t.type === 'RECEIVE')
                return sum + Number(t.amount);
            if (t.type === 'SEND')
                return sum - Number(t.amount);
            // Exclude COMMISSION_EARNED/PAID to avoid circularity
            return sum;
        }, 0);
    }
    /**
     * Get total vault assets
     */
    async getTotalVaultAssets() {
        return this.db.getTotalVaultAssets ? await this.db.getTotalVaultAssets() : 0;
    }
    /**
     * Get user email by user ID
     */
    async getUserEmail(userId) {
        // Use the database adapter method
        return this.db.getUserEmail ? await this.db.getUserEmail(userId) : '';
    }
    /**
     * Get all inviter relationships
     */
    async getAllInviterRelationships() {
        return this.db.getAllInviterRelationships ? await this.db.getAllInviterRelationships() : [];
    }
    /**
     * Create commission transactions in vault
     */
    async createCommissionTransactions(inviterId, invitedUserId, amount, tradeId, tradePnL, timestamp) {
        const inviterEmail = await this.getUserEmail(inviterId);
        const invitedEmail = await this.getUserEmail(invitedUserId);
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
    async processCommissionPayment(trade, userId, invitedEmail) {
        logger_1.logger.warn('[CommissionManager] processCommissionPayment is deprecated, use processVaultCommissionPayment');
        return 0;
    }
    /**
     * Get total commissions earned by a user (as inviter)
     */
    async getTotalCommissionsEarned(userId) {
        return this.db.getTotalCommissionsEarned(userId);
    }
    /**
     * Get total commissions paid by a user (as invited user)
     */
    async getTotalCommissionsPaid(userId) {
        return this.db.getTotalCommissionsPaid(userId);
    }
    /**
     * Get commission summary for a user
     */
    async getCommissionSummary(userId) {
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
exports.CommissionManager = CommissionManager;
