import { Order, Trade } from '../core/types';

export interface PortfolioSnapshot {
    timestamp: number;
    totalValue: number; // In quote currency (e.g. USDT)
    holdings: Record<string, number>; // asset -> quantity
}

export interface IDataStore {
    /**
     * Record a trade execution
     */
    saveTrade(trade: Trade): Promise<void>;

    /**
     * Get execution history
     */
    getTrades(symbol?: string, limit?: number): Promise<Trade[]>;

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
     * Update a trade record
     */
    updateTrade(id: string, updates: Partial<Trade>): Promise<void>;
}
