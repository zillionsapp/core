import { IExchange } from '../interfaces/exchange.interface';
import { IDataStore } from '../interfaces/repository.interface';
import { Trade, OrderRequest } from './types';
import { logger } from './logger';

export class TradeManager {
    constructor(
        private exchange: IExchange,
        private db: IDataStore
    ) {}

    /**
     * Check all open positions and manage them (check SL/TP, close if triggered)
     */
    async checkAndManagePositions(): Promise<void> {
        try {
            const openTrades = await this.db.getOpenTrades();

            if (openTrades.length === 0) {
                return;
            }

            logger.info(`[TradeManager] Checking ${openTrades.length} open positions`);

            // Group trades by symbol to minimize API calls
            const tradesBySymbol = new Map<string, Trade[]>();
            for (const trade of openTrades) {
                if (!tradesBySymbol.has(trade.symbol)) {
                    tradesBySymbol.set(trade.symbol, []);
                }
                tradesBySymbol.get(trade.symbol)!.push(trade);
            }

            // Get unique symbols
            const symbols = Array.from(tradesBySymbol.keys());

            // Fetch tickers in parallel for all symbols
            const tickerPromises = symbols.map(symbol => this.exchange.getTicker(symbol));
            const tickers = await Promise.all(tickerPromises);

            // Create price map
            const priceMap = new Map<string, number>();
            symbols.forEach((symbol, index) => {
                priceMap.set(symbol, tickers[index].price);
            });

            // Check all positions using cached prices
            const checkPromises = openTrades.map(trade =>
                this.checkPosition(trade, priceMap.get(trade.symbol)!)
            );
            await Promise.all(checkPromises);

        } catch (error) {
            logger.error('[TradeManager] Error managing positions:', error);
        }
    }

    private async checkPosition(trade: Trade, currentPrice: number): Promise<void> {
        try {
            let exitReason: string | null = null;

            // Check stop loss
            if (trade.stopLossPrice) {
                if ((trade.side === 'BUY' && currentPrice <= trade.stopLossPrice) ||
                    (trade.side === 'SELL' && currentPrice >= trade.stopLossPrice)) {
                    exitReason = 'STOP_LOSS';
                }
            }

            // Check take profit
            if (!exitReason && trade.takeProfitPrice) {
                if ((trade.side === 'BUY' && currentPrice >= trade.takeProfitPrice) ||
                    (trade.side === 'SELL' && currentPrice <= trade.takeProfitPrice)) {
                    exitReason = 'TAKE_PROFIT';
                }
            }

            if (exitReason) {
                logger.info(`[TradeManager] ${exitReason} triggered for ${trade.symbol} at ${currentPrice} (Entry: ${trade.price})`);

                // Place closing order
                const orderRequest: OrderRequest = {
                    symbol: trade.symbol,
                    side: trade.side === 'BUY' ? 'SELL' : 'BUY',
                    type: 'MARKET',
                    quantity: trade.quantity
                };

                const order = await this.exchange.placeOrder(orderRequest);

                // Update trade in database
                await this.db.updateTrade(trade.id, {
                    status: 'CLOSED',
                    exitPrice: order.price,
                    exitTimestamp: order.timestamp
                });

                logger.info(`[TradeManager] Position closed: ${trade.id} | Exit Price: ${order.price} | Reason: ${exitReason}`);
            }
        } catch (error) {
            logger.error(`[TradeManager] Error checking position ${trade.id}:`, error);
        }
    }
}
