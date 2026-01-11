"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PortfolioManager = void 0;
const logger_1 = require("./logger");
const time_provider_1 = require("./time.provider");
const env_1 = require("../config/env");
class PortfolioManager {
    constructor(exchange, db, timeProvider = new time_provider_1.RealTimeProvider(), vaultManager) {
        this.exchange = exchange;
        this.db = db;
        this.timeProvider = timeProvider;
        this.vaultManager = vaultManager;
    }
    /**
     * Implementation of EquityProvider for VaultManager
     */
    async getCurrentEquity() {
        const snapshot = await this.generateSnapshot();
        return snapshot.currentEquity;
    }
    /**
     * Generate a comprehensive portfolio snapshot with all metrics.
     *
     * This method performs the following steps:
     * 1. Capture the current timestamp.
     * 2. Retrieve **all** open trades and the full trade history (no artificial limits).
     * 3. Separate closed trades from open trades.
     * 4. Compute realized PnL from closed trades.
     * 5. Derive the wallet balance as `initialBalance + realizedPnL`.
     * 6. Calculate margin used for each open trade, respecting the configured `LEVERAGE_VALUE`.
     * 7. Determine holdings for each asset, including the base balance asset.
     * 8. Attempt to fetch the real available balance from the exchange. If the exchange call fails or returns an invalid value, fall back to `walletBalance - totalMarginUsed`.
     * 9. Ensure the available balance is never negative.
     * 10. Fetch current market prices for all symbols present in open trades.
     * 11. Compute unrealized PnL for each open trade.
     * 12. Assemble the `PortfolioSnapshot` object with all calculated metrics.
     */
    async generateSnapshot() {
        const timestamp = this.timeProvider.now();
        const [openTradesRaw, recentTrades] = await Promise.all([
            this.db.getOpenTrades(),
            this.db.getTrades()
        ]);
        // Merge to ensure we don't miss anything due to query differences, 
        // but prioritize CLOSED status if a trade appears in both.
        const allTradesMap = new Map();
        // 1. Process recent trades first
        recentTrades.forEach(t => allTradesMap.set(t.id, t));
        // 2. Add open trades only if they don't exist or are still OPEN
        openTradesRaw.forEach(t => {
            const existing = allTradesMap.get(t.id);
            if (!existing || existing.status === 'OPEN') {
                allTradesMap.set(t.id, t);
            }
        });
        const allTrades = Array.from(allTradesMap.values());
        const openTrades = allTrades.filter(t => t.status === 'OPEN');
        const closedTrades = allTrades.filter(t => t.status === 'CLOSED');
        logger_1.logger.info(`[PortfolioManager] Diagnostic: Fetch finished. OpenTrades=${openTrades.length}, RecentTotal=${recentTrades.length}, ClosedFiltered=${closedTrades.length}`);
        if (openTrades.length > 0) {
            logger_1.logger.info(`[PortfolioManager] Open Trade IDs: ${openTrades.map(t => t.id).join(', ')}`);
        }
        // Config values
        const balanceAsset = env_1.config.PAPER_BALANCE_ASSET || 'USDT';
        let initialBalance = env_1.config.PAPER_INITIAL_BALANCE;
        // Support test overrides and Vault
        if (process.env.NODE_ENV === 'test' && process.env.PAPER_INITIAL_BALANCE) {
            initialBalance = parseFloat(process.env.PAPER_INITIAL_BALANCE);
        }
        if (env_1.config.VAULT_ENABLED && this.vaultManager) {
            initialBalance = await this.vaultManager.getTotalDepositedBalance();
        }
        // 1. Calculate realized PnL from closed trades
        const totalRealizedPnL = closedTrades.reduce((sum, t) => sum + this.calculateTradePnL(t), 0);
        // 2. Wallet Balance = Initial + Realized PnL
        const walletBalance = initialBalance + totalRealizedPnL;
        // 3. Calculate total margin used, notional value, and asset holdings
        let totalMarginUsed = 0;
        let totalNotionalValue = 0;
        const holdings = { [balanceAsset]: 0 }; // Initialize with base asset
        for (const trade of openTrades) {
            const positionValue = trade.quantity * trade.price;
            totalNotionalValue += positionValue;
            // Use stored margin if available and valid, otherwise recalculate
            let margin = trade.margin;
            if (!margin || margin <= 0) {
                const leverage = trade.leverage || parseFloat(process.env.LEVERAGE_VALUE || '1');
                margin = leverage > 1 ? positionValue / leverage : positionValue;
                logger_1.logger.debug(`[PortfolioManager] Recalculated margin for ${trade.id} (${trade.symbol}): ${margin.toFixed(2)} (Leverage: ${leverage}x)`);
            }
            totalMarginUsed += margin;
            // Track asset holdings
            if (trade.side === 'BUY') {
                holdings[trade.symbol] = (holdings[trade.symbol] || 0) + trade.quantity;
            }
            else {
                holdings[trade.symbol] = (holdings[trade.symbol] || 0) - trade.quantity;
            }
        }
        // 4. Current Balance = Settled Cash - Margin Used (Available for new trades)
        let currentBalance = walletBalance - totalMarginUsed;
        // CRITICAL: Available balance cannot be negative
        currentBalance = Math.max(0, currentBalance);
        holdings[balanceAsset] = currentBalance;
        // 5. Get current prices and calculate unrealized PnL
        const symbols = [...new Set(openTrades.map(t => t.symbol))];
        const priceMap = new Map();
        if (symbols.length > 0) {
            const tickers = await Promise.all(symbols.map(symbol => this.exchange.getTicker(symbol)));
            symbols.forEach((symbol, index) => {
                priceMap.set(symbol, tickers[index].price);
            });
        }
        const unrealizedPnLTotal = openTrades.reduce((sum, trade) => {
            const currentPrice = priceMap.get(trade.symbol) || trade.price;
            return sum + this.calculateUnrealizedPnL(trade, currentPrice);
        }, 0);
        // 6. Current Equity = Wallet Balance + Unrealized PnL (User requirement)
        const currentEquity = walletBalance + unrealizedPnLTotal;
        const snapshot = {
            timestamp,
            totalValue: currentEquity,
            holdings,
            pnl: totalRealizedPnL,
            pnlPercentage: initialBalance > 0 ? (totalRealizedPnL / initialBalance) * 100 : 0,
            winRate: this.calculateWinRate(closedTrades),
            profitFactor: this.calculateProfitFactor(closedTrades),
            winningTrades: closedTrades.filter(t => this.calculateTradePnL(t) > 0).length,
            losingTrades: closedTrades.filter(t => this.calculateTradePnL(t) < 0).length,
            openTradesCount: openTrades.length,
            totalNotionalValue,
            currentEquity,
            currentBalance,
            totalMarginUsed,
            walletBalance,
            initialBalance
        };
        logger_1.logger.info(`[PortfolioManager] Generated snapshot: RealizedPnL=${totalRealizedPnL.toFixed(2)}, UnrealizedPnL=${unrealizedPnLTotal.toFixed(2)}, Equity=${currentEquity.toFixed(2)}, Balance=${currentBalance.toFixed(2)}`);
        return snapshot;
    }
    /**
     * Save the current portfolio snapshot
     */
    async saveSnapshot() {
        const snapshot = await this.generateSnapshot();
        await this.db.savePortfolioSnapshot(snapshot);
        // Update chart cache incrementally (perspective of now)
        this.refreshChartCache({
            timestamp: snapshot.timestamp,
            equity: snapshot.currentEquity
        }).catch(err => logger_1.logger.error(`[PortfolioManager] Failed to update chart cache: ${err.message}`));
    }
    async refreshChartCache(newPoint) {
        const periods = ['1d', '1w', '1m', '1y', 'all'];
        const now = newPoint.timestamp;
        for (const period of periods) {
            let cacheData = await this.db.getChartCache(period);
            // Bootstrap: If cache is empty, fetch limited history once
            if (cacheData.length === 0) {
                logger_1.logger.info(`[PortfolioManager] Bootstrapping chart cache for ${period}...`);
                const limit = 1000;
                const snapshots = await this.db.getPortfolioSnapshots(limit, period);
                cacheData = snapshots.map(s => ({ timestamp: s.timestamp, equity: s.currentEquity }));
                // Sort to be safe, although DataStore typically returns DESC which we then reverse
                cacheData.sort((a, b) => a.timestamp - b.timestamp);
            }
            // Incremental Update: Add new point
            cacheData.push(newPoint);
            // Filter by period cutoff
            if (period !== 'all') {
                let cutoff = now;
                switch (period) {
                    case '1d':
                        cutoff = now - (24 * 60 * 60 * 1000);
                        break;
                    case '1w':
                        cutoff = now - (7 * 24 * 60 * 60 * 1000);
                        break;
                    case '1m':
                        cutoff = now - (30 * 24 * 60 * 60 * 1000);
                        break;
                    case '1y':
                        cutoff = now - (365 * 24 * 60 * 60 * 1000);
                        break;
                }
                cacheData = cacheData.filter(p => p.timestamp >= cutoff);
            }
            // Deduplicate (in case of double triggers within same ms)
            cacheData = cacheData.filter((p, index) => cacheData.findIndex(p2 => p2.timestamp === p.timestamp) === index);
            // Maintain max size / Consolidate
            const MAX_POINTS = 500;
            const TARGET_POINTS = 200;
            if (cacheData.length > MAX_POINTS) {
                cacheData = this.downsample(cacheData, TARGET_POINTS);
            }
            await this.db.updateChartCache(period, cacheData);
        }
        logger_1.logger.debug(`[PortfolioManager] Incrementally updated chart cache for all periods`);
    }
    downsample(data, targetCount) {
        if (data.length <= targetCount)
            return data;
        const blockSize = data.length / targetCount;
        const consolidated = [];
        for (let i = 0; i < targetCount; i++) {
            const startIdx = Math.floor(i * blockSize);
            const endIdx = Math.floor((i + 1) * blockSize);
            const slice = data.slice(startIdx, endIdx);
            if (slice.length === 0)
                continue;
            const last = slice[slice.length - 1];
            const avgEquity = slice.reduce((sum, item) => sum + item.equity, 0) / slice.length;
            consolidated.push({
                timestamp: last.timestamp,
                equity: avgEquity
            });
        }
        return consolidated;
    }
    calculateTotalPnL(trades) {
        return trades.reduce((total, trade) => total + this.calculateTradePnL(trade), 0);
    }
    calculateTradePnL(trade) {
        if (!trade.exitPrice)
            return 0;
        const quantity = Number(trade.quantity);
        const entryPrice = Number(trade.price);
        const exitPrice = Number(trade.exitPrice);
        const entryValue = entryPrice * quantity;
        const exitValue = exitPrice * quantity;
        if (trade.side === 'BUY') {
            return exitValue - entryValue;
        }
        else {
            return entryValue - exitValue;
        }
    }
    calculateUnrealizedPnL(trade, currentPrice) {
        const quantity = Number(trade.quantity);
        const entryPrice = Number(trade.price);
        const currentPriceNum = Number(currentPrice);
        const entryValue = entryPrice * quantity;
        const currentValue = currentPriceNum * quantity;
        if (trade.side === 'BUY') {
            return currentValue - entryValue;
        }
        else {
            return entryValue - currentValue;
        }
    }
    calculateWinRate(trades) {
        if (trades.length === 0)
            return 0;
        const winningTrades = trades.filter(trade => this.calculateTradePnL(trade) > 0);
        return winningTrades.length / trades.length;
    }
    calculateProfitFactor(trades) {
        let grossProfit = 0;
        let grossLoss = 0;
        for (const trade of trades) {
            const pnl = this.calculateTradePnL(trade);
            if (pnl > 0) {
                grossProfit += pnl;
            }
            else if (pnl < 0) {
                grossLoss += Math.abs(pnl);
            }
        }
        return grossLoss === 0 ? (grossProfit > 0 ? Infinity : 0) : grossProfit / grossLoss;
    }
}
exports.PortfolioManager = PortfolioManager;
