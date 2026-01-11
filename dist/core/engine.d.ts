import { IExchange } from '../interfaces/exchange.interface';
import { IStrategy, StrategyConfig } from '../interfaces/strategy.interface';
import { IDataStore } from '../interfaces/repository.interface';
import { ITimeProvider } from './time.provider';
export declare class BotEngine {
    private exchange;
    private strategy;
    private db;
    private vaultManager?;
    private riskManager;
    private tradeManager;
    private portfolioManager;
    private commissionManager;
    private isRunning;
    private activeTrade;
    private lastSnapshotTime;
    private isProcessingSignal;
    private timeProvider;
    constructor(strategy: string | IStrategy, timeProvider?: ITimeProvider, exchange?: IExchange, db?: IDataStore);
    start(symbol: string, interval: string, config?: StrategyConfig): Promise<void>;
    tick(symbol: string, interval: string, strategyConfig?: StrategyConfig): Promise<void>;
    stop(): Promise<void>;
    private logPortfolioState;
    private runLoop;
}
