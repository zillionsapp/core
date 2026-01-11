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
    price?: number;
}
export interface Order {
    id: string;
    symbol: string;
    side: Side;
    type: OrderType;
    status: OrderStatus;
    quantity: number;
    filledQuantity: number;
    price: number;
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
    exitReason?: string;
    strategyName?: string;
    leverage?: number;
    margin?: number;
    duration?: number;
    trailingStopEnabled?: boolean;
    trailingStopActivated?: boolean;
    trailingStopActivationPercent?: number;
    trailingStopTrailPercent?: number;
    trailingStopHighPrice?: number;
    trailingStopLowPrice?: number;
}
export interface Signal {
    action: 'BUY' | 'SELL' | 'HOLD';
    symbol: string;
    confidence?: number;
    metadata?: any;
    stopLoss?: number;
    takeProfit?: number;
    forceClose?: boolean;
}
