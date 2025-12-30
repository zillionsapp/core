import { IExchange } from '../../interfaces/exchange.interface';
import { IMarketDataProvider } from '../../interfaces/market_data.interface';
import { Candle, Order, OrderRequest, Ticker } from '../../core/types';
import { config } from '../../config/env';

// Helper for ID generation
const generateId = () => Math.random().toString(36).substring(2, 15);

interface Position {
    symbol: string;
    quantity: number;
    entryPrice: number;
    margin: number;
    leverage: number;
    side: 'BUY' | 'SELL'; // Track if this is a long or short position
}

export class PaperExchange implements IExchange {
    name = 'PAPER';
    private balances: Map<string, number> = new Map();
    private orders: Map<string, Order> = new Map();
    private positions: Map<string, Position> = new Map();
    private dataProvider: IMarketDataProvider;

    constructor(dataProvider: IMarketDataProvider) {
        this.dataProvider = dataProvider;
        this.balances.set(config.PAPER_BALANCE_ASSET, config.PAPER_INITIAL_BALANCE);
    }

    async start(): Promise<void> {
        console.log(`[PaperExchange] Started with balance: ${config.PAPER_INITIAL_BALANCE} ${config.PAPER_BALANCE_ASSET}`);
    }

    async getCandles(symbol: string, interval: string, limit: number = 100): Promise<Candle[]> {
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
        const quoteAsset = 'USDT';
        const leverage = config.LEVERAGE_ENABLED ? config.LEVERAGE_VALUE : 1;

        // Check if this order closes an existing position
        const existingPos = this.positions.get(orderRequest.symbol);
        if (existingPos) {
            // This is a closing order
            const closeQty = Math.min(orderRequest.quantity, existingPos.quantity);
            let pnl = 0;

            if (existingPos.side === 'BUY') {
                // Closing a long position
                const entryValue = existingPos.entryPrice * closeQty;
                const exitValue = price * closeQty;
                pnl = exitValue - entryValue;
            } else {
                // Closing a short position
                const entryValue = existingPos.entryPrice * closeQty;
                const exitValue = price * closeQty;
                pnl = entryValue - exitValue;
            }

            // Return margin used for this portion + PnL
            const marginToReturn = (existingPos.margin / existingPos.quantity) * closeQty;
            const balance = this.balances.get(quoteAsset) || 0;
            this.balances.set(quoteAsset, balance + marginToReturn + pnl);

            if (closeQty >= existingPos.quantity) {
                this.positions.delete(orderRequest.symbol);
            } else {
                this.positions.set(orderRequest.symbol, {
                    ...existingPos,
                    quantity: existingPos.quantity - closeQty,
                    margin: existingPos.margin - marginToReturn
                });
            }
        } else {
            // This is an opening order
            const cost = orderRequest.quantity * price;
            const requiredMargin = cost / leverage;
            const balance = this.balances.get(quoteAsset) || 0;

            if (balance < requiredMargin) {
                throw new Error(`Insufficient funds (Margin). Required: ${requiredMargin.toFixed(2)}, Available: ${balance.toFixed(2)} (Cost: ${cost.toFixed(2)}, Leverage: ${leverage}x)`);
            }

            this.balances.set(quoteAsset, balance - requiredMargin);

            this.positions.set(orderRequest.symbol, {
                symbol: orderRequest.symbol,
                quantity: orderRequest.quantity,
                entryPrice: price,
                margin: requiredMargin,
                leverage,
                side: orderRequest.side
            });
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
        console.log(`[PaperExchange] Order Executed: ${order.side} ${order.quantity} ${order.symbol} @ ${order.price} (Leverage: ${leverage}x)`);
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
