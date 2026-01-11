import { OrderRequest } from './types';
import { IExchange } from '../interfaces/exchange.interface';
import { IDataStore } from '../interfaces/repository.interface';
import { ITimeProvider } from './time.provider';
export declare class RiskManager {
    private exchange;
    private store;
    private timeProvider;
    private initialBalance;
    private startOfDayBalance;
    private lastResetDay;
    private isInitialized;
    constructor(exchange: IExchange, store: IDataStore, timeProvider?: ITimeProvider);
    init(currentEquity?: number): Promise<void>;
    validateOrder(order: OrderRequest, currentEquity?: number): Promise<boolean>;
    calculateQuantity(symbol: string, price: number, slPercent?: number, currentEquity?: number): Promise<number>;
    calculateExitPrices(entryPrice: number, quantity: number, side: 'BUY' | 'SELL', signalSL?: number, signalTP?: number): {
        stopLoss: number;
        takeProfit: number;
    };
}
