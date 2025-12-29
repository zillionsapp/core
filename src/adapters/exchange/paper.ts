import { IExchange } from '../../interfaces/exchange.interface';
import { IMarketDataProvider } from '../../interfaces/market_data.interface';
import { Candle, Order, OrderRequest, OrderStatus, Ticker } from '../../core/types';
import { config } from '../../config/env';

// Helper for ID generation
const generateId = () => Math.random().toString(36).substring(2, 15);

export class PaperExchange implements IExchange {
    name = 'PAPER';
    private balances: Map<string, number> = new Map();
    private orders: Map<string, Order> = new Map();
    private dataProvider: IMarketDataProvider;

    constructor(dataProvider: IMarketDataProvider) {
        this.dataProvider = dataProvider;
        this.balances.set(config.PAPER_BALANCE_ASSET, config.PAPER_INITIAL_BALANCE);
    }

    async start(): Promise<void> {
        console.log(`[PaperExchange] Started with balance: ${config.PAPER_INITIAL_BALANCE} ${config.PAPER_BALANCE_ASSET}`);
    }

    async getCandles(symbol: string, interval: string, limit: number = 100): Promise<Candle[]> {
        // Delegate to real data provider
        return this.dataProvider.getCandles(symbol, interval, limit);
    }

    async getTicker(symbol: string): Promise<Ticker> {
        return this.dataProvider.getTicker(symbol);
    }

    async getBalance(asset: string): Promise<number> {
        return this.balances.get(asset) || 0;
    }

    async placeOrder(orderRequest: OrderRequest): Promise<Order> {
        const currentPrice = (await this.getTicker(orderRequest.symbol)).price;
        const price = orderRequest.type === 'LIMIT' ? orderRequest.price! : currentPrice;

        // Calculate cost
        const cost = orderRequest.quantity * price;
        const quoteAsset = 'USDT';

        if (orderRequest.side === 'BUY') {
            const balance = this.balances.get(quoteAsset) || 0;
            if (balance < cost) {
                throw new Error(`Insufficient funds. Required: ${cost}, Available: ${balance}`);
            }
            this.balances.set(quoteAsset, balance - cost);
        } else if (orderRequest.side === 'SELL') {
            const balance = this.balances.get(quoteAsset) || 0;
            this.balances.set(quoteAsset, balance + cost);
        }

        const order: Order = {
            id: generateId(),
            symbol: orderRequest.symbol,
            side: orderRequest.side,
            type: orderRequest.type,
            status: 'FILLED',
            quantity: orderRequest.quantity,
            filledQuantity: orderRequest.quantity,
            price: price,
            timestamp: Date.now(),
        };

        this.orders.set(order.id, order);
        console.log(`[PaperExchange] Order Executed: ${order.side} ${order.quantity} ${order.symbol} @ ${order.price}`);
        return order;
    }

    async cancelOrder(orderId: string, symbol: string): Promise<void> {
        const order = this.orders.get(orderId);
        if (order) {
            order.status = 'CANCELED';
            console.log(`[PaperExchange] Order Canceled: ${orderId}`);
        }
    }

    async getOrder(orderId: string, symbol: string): Promise<Order | null> {
        return this.orders.get(orderId) || null;
    }
}
