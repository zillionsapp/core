import { IDataStore, PortfolioSnapshot } from '../../interfaces/repository.interface';
import { Trade } from '../../core/types';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../../config/env';

export class SupabaseDataStore implements IDataStore {
    private supabase: SupabaseClient | null = null;
    private inMemoryTrades: Trade[] = [];

    constructor() {
        if (config.SUPABASE_URL && config.SUPABASE_KEY) {
            this.supabase = createClient(config.SUPABASE_URL, config.SUPABASE_KEY);
        } else {
            console.warn('[SupabaseDataStore] Missing credentials. Running in InMemory mode (data will be lost).');
        }
    }

    async saveTrade(trade: Trade): Promise<void> {
        if (!this.supabase) {
            console.log('[InMemoryDB] Saved trade:', trade.id);
            this.inMemoryTrades.push(trade);
            return;
        }
        const { error } = await this.supabase.from('trades').insert(trade);
        if (error) console.error('Error saving trade:', error);
    }

    async getTrades(symbol?: string, limit?: number, offset?: number): Promise<Trade[]> {
        if (!this.supabase) {
            let trades = [...this.inMemoryTrades];
            if (symbol) {
                trades = trades.filter(t => t.symbol === symbol);
            }
            const sorted = trades.sort((a, b) => b.timestamp - a.timestamp);
            if (limit !== undefined) {
                return sorted.slice(offset || 0, (offset || 0) + limit);
            }
            return sorted;
        }

        let query = this.supabase.from('trades').select('*').order('timestamp', { ascending: false });
        if (symbol) query = query.eq('symbol', symbol);

        if (limit !== undefined) {
            query = query.limit(limit).range(offset || 0, (offset || 0) + limit - 1);
        } else {
            // If no limit provided, fetch a very large batch (unlimited for practical purposes)
            // default is often 1,000 in Supabase, we'll request a much higher ceiling.
            query = query.limit(100000);
        }

        const { data, error } = await query;
        if (error) {
            console.error('Error fetching trades:', error);
            return [];
        }
        return (data as any[]) || [];
    }

    async savePortfolioSnapshot(snapshot: PortfolioSnapshot): Promise<void> {
        if (!this.supabase) return;
        const { error } = await this.supabase.from('portfolio_snapshots').insert({
            timestamp: snapshot.timestamp,
            totalValue: snapshot.totalValue,
            holdings: snapshot.holdings,
            pnl: snapshot.pnl,
            "pnlPercentage": snapshot.pnlPercentage,
            "winRate": snapshot.winRate,
            "profitFactor": snapshot.profitFactor,
            "winningTrades": snapshot.winningTrades,
            "losingTrades": snapshot.losingTrades,
            "openTradesCount": snapshot.openTradesCount,
            "totalNotionalValue": snapshot.totalNotionalValue,
            "currentEquity": snapshot.currentEquity,
            "currentBalance": snapshot.currentBalance,
            "walletBalance": snapshot.walletBalance,
            "totalMarginUsed": snapshot.totalMarginUsed,
            "initialBalance": snapshot.initialBalance
        });
        if (error) console.error('Error saving snapshot:', error);
    }

    async getLatestPortfolioSnapshot(): Promise<PortfolioSnapshot | null> {
        if (!this.supabase) return null;

        const now = Date.now();
        const { data, error } = await this.supabase
            .from('portfolio_snapshots')
            .select('*')
            .lte('timestamp', now) // Only fetch snapshots from the past or present
            .order('timestamp', { ascending: false })
            .order('id', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) {
            if (error.code === 'PGRST116') {
                return null; // No rows found is not an error
            }
            console.error('[SupabaseDataStore] Error fetching snapshot:', error);
            return null;
        }

        const snapshot = data as any;
        const result = {
            timestamp: snapshot.timestamp || Date.now(),
            totalValue: snapshot.totalValue ?? snapshot.total_value ?? 0,
            holdings: snapshot.holdings || {},
            pnl: snapshot.pnl ?? snapshot.total_pnl ?? 0,
            pnlPercentage: snapshot.pnlPercentage ?? snapshot.pnl_percentage ?? 0,
            winRate: snapshot.winRate ?? snapshot.win_rate ?? 0,
            profitFactor: snapshot.profitFactor ?? snapshot.profit_factor ?? 0,
            winningTrades: snapshot.winningTrades ?? snapshot.winning_trades ?? 0,
            losingTrades: snapshot.losingTrades ?? snapshot.losing_trades ?? 0,
            openTradesCount: snapshot.openTradesCount ?? snapshot.open_trades_count ?? 0,
            totalNotionalValue: snapshot.totalNotionalValue ?? snapshot.total_notional_value ?? 0,
            currentEquity: snapshot.currentEquity ?? snapshot.current_equity ?? snapshot.totalValue ?? snapshot.total_value ?? 0,
            currentBalance: snapshot.currentBalance ?? snapshot.current_balance ?? snapshot.totalValue ?? snapshot.total_value ?? 0,
            walletBalance: snapshot.walletBalance ?? snapshot.wallet_balance ?? snapshot.currentBalance ?? snapshot.current_balance ?? snapshot.totalValue ?? snapshot.total_value ?? 0,
            totalMarginUsed: snapshot.totalMarginUsed ?? snapshot.total_margin_used ?? 0,
            initialBalance: snapshot.initialBalance ?? snapshot.initial_balance ?? 0
        } as PortfolioSnapshot;

        console.log(`[SupabaseDataStore] Latest Snapshot (ID: ${snapshot.id}): Balance=${result.currentBalance}, Equity=${result.currentEquity}`);
        return result;
    }

    async getPortfolioSnapshots(limit: number = 50, period?: string): Promise<PortfolioSnapshot[]> {
        if (!this.supabase) return [];

        const now = Date.now();
        let query = this.supabase
            .from('portfolio_snapshots')
            .select('*');

        // Apply period filter if specified
        if (period && period !== 'all') {
            let cutoffTime = now;

            switch (period) {
                case '1d':
                    cutoffTime = now - (24 * 60 * 60 * 1000); // 24 hours
                    break;
                case '1w':
                    cutoffTime = now - (7 * 24 * 60 * 60 * 1000); // 7 days
                    break;
                case '1m':
                    cutoffTime = now - (30 * 24 * 60 * 60 * 1000); // 30 days
                    break;
                case '1y':
                    cutoffTime = now - (365 * 24 * 60 * 60 * 1000); // 365 days
                    break;
            }

            query = query.gte('timestamp', cutoffTime).lte('timestamp', now);
        } else {
            // Even if no period is specified, don't show future snapshots in live history
            query = query.lte('timestamp', now);
        }

        // For any period filter (including 1d/1w), we want to fetch all relevant data
        // and let the consolidation logic (or natural size) handle the density.
        let queryLimit = limit;
        if (period) {
            queryLimit = 1000; // Fetch enough for consolidation but stay within safe timeout limits
        }

        const { data, error } = await query
            .order('timestamp', { ascending: false }) // Get most recent first
            .limit(queryLimit);

        if (error) {
            console.error('Error fetching portfolio snapshots:', error);
            return [];
        }

        // Transform the data to match our interface
        let snapshots = (data || []).map((snapshot: any) => ({
            timestamp: snapshot.timestamp || Date.now(),
            totalValue: snapshot.totalValue ?? snapshot.total_value ?? 0,
            holdings: snapshot.holdings || {},
            pnl: snapshot.pnl ?? snapshot.total_pnl ?? 0,
            pnlPercentage: snapshot.pnlPercentage ?? snapshot.pnl_percentage ?? 0,
            winRate: snapshot.winRate ?? snapshot.win_rate ?? 0,
            profitFactor: snapshot.profitFactor ?? snapshot.profit_factor ?? 0,
            winningTrades: snapshot.winningTrades ?? snapshot.winning_trades ?? 0,
            losingTrades: snapshot.losingTrades ?? snapshot.losing_trades ?? 0,
            openTradesCount: snapshot.openTradesCount ?? snapshot.open_trades_count ?? 0,
            totalNotionalValue: snapshot.totalNotionalValue ?? snapshot.total_notional_value ?? 0,
            currentEquity: snapshot.currentEquity ?? snapshot.current_equity ?? snapshot.totalValue ?? snapshot.total_value ?? 0,
            currentBalance: snapshot.currentBalance ?? snapshot.current_balance ?? snapshot.totalValue ?? snapshot.total_value ?? 0,
            walletBalance: snapshot.walletBalance ?? snapshot.wallet_balance ?? snapshot.currentBalance ?? snapshot.current_balance ?? snapshot.totalValue ?? snapshot.total_value ?? 0,
            totalMarginUsed: snapshot.totalMarginUsed ?? snapshot.total_margin_used ?? 0,
            initialBalance: snapshot.initialBalance ?? snapshot.initial_balance ?? 0
        })) as PortfolioSnapshot[];

        // Reverse to get chronological order (oldest to newest) for chart display
        snapshots = snapshots.reverse();

        // Consolidate data if too large (target ~500 points for chart)
        const TARGET_POINTS = 500;
        if (snapshots.length > TARGET_POINTS) {
            snapshots = this.consolidateSnapshots(snapshots, TARGET_POINTS);
        }

        return snapshots;
    }

    private consolidateSnapshots(data: PortfolioSnapshot[], targetCount: number): PortfolioSnapshot[] {
        if (data.length <= targetCount) return data;

        const blockSize = data.length / targetCount;
        const consolidated: PortfolioSnapshot[] = [];

        for (let i = 0; i < targetCount; i++) {
            const startIdx = Math.floor(i * blockSize);
            const endIdx = Math.floor((i + 1) * blockSize);
            const slice = data.slice(startIdx, endIdx);

            if (slice.length === 0) continue;

            const last = slice[slice.length - 1]; // Use latest state properties

            // Average the values for smoother chart
            const avgTotalValue = slice.reduce((sum, item) => sum + item.totalValue, 0) / slice.length;
            const avgEquity = slice.reduce((sum, item) => sum + item.currentEquity, 0) / slice.length;

            consolidated.push({
                ...last,
                totalValue: avgTotalValue,
                currentEquity: avgEquity,
                timestamp: last.timestamp // Use the timestamp of the last item in bucket
            });
        }

        return consolidated;
    }

    async saveBacktestResult(result: any): Promise<void> {
        if (!this.supabase) {
            console.log('[InMemoryDB] Saved Backtest result');
            return;
        }
        const { error } = await this.supabase.from('backtest_results').insert({ result, timestamp: Date.now() });
        if (error) console.error('Error saving backtest:', error);
    }

    async getBacktestResults(limit: number = 10): Promise<any[]> {
        if (!this.supabase) return [];

        const { data, error } = await this.supabase
            .from('backtest_results')
            .select('*')
            .order('timestamp', { ascending: false })
            .limit(limit);

        if (error) {
            console.error('Error fetching backtests:', error);
            return [];
        }
        return data || [];
    }

    async getActiveTrade(symbol: string): Promise<Trade | null> {
        if (!this.supabase) {
            const openTrades = this.inMemoryTrades.filter(t => t.symbol === symbol && t.status === 'OPEN');
            return openTrades.sort((a, b) => b.timestamp - a.timestamp)[0] || null;
        }

        const { data, error } = await this.supabase
            .from('trades')
            .select('*')
            .eq('symbol', symbol)
            .eq('status', 'OPEN')
            .order('timestamp', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) {
            console.error('Error fetching active trade:', error);
            return null;
        }
        return data as Trade;
    }

    async getOpenTrades(): Promise<Trade[]> {
        if (!this.supabase) {
            return this.inMemoryTrades.filter(t => t.status === 'OPEN').sort((a, b) => b.timestamp - a.timestamp);
        }

        const allOpenTrades: Trade[] = [];
        let from = 0;
        const batchSize = 1000;
        let hasMore = true;

        while (hasMore) {
            const { data, error } = await this.supabase
                .from('trades')
                .select('*')
                .eq('status', 'OPEN')
                .order('timestamp', { ascending: false })
                .range(from, from + batchSize - 1);

            if (error) {
                console.error('Error fetching open trades:', error);
                return allOpenTrades; // Return what we have so far
            }

            if (data && data.length > 0) {
                allOpenTrades.push(...(data as Trade[]));
                from += batchSize;
                // If we got fewer results than requested, we've reached the end
                if (data.length < batchSize) {
                    hasMore = false;
                }
            } else {
                hasMore = false;
            }
        }

        return allOpenTrades;
    }

    async updateTrade(id: string, updates: Partial<Trade>): Promise<void> {
        if (!this.supabase) {
            const index = this.inMemoryTrades.findIndex(t => t.id === id);
            if (index !== -1) {
                this.inMemoryTrades[index] = { ...this.inMemoryTrades[index], ...updates };
            }
            return;
        }

        const { error } = await this.supabase
            .from('trades')
            .update(updates)
            .eq('id', id);

        if (error) {
            console.error('Error updating trade:', error);
        }
    }

    async getRiskState(): Promise<{ startOfDayBalance: number, lastResetDay: number } | null> {
        if (!this.supabase) return null;

        const { data, error } = await this.supabase
            .from('kv_store')
            .select('value')
            .eq('key', 'risk_state')
            .maybeSingle();

        if (error) {
            // Table might not exist yet, ignore error or log debug
            return null;
        }
        return data?.value || null;
    }

    async saveRiskState(state: { startOfDayBalance: number, lastResetDay: number }): Promise<void> {
        if (!this.supabase) return;

        const { error } = await this.supabase
            .from('kv_store')
            .upsert({ key: 'risk_state', value: state });

        if (error) console.error('Error saving risk state:', error);
    }

    async updateChartCache(period: string, data: any[]): Promise<void> {
        if (!this.supabase) return;
        const { error } = await this.supabase
            .from('portfolio_chart_cache')
            .upsert({ period, data, updated_at: new Date().toISOString() });
        if (error) console.error(`Error updating chart cache for ${period}:`, error);
    }

    async getChartCache(period: string): Promise<any[]> {
        if (!this.supabase) return [];
        const { data, error } = await this.supabase
            .from('portfolio_chart_cache')
            .select('data')
            .eq('period', period)
            .maybeSingle();

        if (error) {
            console.error(`Error fetching chart cache for ${period}:`, error);
            return [];
        }
        return data?.data || [];
    }

    async saveVaultTransaction(transaction: any): Promise<void> {
        if (!this.supabase) return;
        const { error } = await this.supabase.from('vault_transactions').insert(transaction);
        if (error) console.error('Error saving vault transaction:', error);
    }

    async getVaultTransactions(email?: string): Promise<any[]> {
        if (!this.supabase) return [];
        let query = this.supabase.from('vault_transactions').select('*').order('timestamp', { ascending: false });
        if (email) query = query.eq('email', email);
        const { data, error } = await query;
        if (error) {
            console.error('Error fetching vault transactions:', error);
            return [];
        }
        return data || [];
    }

    async getVaultState(): Promise<any | null> {
        if (!this.supabase) return null;
        const { data, error } = await this.supabase
            .from('vault_state')
            .select('*')
            .eq('id', 1)
            .maybeSingle();
        if (error) {
            console.error('Error fetching vault state:', error);
            return null;
        }
        return data;
    }

    async saveVaultState(state: any): Promise<void> {
        if (!this.supabase) return;
        const { error } = await this.supabase
            .from('vault_state')
            .upsert({ id: 1, ...state });
        if (error) console.error('Error saving vault state:', error);
    }

    // ========== Commission Management ==========

    async saveCommissionTransaction(transaction: any): Promise<void> {
        if (!this.supabase) {
            console.log('[InMemoryDB] Saved commission transaction:', transaction);
            return;
        }

        // Try saving to commission_transactions table first
        const { error } = await this.supabase.from('commission_transactions').insert({
            inviter_id: transaction.inviter_id,
            invited_user_id: transaction.invited_user_id,
            transaction_date: new Date(transaction.timestamp).toISOString().split('T')[0],
            invited_portfolio_value: transaction.invited_portfolio_value || 0,
            invited_daily_pnl: transaction.pnl || 0,
            commission_earned: Math.abs(transaction.amount)
        });

        if (error) {
            console.error('Error saving commission transaction:', error);
            // Fallback: try saving to vault_transactions if commission_transactions fails
            const { error: vaultError } = await this.supabase.from('vault_transactions').insert({
                email: transaction.email || 'unknown',
                amount: transaction.amount,
                shares: 0,
                type: transaction.type,
                timestamp: transaction.timestamp,
                inviter_id: transaction.inviter_id,
                invited_user_id: transaction.invited_user_id,
                commission_rate: transaction.commission_rate
            });
            if (vaultError) console.error('Error saving commission to vault_transactions:', vaultError);
        }
    }

    async getInviterRelationship(userId: string): Promise<{ inviterId: string; commissionRate: number; invitedEmail: string } | null> {
        if (!this.supabase) return null;

        // Get the user's invite code usage to find who invited them
        const { data: usageData, error: usageError } = await this.supabase
            .from('invite_code_usages')
            .select('invite_code_id')
            .eq('used_by', userId)
            .limit(1)
            .maybeSingle();

        if (usageError || !usageData) {
            console.debug('[SupabaseDataStore] No inviter relationship found for user:', userId);
            return null;
        }

        // Get the invite code details
        const { data: inviteData, error: inviteError } = await this.supabase
            .from('invite_codes')
            .select('created_by, commission_rate')
            .eq('id', usageData.invite_code_id)
            .maybeSingle();

        if (inviteError || !inviteData) {
            console.debug('[SupabaseDataStore] Invite code not found:', usageData.invite_code_id);
            return null;
        }

        return {
            inviterId: inviteData.created_by,
            commissionRate: inviteData.commission_rate || 0.10,
            invitedEmail: ''
        };
    }

    async getTotalCommissionsEarned(userId: string): Promise<number> {
        if (!this.supabase) return 0;

        const { data, error } = await this.supabase
            .from('vault_transactions')
            .select('amount')
            .eq('inviter_id', userId)
            .eq('type', 'COMMISSION_EARNED');

        if (error) {
            console.error('Error fetching total commissions earned:', error);
            return 0;
        }

        return data.reduce((sum, row) => sum + Math.abs(row.amount || 0), 0);
    }

    async getTotalCommissionsPaid(userId: string): Promise<number> {
        if (!this.supabase) return 0;

        const { data, error } = await this.supabase
            .from('vault_transactions')
            .select('amount')
            .eq('invited_user_id', userId)
            .eq('type', 'COMMISSION_PAID');

        if (error) {
            console.error('Error fetching total commissions paid:', error);
            return 0;
        }

        return data.reduce((sum, row) => sum + Math.abs(row.amount || 0), 0);
    }

    async getInvitedUsersCount(inviterId: string): Promise<number> {
        if (!this.supabase) return 0;

        const { count, error } = await this.supabase
            .from('invite_code_usages')
            .select('*', { count: 'exact', head: true })
            .eq('invite_code_id',
                this.supabase
                    .from('invite_codes')
                    .select('id')
                    .eq('created_by', inviterId)
            );

        if (error) {
            console.error('Error counting invited users:', error);
            return 0;
        }

        return count || 0;
    }

    async getAllInviterRelationships(): Promise<Array<{ inviterId: string; invitedUserId: string; commissionRate: number; invitedEmail: string }>> {
        if (!this.supabase) return [];

        // First get all invite code usages with their codes
        const { data: usages, error: usagesError } = await this.supabase
            .from('invite_code_usages')
            .select(`
                used_by,
                invite_codes!inner (
                    created_by,
                    commission_rate
                )
            `);

        if (usagesError) {
            console.error('Error fetching invite code usages:', usagesError);
            return [];
        }

        const relationships: Array<{ inviterId: string; invitedUserId: string; commissionRate: number; invitedEmail: string }> = [];

        for (const usage of (usages || [])) {
            const userEmail = await this.getUserEmail(usage.used_by);
            const inviteCode = Array.isArray(usage.invite_codes) ? usage.invite_codes[0] : usage.invite_codes;
            relationships.push({
                inviterId: inviteCode.created_by,
                invitedUserId: usage.used_by,
                commissionRate: inviteCode.commission_rate || 0.10,
                invitedEmail: userEmail
            });
        }

        return relationships;
    }

    async getUserEmail(userId: string): Promise<string> {
        if (!this.supabase) {
            console.error(`[SupabaseDataStore] No Supabase client available`);
            return '';
        }

        try {
            console.log(`[SupabaseDataStore] Fetching email for user ${userId}`);
            // Use admin API to access auth.users
            const { data: userData, error: adminError } = await this.supabase.auth.admin.getUserById(userId);

            if (adminError) {
                console.error(`[SupabaseDataStore] Admin API error for user ${userId}:`, adminError);
                return '';
            }

            const email = userData.user?.email || '';
            console.log(`[SupabaseDataStore] Found email for user ${userId}: ${email}`);
            if (!email) {
                console.warn(`[SupabaseDataStore] User ${userId} has no email in auth.users`);
            }

            return email;
        } catch (error) {
            console.error(`[SupabaseDataStore] Exception accessing admin API for user ${userId}:`, error);
            return '';
        }
    }

    async getTotalVaultAssets(): Promise<number> {
        if (!this.supabase) return 0;

        // Get latest portfolio snapshot for current equity
        const snapshot = await this.getLatestPortfolioSnapshot();
        if (snapshot) {
            return snapshot.currentEquity;
        }

        // Fallback: calculate from vault transactions
        const transactions = await this.getVaultTransactions();
        const now = Date.now();

        const filtered = transactions.filter(t => t.timestamp <= now);
        return filtered.reduce((sum, t) => {
            if (t.type === 'DEPOSIT') return sum + Number(t.amount);
            if (t.type === 'WITHDRAWAL') return sum - Number(t.amount);
            if (t.type === 'RECEIVE') return sum + Number(t.amount);
            if (t.type === 'SEND') return sum - Number(t.amount);
            if (t.type === 'COMMISSION_EARNED') return sum + Number(t.amount);
            if (t.type === 'COMMISSION_PAID') return sum + Number(t.amount); // amount is negative
            return sum;
        }, 0);
    }

    // Payout Management
    async getPendingCommissionPayments(): Promise<any[]> {
        if (!this.supabase) return [];

        const { data, error } = await this.supabase
            .from('commission_payments')
            .select('*')
            .eq('status', 'PENDING');

        if (error) {
            console.error('Error fetching pending commission payments:', error);
            return [];
        }

        return data || [];
    }

    async getUserWallet(userId: string): Promise<string | null> {
        if (!this.supabase) return null;

        const { data, error } = await this.supabase
            .from('user_wallets')
            .select('wallet_address')
            .eq('user_id', userId)
            .maybeSingle();

        if (error) {
            console.debug(`[SupabaseDataStore] No wallet found for user ${userId}`);
            return null;
        }

        return data?.wallet_address || null;
    }

    async updateCommissionPaymentStatus(paymentId: string, status: 'PAID' | 'CANCELLED', txHash?: string): Promise<void> {
        if (!this.supabase) return;

        const updates: any = {
            status,
            updated_at: new Date().toISOString()
        };

        if (status === 'PAID') {
            updates.paid_at = new Date().toISOString();
        }

        const { error } = await this.supabase
            .from('commission_payments')
            .update(updates)
            .eq('id', paymentId);

        if (error) {
            console.error(`Error updating commission payment ${paymentId}:`, error);
        }
    }

    async calculateDailyCommissions(targetDate?: string): Promise<number> {
        if (!this.supabase) return 0;

        // Use provided date or today's date
        const dateStr = targetDate || new Date().toISOString().split('T')[0];

        const { data, error } = await this.supabase.rpc('calculate_daily_commissions', {
            target_date: dateStr
        });

        if (error) {
            console.error('[SupabaseDataStore] Error executing calculate_daily_commissions:', error);
            return 0;
        }

        return typeof data === 'number' ? data : 0;
    }
}
