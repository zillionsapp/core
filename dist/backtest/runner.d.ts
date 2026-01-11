export declare class BacktestRunner {
    private exchange;
    private db;
    private riskManager;
    private timeProvider;
    private activeTrade;
    constructor();
    run(strategyName: string, symbol: string, interval: string, verbose?: boolean): Promise<{
        strategyName: string;
        symbol: string;
        interval: string;
        tradesCount: number;
        winrate: number;
        profitFactor: number;
        initialBalance: number;
        finalBalance: number;
        pnlUSDT: number;
        pnlPercent: number;
        buyHoldPercent: number;
        timestamp: number;
    }>;
    private logPortfolioState;
}
