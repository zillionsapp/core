import { IDataStore } from '../interfaces/repository.interface';
import { IVaultManager } from '../interfaces/vault.interface';
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
    private vaultManager?: IVaultManager;
    private relationshipCache: Map<string, InviterRelationship | null> = new Map();

    constructor(db: IDataStore) {
        this.db = db;
    }

    setVaultManager(vaultManager: IVaultManager) {
        this.vaultManager = vaultManager;
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
                        tradePnL,
                        trade.exitTimestamp!
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
     * Calculate user's vault share based on shares ownership
     */
    private async calculateUserVaultShare(userId: string): Promise<number> {
        const userShares = await this.getUserNetShares(userId);
        const totalShares = await this.getTotalShares();

        return totalShares > 0 ? userShares / totalShares : 0;
    }

    /**
     * Get user's net shares (DEPOSIT + RECEIVE - WITHDRAWAL - SEND)
     */
    private async getUserNetShares(userId: string): Promise<number> {
        const userEmail = await this.getUserEmail(userId);
        const transactions = await this.db.getVaultTransactions(userEmail);

        return transactions.reduce((sum, t) => {
            if (t.type === 'DEPOSIT') return sum + Number(t.shares);
            if (t.type === 'WITHDRAWAL') return sum - Number(t.shares);
            // Internal transfers might move shares? 
            // Assuming SEND/RECEIVE moves shares same as deposits
            if (t.type === 'RECEIVE') return sum + Number(t.shares);
            if (t.type === 'SEND') return sum - Number(t.shares);
            return sum;
        }, 0);
    }

    /**
     * Get total vault shares
     */
    private async getTotalShares(): Promise<number> {
        if (this.vaultManager) {
            return await this.vaultManager.getTotalShares();
        }
        // Fallback or 0
        return 0;
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
        tradePnL: number,
        timestamp: number
    ): Promise<void> {
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

    /**
     * Reinvest all pending commission payments as virtual shares
     * This keeps the assets in the vault but credits the user's internal ledger
     */
    async processPendingPayouts(): Promise<number> {
        if (!this.vaultManager) {
            logger.warn('[CommissionManager] Vault manager not available for share calculation');
            return 0;
        }

        const pending = await this.db.getPendingCommissionPayments();
        if (!pending || pending.length === 0) return 0;

        logger.info(`[CommissionManager] Found ${pending.length} pending commissions to reinvest`);

        // fetching share price once for the batch likely fine if batch is small, 
        // but strictly should be fresh. Let's fetch once to save RPC calls if speed is needed, 
        // or per loop for accuracy. Batch is safer for rate limits.
        const sharePrice = await this.vaultManager.getSharePrice();
        if (sharePrice <= 0) {
            logger.error('[CommissionManager] Invalid share price, aborting reinvestment');
            return 0;
        }

        let successCount = 0;
        for (const payment of pending) {
            try {
                const commissionAmount = Number(payment.commission_amount);
                const sharesToCredit = commissionAmount / sharePrice;
                const inviterEmail = await this.getUserEmail(payment.inviter_id);

                logger.info(`[CommissionManager] Reinvesting ${commissionAmount} USDC for ${inviterEmail} as ${sharesToCredit.toFixed(6)} shares`);

                // 1. Credit User Ledger (Virtual Shares)
                await this.db.saveVaultTransaction({
                    email: inviterEmail,
                    amount: commissionAmount, // Positive value adds to their "Deposited Value" perspective
                    shares: sharesToCredit,
                    type: 'COMMISSION_REINVESTED',
                    timestamp: Date.now(),
                    inviter_id: payment.inviter_id,
                    invited_user_id: payment.invited_user_id,
                    commission_rate: payment.commission_rate
                });

                // 2. Update status to 'PAID' (conceptually paid via reinvestment) 
                // or we could use a new status 'REINVESTED' if we really wanted, but PAID is compatible
                await this.db.updateCommissionPaymentStatus(payment.id, 'PAID', 'virtual-reinvestment');

                successCount++;
            } catch (error) {
                logger.error(`[CommissionManager] Error reinvesting for ${payment.inviter_id}:`, error);
            }
        }

        return successCount;
    }

    /**
     * Handle immediate commission calculation upon trade closure
     * @param trade The closed trade
     * @param realizedPnl The net profit realized from this trade
     */
    async handleTradeClose(trade: Trade, realizedPnl: number): Promise<void> {
        if (realizedPnl <= 0) return; // No commission on losses

        try {
            // 1. Check if user has an inviter
            const userId = trade.userId || ''; // Assuming Trade has userId
            // In the current system, 'trade' object might not have userId if it comes from exchange only.
            // But usually we trade for a "user" or "global". 
            // If zillion is single-user logic per instance, we might need to know WHO the trade belongs to.
            // Let's assume trade.userId exists as per Trade interface logic usually.
            // If no userId, we can't find Inviter.
            if (!userId) {
                // If this is a global bot wallet, maybe we check a default user?
                // For now, adhere to stringent check
                return;
            }

            const relationship = await this.db.getInviterRelationship(userId);
            if (!relationship) return; // No inviter

            // 2. Calculate Commission
            const commissionAmount = realizedPnl * relationship.commissionRate;
            if (commissionAmount <= 0) return;

            // 3. Get Share Price for Conversion
            const sharePrice = await this.vaultManager.getSharePrice();
            if (sharePrice <= 0) {
                logger.error('[CommissionManager] Invalid share price during trade close, skipping commission');
                return;
            }

            const sharesToCredit = commissionAmount / sharePrice;
            const inviterEmail = relationship.invitedEmail || await this.getUserEmail(relationship.inviterId);

            logger.info(`[CommissionManager] Trade ${trade.id} Closed. PnL: ${realizedPnl}. Comm: ${commissionAmount}. Reinvesting for ${inviterEmail}`);

            // 4. Record Transactions
            // A) Credit Inviter (Virtual Reinvestment)
            await this.db.saveVaultTransaction({
                email: inviterEmail,
                amount: commissionAmount, // Positive: Earned
                shares: sharesToCredit,
                type: 'COMMISSION_EARNED',
                timestamp: Date.now(),
                inviter_id: relationship.inviterId,
                invited_user_id: userId,
                commission_rate: relationship.commissionRate,
                trade_id: trade.id
            });

            // B) Debit Invited User (Fee Payment Record)
            // Note: In a virtual pool model, this might not deduct actual shares if funds are pooled, 
            // but we record the 'cost' for PnL analysis. Amount is negative.
            const userEmail = relationship.invitedEmail || await this.getUserEmail(userId);
            await this.db.saveVaultTransaction({
                email: userEmail,
                amount: -commissionAmount, // Negative: Paid
                shares: 0, // Usually doesn't burn shares unless explicitly designed, just tracks PnL drag
                type: 'COMMISSION_PAID',
                timestamp: Date.now(),
                inviter_id: relationship.inviterId,
                invited_user_id: userId,
                commission_rate: relationship.commissionRate,
                trade_id: trade.id
            });

            logger.info(`[CommissionManager] Recorded commissions for trade ${trade.id}: Earned=${commissionAmount}, Paid=${-commissionAmount}`);

        } catch (error) {
            logger.error(`[CommissionManager] Error handling trade close for commission:`, error);
        }
    }
}
