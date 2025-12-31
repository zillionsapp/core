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
    openTrades: Array<{
        id: string;
        symbol: string;
        side: string;
        quantity: number;
        entryPrice: number;
        currentPrice: number;
        unrealizedPnL: number;
    }>;
    closedTrades: Array<{
        id: string;
        symbol: string;
        side: string;
        quantity: number;
        entryPrice: number;
        exitPrice: number;
        pnl: number;
        duration: number; // Duration in milliseconds
        entryTime: number; // Entry timestamp
        exitTime: number; // Exit timestamp
    }>;
    currentEquity: number;
    currentBalance: number;
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
}
