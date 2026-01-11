import { IExchange } from '../../interfaces/exchange.interface';
import { IMarketDataProvider } from '../../interfaces/market_data.interface';
import { Candle, Order, OrderRequest, Ticker } from '../../core/types';
import { ITimeProvider } from '../../core/time.provider';
import { IVaultManager } from '../../interfaces/vault.interface';
export declare class PaperExchange implements IExchange {
    name: string;
    private balances;
    private orders;
    private positions;
    private dataProvider;
    private timeProvider;
    private vaultManager?;
    private db?;
    constructor(dataProvider: IMarketDataProvider, timeProvider?: ITimeProvider, vaultManager?: IVaultManager, db?: any);
    getVaultManager(): IVaultManager | undefined;
    start(): Promise<void>;
    getCandles(symbol: string, interval: string, limit?: number): Promise<Candle[]>;
    getTicker(symbol: string): Promise<Ticker>;
    getBalance(asset: string): Promise<number>;
    placeOrder(orderRequest: OrderRequest): Promise<Order>;
    cancelOrder(orderId: string, symbol: string): Promise<void>;
    getOrder(orderId: string, symbol: string): Promise<Order | null>;
}
