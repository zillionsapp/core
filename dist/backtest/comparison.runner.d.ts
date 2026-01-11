interface BacktestResult {
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
}
export declare class ComparisonBacktestRunner {
    private runner;
    constructor();
    runAll(symbol?: string, interval?: string, verbose?: boolean): Promise<BacktestResult[]>;
    private generateReport;
}
export {};
