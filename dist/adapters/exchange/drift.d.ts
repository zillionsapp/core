import { IExchange } from '../../interfaces/exchange.interface';
import { Candle, Order, OrderRequest, Ticker } from '../../core/types';
export declare class DriftExchange implements IExchange {
    name: string;
    start(): Promise<void>;
    getCandles(symbol: string, interval: string, limit?: number): Promise<Candle[]>;
    getTicker(symbol: string): Promise<Ticker>;
    getBalance(asset: string): Promise<number>;
    placeOrder(order: OrderRequest): Promise<Order>;
    cancelOrder(orderId: string, symbol: string): Promise<void>;
    getOrder(orderId: string, symbol: string): Promise<Order | null>;
}
