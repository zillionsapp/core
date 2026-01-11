"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaperExchange = void 0;
const env_1 = require("../../config/env");
const time_provider_1 = require("../../core/time.provider");
// Helper for ID generation
const generateId = () => Math.random().toString(36).substring(2, 15);
class PaperExchange {
    constructor(dataProvider, timeProvider = new time_provider_1.RealTimeProvider(), vaultManager, db) {
        this.name = 'PAPER';
        this.balances = new Map();
        this.orders = new Map();
        this.positions = new Map();
        this.dataProvider = dataProvider;
        this.timeProvider = timeProvider;
        this.vaultManager = vaultManager;
        this.db = db;
        // Internal Vault Initialization
        if (!this.vaultManager && env_1.config.VAULT_ENABLED && this.db) {
            const { VaultManager } = require('../../core/vault.manager');
            this.vaultManager = new VaultManager(this.db, this.timeProvider);
            console.log(`[PaperExchange] Internal VaultManager initialized.`);
        }
        const initialBalance = env_1.config.VAULT_ENABLED && this.vaultManager
            ? 0 // Will be loaded in start()
            : env_1.config.PAPER_INITIAL_BALANCE;
        this.balances.set(env_1.config.PAPER_BALANCE_ASSET, initialBalance);
    }
    getVaultManager() {
        return this.vaultManager;
    }
    async start() {
        if (env_1.config.VAULT_ENABLED && this.vaultManager) {
            const vaultBalance = await this.vaultManager.getTotalDepositedBalance();
            this.balances.set(env_1.config.PAPER_BALANCE_ASSET, vaultBalance);
            console.log(`[PaperExchange] Started with Vault balance: ${vaultBalance.toFixed(2)} ${env_1.config.PAPER_BALANCE_ASSET}`);
        }
        else {
            // console.log(`[PaperExchange] Started with balance: ${config.PAPER_INITIAL_BALANCE} ${config.PAPER_BALANCE_ASSET}`);
        }
    }
    async getCandles(symbol, interval, limit = 100) {
        return this.dataProvider.getCandles(symbol, interval, limit, this.timeProvider.now());
    }
    async getTicker(symbol) {
        return this.dataProvider.getTicker(symbol);
    }
    async getBalance(asset) {
        return this.balances.get(asset) || 0;
    }
    async placeOrder(orderRequest) {
        const currentPrice = (await this.getTicker(orderRequest.symbol)).price;
        const price = orderRequest.type === 'LIMIT' ? orderRequest.price : currentPrice;
        // LIMIT ORDER CHECK
        if (orderRequest.type === 'LIMIT') {
            if (orderRequest.side === 'BUY' && price < currentPrice) {
                // Buy Limit below market = Pending. Simplified adapter does not support pending.
                // Rejection is safer than instant fill at wrong price.
                throw new Error(`[PaperExchange] Pending Limit Orders not supported. Buy Limit ${price} < Current ${currentPrice}`);
            }
            if (orderRequest.side === 'SELL' && price > currentPrice) {
                // Sell Limit above market = Pending.
                throw new Error(`[PaperExchange] Pending Limit Orders not supported. Sell Limit ${price} > Current ${currentPrice}`);
            }
            // If Limit is marketable (Buy >= Market, Sell <= Market), we fill it at MARKET price (best execution)
            // or at Limit price? Real exchange fills at Best Available.
            // Simplified: Fill at requested Limit Price if better/equal, but effectively it should be Current Price for PnL.
            // Let's stick to filling at Current Price for fairness, or Limit if it's worse (slippage).
            // Safest: Fill at Current Price if marketable.
        }
        const quoteAsset = 'USDT';
        const leverage = env_1.config.LEVERAGE_ENABLED ? env_1.config.LEVERAGE_VALUE : 1;
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
                pnl = exitValue - entryValue; // P&L is just the price difference
            }
            else {
                // Closing a short position
                const entryValue = existingPos.entryPrice * closeQty;
                const exitValue = price * closeQty;
                pnl = entryValue - exitValue; // P&L is just the price difference
            }
            // Liquidation check: Losses cannot exceed margin
            const marginUsed = (existingPos.margin / existingPos.quantity) * closeQty;
            if (pnl < -marginUsed) {
                pnl = -marginUsed; // Liquidate at margin amount
                console.log(`[PaperExchange] Liquidation: Loss capped at margin amount ${marginUsed.toFixed(2)} ${quoteAsset}`);
            }
            // Return margin used for this portion + P&L (capped at -margin)
            const marginToReturn = marginUsed + pnl; // pnl is negative or zero after liquidation check
            const balance = this.balances.get(quoteAsset) || 0;
            this.balances.set(quoteAsset, balance + marginToReturn);
            if (closeQty >= existingPos.quantity) {
                this.positions.delete(orderRequest.symbol);
            }
            else {
                this.positions.set(orderRequest.symbol, {
                    ...existingPos,
                    quantity: existingPos.quantity - closeQty,
                    margin: existingPos.margin - marginUsed
                });
            }
        }
        else {
            // This is an opening order
            const cost = orderRequest.quantity * price;
            const requiredMargin = cost / leverage;
            const balance = this.balances.get(quoteAsset) || 0;
            // BULLETPROOF MARGIN CHECKS
            if (requiredMargin <= 0) {
                throw new Error(`Invalid margin calculation: ${requiredMargin}`);
            }
            if (orderRequest.side === 'BUY') {
                // Long position: pay margin
                if (requiredMargin > balance) {
                    throw new Error(`Insufficient funds (Margin). Required: ${requiredMargin.toFixed(2)}, Available: ${balance.toFixed(2)} (Cost: ${cost.toFixed(2)}, Leverage: ${leverage}x)`);
                }
                this.balances.set(quoteAsset, balance - requiredMargin);
            }
            else {
                // Short position: ONLY deduct margin. DO NOT credit proceeds.
                // Proceeds are realized only on close.
                // The previous code `balance + netChange` where netChange = proceeds - margin was the Infinite Money Glitch.
                if (requiredMargin > balance) {
                    throw new Error(`Insufficient funds for short position. Required margin: ${requiredMargin.toFixed(2)}, Available: ${balance.toFixed(2)}`);
                }
                this.balances.set(quoteAsset, balance - requiredMargin);
            }
            // Prevent using more than 95% of balance for margin (emergency buffer)
            // For shorts, check the margin against the new balance or something, but simplified
            if (requiredMargin > balance * 0.95) {
                throw new Error(`Margin too high: ${requiredMargin.toFixed(2)} > 95% of balance (${(balance * 0.95).toFixed(2)}). Reduce position size.`);
            }
            this.positions.set(orderRequest.symbol, {
                symbol: orderRequest.symbol,
                quantity: orderRequest.quantity,
                entryPrice: price,
                margin: requiredMargin,
                leverage,
                side: orderRequest.side
            });
        }
        const order = {
            id: generateId(),
            symbol: orderRequest.symbol,
            side: orderRequest.side,
            type: orderRequest.type,
            status: 'FILLED',
            quantity: orderRequest.quantity,
            filledQuantity: orderRequest.quantity,
            price: price,
            timestamp: ('setTime' in this.timeProvider) ? this.timeProvider.now() : Date.now(),
        };
        this.orders.set(order.id, order);
        console.log(`[PaperExchange] Order Executed: ${order.side} ${order.quantity} ${order.symbol} @ ${order.price} (Leverage: ${leverage}x)`);
        return order;
    }
    async cancelOrder(orderId, symbol) {
        const order = this.orders.get(orderId);
        if (order) {
            order.status = 'CANCELED';
            console.log(`[PaperExchange] Order Canceled: ${orderId}`);
        }
    }
    async getOrder(orderId, symbol) {
        return this.orders.get(orderId) || null;
    }
}
exports.PaperExchange = PaperExchange;
