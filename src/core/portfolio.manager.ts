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
     * Generate a comprehensive portfolio snapshot with all metrics
     */
    async generateSnapshot(): Promise<PortfolioSnapshot> {
        const timestamp = this.timeProvider.now();

        // Get all trades
        // Get trades: Explicitly fetch ALL open trades to ensure they are never missed
        // and fetch more recent trades for PnL calculation (limit 2000)
        const [openTrades, recentTrades] = await Promise.all([
            this.db.getOpenTrades(),
            this.db.getTrades(undefined, 2000)
        ]);
        const closedTrades = recentTrades.filter(t => t.status === 'CLOSED');

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
            // Use stored margin if available, otherwise recalculate
            let margin = trade.margin;
            if (margin === undefined) {
                const leverage = parseFloat(process.env.LEVERAGE_VALUE || '1');
                const positionValue = trade.quantity * trade.price;
                margin = leverage > 1 ? positionValue / leverage : positionValue;
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
        // Try to get real balance from exchange if available (more accurate for live)
        let currentBalance: number;
        try {
            const realBalance = await this.exchange.getBalance(balanceAsset);
            // If exchange returns a valid numeric balance, use it as the source of truth for "Available"
            if (typeof realBalance === 'number' && !isNaN(realBalance)) {
                currentBalance = realBalance;
            } else {
                currentBalance = walletBalance - totalMarginUsed;
            }
        } catch (error) {
            // Fallback to calculation
            currentBalance = walletBalance - totalMarginUsed;
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

        const openTradesWithCurrent = openTrades.map(trade => {
            const currentPrice = priceMap.get(trade.symbol) || trade.price;
            const unrealizedPnL = this.calculateUnrealizedPnL(trade, currentPrice);
            return {
                id: trade.id,
                symbol: trade.symbol,
                side: trade.side,
                quantity: trade.quantity,
                entryPrice: trade.price,
                currentPrice,
                unrealizedPnL
            };
        });

        const unrealizedPnLTotal = openTradesWithCurrent.reduce((sum, t) => sum + t.unrealizedPnL, 0);

        // 6. Current Equity = Wallet Balance + Unrealized PnL
        // This correctly represents the total value including margin and profit/loss
        const currentEquity = walletBalance + unrealizedPnLTotal;

        // Build closed trades with PnL for the snapshot
        const closedTradesWithPnL = closedTrades.map(trade => {
            const pnl = this.calculateTradePnL(trade);
            const duration = trade.exitTimestamp! - trade.timestamp;
            return {
                id: trade.id,
                symbol: trade.symbol,
                side: trade.side,
                quantity: trade.quantity,
                entryPrice: trade.price,
                exitPrice: trade.exitPrice!,
                pnl,
                duration,
                entryTime: trade.timestamp,
                exitTime: trade.exitTimestamp!
            };
        });

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
            openTrades: openTradesWithCurrent,
            closedTrades: closedTradesWithPnL,
            currentEquity,
            currentBalance
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
