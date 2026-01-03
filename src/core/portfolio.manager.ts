import { IExchange } from '../interfaces/exchange.interface';
import { IDataStore, PortfolioSnapshot } from '../interfaces/repository.interface';
import { Trade } from './types';
import { logger } from './logger';
import { ITimeProvider, RealTimeProvider } from './time.provider';

export class PortfolioManager {
    constructor(
        private exchange: IExchange,
        private db: IDataStore,
        private timeProvider: ITimeProvider = new RealTimeProvider()
    ) { }

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
    async generateSnapshot(): Promise<PortfolioSnapshot> {
        const timestamp = this.timeProvider.now();

        const [openTradesRaw, recentTrades] = await Promise.all([
            this.db.getOpenTrades(),
            this.db.getTrades()
        ]);

        // Merge to ensure we don't miss anything due to query differences
        const openTradesMap = new Map<string, Trade>();
        openTradesRaw.forEach(t => openTradesMap.set(t.id, t));
        recentTrades.filter(t => t.status === 'OPEN').forEach(t => openTradesMap.set(t.id, t));

        const openTrades = Array.from(openTradesMap.values());
        const closedTrades = recentTrades.filter(t => t.status === 'CLOSED');

        logger.info(`[PortfolioManager] Diagnostic: Fetch finished. OpenTrades=${openTrades.length}, RecentTotal=${recentTrades.length}, ClosedFiltered=${closedTrades.length}`);
        if (openTrades.length > 0) {
            logger.info(`[PortfolioManager] Open Trade IDs: ${openTrades.map(t => t.id).join(', ')}`);
        }

        // Config values
        const balanceAsset = process.env.PAPER_BALANCE_ASSET || 'USDT';
        const initialBalance = parseFloat(process.env.PAPER_INITIAL_BALANCE || '10000');

        // 1. Calculate realized PnL from closed trades
        const totalRealizedPnL = closedTrades.reduce((sum, t) => sum + this.calculateTradePnL(t), 0);

        // 2. Wallet Balance = Initial + Realized PnL
        const walletBalance = initialBalance + totalRealizedPnL;

        // 3. Calculate total margin used and asset holdings
        let totalMarginUsed = 0;
        const holdings: Record<string, number> = { [balanceAsset]: 0 }; // Initialize with base asset

        for (const trade of openTrades) {
            // Use stored margin if available and valid, otherwise recalculate
            let margin = trade.margin;
            if (!margin || margin <= 0) {
                const leverage = trade.leverage || parseFloat(process.env.LEVERAGE_VALUE || '1');
                const positionValue = trade.quantity * trade.price;
                margin = leverage > 1 ? positionValue / leverage : positionValue;
                logger.debug(`[PortfolioManager] Recalculated margin for ${trade.id} (${trade.symbol}): ${margin.toFixed(2)} (Leverage: ${leverage}x)`);
            }
            totalMarginUsed += margin;

            // Track asset holdings
            if (trade.side === 'BUY') {
                holdings[trade.symbol] = (holdings[trade.symbol] || 0) + trade.quantity;
            } else {
                holdings[trade.symbol] = (holdings[trade.symbol] || 0) - trade.quantity;
            }
        }

        // 4. Current (Available) Balance = Wallet Balance - Margin
        // For PAPER trading, we strictly prefer our deterministic DB calculation over the in-memory exchange balance,
        // because the exchange instance may lose state between separate processes (e.g. Bot vs API).
        let currentBalance: number;
        if (process.env.PAPER_TRADING === 'true' || process.env.PAPER_INITIAL_BALANCE) {
            currentBalance = walletBalance - totalMarginUsed;
        } else {
            try {
                const realBalance = await this.exchange.getBalance(balanceAsset);
                if (typeof realBalance === 'number' && !isNaN(realBalance)) {
                    currentBalance = realBalance;
                } else {
                    currentBalance = walletBalance - totalMarginUsed;
                }
            } catch (error) {
                currentBalance = walletBalance - totalMarginUsed;
            }
        }

        // CRITICAL: Available balance cannot be negative
        currentBalance = Math.max(0, currentBalance);
        holdings[balanceAsset] = currentBalance;

        // 5. Get current prices and calculate unrealized PnL
        const symbols = [...new Set(openTrades.map(t => t.symbol))];
        const priceMap = new Map<string, number>();

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

        // 6. Current Equity = Wallet Balance + Unrealized PnL
        const currentEquity = walletBalance + unrealizedPnLTotal;

        const snapshot: PortfolioSnapshot = {
            timestamp,
            totalValue: currentEquity,
            holdings,
            pnl: totalRealizedPnL,
            pnlPercentage: (totalRealizedPnL / initialBalance) * 100,
            winRate: this.calculateWinRate(closedTrades),
            profitFactor: this.calculateProfitFactor(closedTrades),
            winningTrades: closedTrades.filter(t => this.calculateTradePnL(t) > 0).length,
            losingTrades: closedTrades.filter(t => this.calculateTradePnL(t) < 0).length,
            openTradesCount: openTrades.length,
            currentEquity,
            currentBalance,
            totalMarginUsed,
            walletBalance,
            initialBalance
        };

        logger.info(`[PortfolioManager] Generated snapshot: RealizedPnL=${totalRealizedPnL.toFixed(2)}, UnrealizedPnL=${unrealizedPnLTotal.toFixed(2)}, Equity=${currentEquity.toFixed(2)}, Balance=${currentBalance.toFixed(2)}`);

        return snapshot;
    }

    /**
     * Save the current portfolio snapshot
     */
    async saveSnapshot(): Promise<void> {
        const snapshot = await this.generateSnapshot();
        await this.db.savePortfolioSnapshot(snapshot);
    }

    private calculateTotalPnL(trades: Trade[]): number {
        return trades.reduce((total, trade) => total + this.calculateTradePnL(trade), 0);
    }

    private calculateTradePnL(trade: Trade): number {
        if (!trade.exitPrice) return 0;

        const entryValue = trade.price * trade.quantity;
        const exitValue = trade.exitPrice * trade.quantity;

        if (trade.side === 'BUY') {
            return exitValue - entryValue;
        } else {
            return entryValue - exitValue;
        }
    }

    private calculateUnrealizedPnL(trade: Trade, currentPrice: number): number {
        const entryValue = trade.price * trade.quantity;
        const currentValue = currentPrice * trade.quantity;

        if (trade.side === 'BUY') {
            return currentValue - entryValue;
        } else {
            return entryValue - currentValue;
        }
    }

    private calculateWinRate(trades: Trade[]): number {
        if (trades.length === 0) return 0;

        const winningTrades = trades.filter(trade => this.calculateTradePnL(trade) > 0);
        return winningTrades.length / trades.length;
    }

    private calculateProfitFactor(trades: Trade[]): number {
        let grossProfit = 0;
        let grossLoss = 0;

        for (const trade of trades) {
            const pnl = this.calculateTradePnL(trade);
            if (pnl > 0) {
                grossProfit += pnl;
            } else if (pnl < 0) {
                grossLoss += Math.abs(pnl);
            }
        }

        return grossLoss === 0 ? (grossProfit > 0 ? Infinity : 0) : grossProfit / grossLoss;
    }

}
