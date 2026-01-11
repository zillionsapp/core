"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HyperliquidExchange = void 0;
class HyperliquidExchange {
    constructor() {
        this.name = 'HYPERLIQUID';
    }
    async start() {
        console.log('[Hyperliquid] Starting adapter...');
        // Implementation needed
    }
    async getCandles(symbol, interval, limit) {
        throw new Error('Method not implemented.');
    }
    async getTicker(symbol) {
        throw new Error('Method not implemented.');
    }
    async getBalance(asset) {
        throw new Error('Method not implemented.');
    }
    async placeOrder(order) {
        throw new Error('Method not implemented.');
    }
    async cancelOrder(orderId, symbol) {
        throw new Error('Method not implemented.');
    }
    async getOrder(orderId, symbol) {
        throw new Error('Method not implemented.');
    }
}
exports.HyperliquidExchange = HyperliquidExchange;
