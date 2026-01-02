export type Side = 'BUY' | 'SELL';
export type OrderType = 'MARKET' | 'LIMIT';
export type OrderStatus = 'PENDING' | 'FILLED' | 'CANCELED' | 'REJECTED';

export interface Candle {
    symbol: string;
    interval: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    startTime: number;
    closeTime?: number;
}

export interface Ticker {
    symbol: string;
    price: number;
    timestamp: number;
}

export interface OrderRequest {
    symbol: string;
    side: Side;
    type: OrderType;
    quantity: number;
    price?: number; // Required for LIMIT
}

export interface Order {
    id: string;
    symbol: string;
    side: Side;
    type: OrderType;
    status: OrderStatus;
    quantity: number;
    filledQuantity: number;
    price: number; // Average fill price or limit price
    timestamp: number;
}

export interface Trade {
    id: string;
    orderId: string;
    symbol: string;
    side: Side;
    quantity: number;
    price: number;
    timestamp: number;
    status: 'OPEN' | 'CLOSED';
    commission?: number;
    commissionAsset?: string;
    stopLossPrice?: number;
    takeProfitPrice?: number;
    exitPrice?: number;
    exitTimestamp?: number;

    // Trailing Stop Loss fields
    trailingStopEnabled?: boolean;
    trailingStopActivated?: boolean;
    trailingStopActivationPercent?: number;
    trailingStopTrailPercent?: number;
    trailingStopHighPrice?: number; // For BUY positions: highest price seen
    trailingStopLowPrice?: number;  // For SELL positions: lowest price seen
}

export interface Signal {
    action: 'BUY' | 'SELL' | 'HOLD';
    symbol: string;
    confidence?: number; // 0-1
    metadata?: any; // Extra info from strategy
    stopLoss?: number; // Optional SL percentage (e.g., 5 for 5%)
    takeProfit?: number; // Optional TP percentage (e.g., 10 for 10%)
    forceClose?: boolean; // Force close existing positions before opening new one
}
