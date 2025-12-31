import { IExchange } from '../interfaces/exchange.interface';
import { IDataStore, PortfolioSnapshot } from '../interfaces/repository.interface';
import { Trade } from './types';
import { logger } from './logger';

export class PortfolioManager {
    constructor(
        private exchange: IExchange,
        private db: IDataStore
    ) {}

    /**
     * Generate a comprehensive portfolio snapshot with all metrics
     */
    async generateSnapshot(): Promise<PortfolioSnapshot> {
        const timestamp = Date.now();

        // Get all trades
        const allTrades = await this.db.getTrades(undefined, 1000); // Get last 1000 trades
        const openTrades = allTrades.filter(t => t.status === 'OPEN');
        const closedTrades = allTrades.filter(t => t.status === 'CLOSED');

        // Get current balance first (needed for PnL percentage calculation)
        const balanceAsset = process.env.PAPER_BALANCE_ASSET || 'USDT';
        const currentBalance = await this.exchange.getBalance(balanceAsset);

        // Get current prices for open trades
        const symbols = [...new Set(openTrades.map(t => t.symbol))];
        const pricePromises = symbols.map(symbol => this.exchange.getTicker(symbol));
        const tickers = await Promise.all(pricePromises);
        const priceMap = new Map<string, number>();
        symbols.forEach((symbol, index) => {
            priceMap.set(symbol, tickers[index].price);
        });

        // Calculate metrics
        const pnl = this.calculateTotalPnL(closedTrades);
        const pnlPercentage = this.calculatePnLPercentage(pnl, currentBalance);
        const winRate = this.calculateWinRate(closedTrades);
        const profitFactor = this.calculateProfitFactor(closedTrades);
        const winningTrades = closedTrades.filter(trade => this.calculateTradePnL(trade) > 0).length;
        const losingTrades = closedTrades.filter(trade => this.calculateTradePnL(trade) < 0).length;

        // Build open trades with current data
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

        // Build closed trades with PnL
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

        // Calculate current equity (balance + unrealized PnL)
        const unrealizedPnLTotal = openTradesWithCurrent.reduce((sum, trade) => sum + trade.unrealizedPnL, 0);
        const currentEquity = currentBalance + unrealizedPnLTotal;

        // Holdings: for now, just the balance asset
        const holdings = { [balanceAsset]: currentBalance };

        // Total value is current equity
        const totalValue = currentEquity;

        const snapshot: PortfolioSnapshot = {
            timestamp,
            totalValue,
            holdings,
            pnl,
            pnlPercentage,
            winRate,
            profitFactor,
            winningTrades,
            losingTrades,
            openTrades: openTradesWithCurrent,
            closedTrades: closedTradesWithPnL,
            currentEquity,
            currentBalance
        };

        logger.info(`[PortfolioManager] Generated snapshot: PnL=${pnl.toFixed(2)}, WinRate=${(winRate * 100).toFixed(1)}%, Equity=${currentEquity.toFixed(2)}`);

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

    private calculatePnLPercentage(pnl: number, currentBalance: number): number {
        // Use initial balance as base (simplified - in real trading, you'd track initial capital)
        const initialBalance = 10000; // Default starting balance
        return (pnl / initialBalance) * 100;
    }
}
