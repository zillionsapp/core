"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CCXTExchange = void 0;
class CCXTExchange {
    constructor() {
        this.name = 'CCXT';
    }
    async start() {
        console.log('[CCXT] Starting adapter...');
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
exports.CCXTExchange = CCXTExchange;
