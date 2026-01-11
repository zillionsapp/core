import { Candle, Order, OrderRequest, Ticker } from '../core/types';
export interface IExchange {
    name: string;
    /**
     * Initialize the exchange connection
     */
    start(): Promise<void>;
    /**
     * Fetch historical candles
     */
    getCandles(symbol: string, interval: string, limit?: number): Promise<Candle[]>;
    /**
     * Get current price ticker
     */
    getTicker(symbol: string): Promise<Ticker>;
    /**
     * Get balance for a specific asset (e.g., 'USDT', 'BTC')
     */
    getBalance(asset: string): Promise<number>;
    /**
     * Place a new order
     */
    placeOrder(order: OrderRequest): Promise<Order>;
    /**
     * Cancel an order
     */
    cancelOrder(orderId: string, symbol: string): Promise<void>;
    /**
     * Get order details
     */
    getOrder(orderId: string, symbol: string): Promise<Order | null>;
    /**
     * Get the vault manager associated with this exchange, if any
     */
    getVaultManager?(): any;
}
