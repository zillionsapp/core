import { Order, Trade } from '../core/types';

export interface PortfolioSnapshot {
    timestamp: number;
    totalValue: number; // In quote currency (e.g. USDT)
    holdings: Record<string, number>; // asset -> quantity
    pnl: number; // Total realized PnL
    pnlPercentage: number; // PnL as percentage of initial balance
    winRate: number; // Percentage of winning trades (0-1)
    profitFactor: number; // Gross profit / gross loss
    winningTrades: number; // Number of winning closed trades
    losingTrades: number; // Number of losing closed trades
    openTradesCount: number; // Number of currently open trades
    totalNotionalValue: number; // Sum of (Qty * EntryPrice)
    currentEquity: number;
    currentBalance: number;
    totalMarginUsed: number;
    walletBalance: number;
    initialBalance: number;
}

export interface IDataStore {
    /**
     * Record a trade execution
     */
    saveTrade(trade: Trade): Promise<void>;

    /**
     * Get execution history
     */
    getTrades(symbol?: string, limit?: number, offset?: number): Promise<Trade[]>;

    /**
     * Save a snapshot of the portfolio (for equity curve performance tracking)
     */
    savePortfolioSnapshot(snapshot: PortfolioSnapshot): Promise<void>;

    /**
     * Save backtesting execution results
     */
    saveBacktestResult(result: any): Promise<void>;

    /**
     * Get backtest results
     */
    getBacktestResults(limit?: number): Promise<any[]>;

    /**
     * Get latest portfolio snapshot
     */
    getLatestPortfolioSnapshot(): Promise<PortfolioSnapshot | null>;

    /**
     * Get historical portfolio snapshots
     */
    getPortfolioSnapshots(limit: number, period?: string): Promise<PortfolioSnapshot[]>;

    /**
     * Get active trade for a symbol
     */
    getActiveTrade(symbol: string): Promise<Trade | null>;

    /**
     * Get all open trades
     */
    getOpenTrades(): Promise<Trade[]>;

    /**
     * Update a trade record
     */
    updateTrade(id: string, updates: Partial<Trade>): Promise<void>;

    /**
     * Get persisted risk state
     */
    getRiskState(): Promise<{ startOfDayBalance: number, lastResetDay: number } | null>;

    /**
     * Save risk state
     */
    saveRiskState(state: { startOfDayBalance: number, lastResetDay: number }): Promise<void>;

    /**
     * Update/Upsert chart cache for a specific period
     */
    updateChartCache(period: string, data: any[]): Promise<void>;

    /**
     * Get chart cache for a period
     */
    getChartCache(period: string): Promise<any[]>;

    /**
     * Vault persistence
     */
    saveVaultTransaction(transaction: any): Promise<void>;
    getVaultTransactions(email?: string): Promise<any[]>;
    getVaultState(): Promise<any | null>;
    saveVaultState(state: any): Promise<void>;

    /**
     * Commission management
     */
    saveCommissionTransaction(transaction: any): Promise<void>;
    getInviterRelationship(userId: string): Promise<{ inviterId: string; commissionRate: number; invitedEmail: string } | null>;
    getAllInviterRelationships(): Promise<Array<{ inviterId: string; invitedUserId: string; commissionRate: number; invitedEmail: string }>>;
    getTotalCommissionsEarned(userId: string): Promise<number>;
    getTotalCommissionsPaid(userId: string): Promise<number>;
    getInvitedUsersCount(inviterId: string): Promise<number>;
    getUserEmail(userId: string): Promise<string>;
    getTotalVaultAssets(): Promise<number>;

    // Payout Management
    getPendingCommissionPayments(): Promise<any[]>;
    getUserWallet(userId: string): Promise<string | null>;
    updateCommissionPaymentStatus(paymentId: string, status: 'PAID' | 'CANCELLED', txHash?: string): Promise<void>;
    calculateDailyCommissions(targetDate?: string): Promise<number>;
}
