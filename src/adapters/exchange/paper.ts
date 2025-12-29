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

        if (orderRequest.side === 'BUY') {
            const cost = orderRequest.quantity * price;
            const requiredMargin = cost / leverage;
            const balance = this.balances.get(quoteAsset) || 0;

            if (balance < requiredMargin) {
                throw new Error(`Insufficient funds (Margin). Required: ${requiredMargin.toFixed(2)}, Available: ${balance.toFixed(2)} (Cost: ${cost.toFixed(2)}, Leverage: ${leverage}x)`);
            }

            this.balances.set(quoteAsset, balance - requiredMargin);

            // Track position (simple one-position-per-symbol for now)
            const existing = this.positions.get(orderRequest.symbol);
            if (existing) {
                // Average entry for additive positions
                const totalQty = existing.quantity + orderRequest.quantity;
                const avgPrice = ((existing.entryPrice * existing.quantity) + (price * orderRequest.quantity)) / totalQty;
                this.positions.set(orderRequest.symbol, {
                    ...existing,
                    quantity: totalQty,
                    entryPrice: avgPrice,
                    margin: existing.margin + requiredMargin
                });
            } else {
                this.positions.set(orderRequest.symbol, {
                    symbol: orderRequest.symbol,
                    quantity: orderRequest.quantity,
                    entryPrice: price,
                    margin: requiredMargin,
                    leverage
                });
            }
        } else if (orderRequest.side === 'SELL') {
            const pos = this.positions.get(orderRequest.symbol);
            if (!pos) {
                // Shorting logic would go here, but for now we assume closing a long
                // To support backtesting properly, we'll just treat it as a normal sell if no position exists
                // (e.g. for strategies that sell first)
                const balance = this.balances.get(quoteAsset) || 0;
                this.balances.set(quoteAsset, balance + (orderRequest.quantity * price));
            } else {
                // Closing a long position
                const sellQty = Math.min(orderRequest.quantity, pos.quantity);
                const entryValue = pos.entryPrice * sellQty;
                const exitValue = price * sellQty;
                const pnl = exitValue - entryValue;

                // Return margin used for this portion + PnL
                const marginToReturn = (pos.margin / pos.quantity) * sellQty;
                const balance = this.balances.get(quoteAsset) || 0;
                this.balances.set(quoteAsset, balance + marginToReturn + pnl);

                if (sellQty >= pos.quantity) {
                    this.positions.delete(orderRequest.symbol);
                } else {
                    this.positions.set(orderRequest.symbol, {
                        ...pos,
                        quantity: pos.quantity - sellQty,
                        margin: pos.margin - marginToReturn
                    });
                }
            }
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
