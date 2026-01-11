"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DriftExchange = void 0;
class DriftExchange {
    constructor() {
        this.name = 'DRIFT';
    }
    async start() {
        console.log('[Drift] Starting adapter...');
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
exports.DriftExchange = DriftExchange;
