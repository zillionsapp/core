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

            for (const trade of openTrades) {
                await this.checkPosition(trade);
            }
        } catch (error) {
            logger.error('[TradeManager] Error managing positions:', error);
        }
    }

    private async checkPosition(trade: Trade): Promise<void> {
        try {
            // Get current price
            const ticker = await this.exchange.getTicker(trade.symbol);
            const currentPrice = ticker.price;

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
