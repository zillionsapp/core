import { IExchange } from '../interfaces/exchange.interface';
import { IDataStore } from '../interfaces/repository.interface';
import { IStrategy } from '../interfaces/strategy.interface';
import { Trade, OrderRequest, Candle } from './types';
import { logger } from './logger';
import { StrategyManager } from './strategy.manager';

export class TradeManager {
    constructor(
        private exchange: IExchange,
        private db: IDataStore
    ) {}

    /**
     * Check all open positions and manage them (check SL/TP, close if triggered)
     */
    async checkAndManagePositions(latestCandle?: Candle): Promise<void> {
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
                this.checkPosition(trade, priceMap.get(trade.symbol)!, latestCandle)
            );
            await Promise.all(checkPromises);

        } catch (error) {
            logger.error('[TradeManager] Error managing positions:', error);
        }
    }

    private async checkPosition(trade: Trade, currentPrice: number, latestCandle?: Candle): Promise<void> {
        try {
            let exitReason: string | null = null;
            let updatedTrade: Partial<Trade> = {};

            // First, check strategy-specific exit logic if available
            if (trade.strategyName && latestCandle) {
                try {
                    const strategy = StrategyManager.getStrategy(trade.strategyName);
                    if (strategy.checkExit) {
                        const exitDecision = await strategy.checkExit(trade, latestCandle);

                        if (exitDecision === 'CLOSE') {
                            exitReason = 'STRATEGY_EXIT';
                        } else if (typeof exitDecision === 'object') {
                            // Handle position updates
                            if (exitDecision.action === 'UPDATE_SL' && exitDecision.newPrice) {
                                updatedTrade.stopLossPrice = exitDecision.newPrice;
                                logger.info(`[TradeManager] Strategy updated SL for ${trade.symbol}: ${exitDecision.newPrice}`);
                            } else if (exitDecision.action === 'UPDATE_TP' && exitDecision.newPrice) {
                                updatedTrade.takeProfitPrice = exitDecision.newPrice;
                                logger.info(`[TradeManager] Strategy updated TP for ${trade.symbol}: ${exitDecision.newPrice}`);
                            } else if (exitDecision.action === 'PARTIAL_CLOSE' && exitDecision.quantity) {
                                // Handle partial close - this would require more complex order management
                                logger.warn(`[TradeManager] Partial close requested but not implemented yet`);
                            }
                        }
                        // If 'HOLD', continue with standard checks
                    }
                } catch (error) {
                    logger.error(`[TradeManager] Error in strategy checkExit for ${trade.id}:`, error);
                }
            }

            // Handle trailing stop loss
            if (trade.trailingStopEnabled) {
                const { shouldExit, newStopLoss, updatedFields } = this.calculateTrailingStop(trade, currentPrice);
                if (shouldExit) {
                    exitReason = 'TRAILING_STOP_LOSS';
                }
                if (newStopLoss !== trade.stopLossPrice) {
                    updatedTrade.stopLossPrice = newStopLoss;
                    Object.assign(updatedTrade, updatedFields);
                }
            }

            // Check static stop loss (if trailing not enabled or not activated)
            if (!exitReason && trade.stopLossPrice && (!trade.trailingStopEnabled || !trade.trailingStopActivated)) {
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

            // Update trade in database if any fields changed
            if (Object.keys(updatedTrade).length > 0) {
                await this.db.updateTrade(trade.id, updatedTrade);
                logger.info(`[TradeManager] Trade updated for ${trade.symbol}: ${JSON.stringify(updatedTrade)}`);
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

                // Notify strategy that position was closed
                if (trade.strategyName) {
                    try {
                        const strategy = StrategyManager.getStrategy(trade.strategyName);
                        if (strategy.onPositionClosed) {
                            await strategy.onPositionClosed(trade);
                        }
                    } catch (error) {
                        logger.error(`[TradeManager] Error in strategy onPositionClosed for ${trade.id}:`, error);
                    }
                }

                logger.info(`[TradeManager] Position closed: ${trade.id} | Exit Price: ${order.price} | Reason: ${exitReason}`);
            }
        } catch (error) {
            logger.error(`[TradeManager] Error checking position ${trade.id}:`, error);
        }
    }

    private calculateTrailingStop(trade: Trade, currentPrice: number): {
        shouldExit: boolean;
        newStopLoss: number;
        updatedFields: Partial<Trade>;
    } {
        const updatedFields: Partial<Trade> = {};
        let newStopLoss = trade.stopLossPrice || 0;
        let shouldExit = false;

        if (!trade.trailingStopEnabled) {
            return { shouldExit, newStopLoss, updatedFields };
        }

        const activationPercent = trade.trailingStopActivationPercent || 0;
        const trailPercent = trade.trailingStopTrailPercent || 0;

        // Calculate current profit percentage
        const profitPercent = trade.side === 'BUY'
            ? ((currentPrice - trade.price) / trade.price) * 100
            : ((trade.price - currentPrice) / trade.price) * 100;

        // Check if trailing should be activated
        if (!trade.trailingStopActivated && profitPercent >= activationPercent) {
            updatedFields.trailingStopActivated = true;
            logger.info(`[TradeManager] Trailing stop activated for ${trade.symbol} at ${profitPercent.toFixed(2)}% profit`);
        }

        if (trade.trailingStopActivated || (!trade.trailingStopActivated && profitPercent >= activationPercent)) {
            if (trade.side === 'BUY') {
                // For long positions: track highest price
                const currentHigh = trade.trailingStopHighPrice || trade.price;
                const newHigh = Math.max(currentHigh, currentPrice);

                if (newHigh > currentHigh || !trade.trailingStopActivated) {
                    updatedFields.trailingStopHighPrice = newHigh;
                    // Move stop loss up: trail distance below the new high
                    newStopLoss = newHigh * (1 - trailPercent / 100);
                }

                // Check if price dropped to trailing stop
                if (currentPrice <= newStopLoss) {
                    shouldExit = true;
                }
            } else {
                // For short positions: track lowest price
                const currentLow = trade.trailingStopLowPrice || trade.price;
                const newLow = Math.min(currentLow, currentPrice);

                if (newLow < currentLow || !trade.trailingStopActivated) {
                    updatedFields.trailingStopLowPrice = newLow;
                    // Move stop loss down: trail distance above the new low
                    newStopLoss = newLow * (1 + trailPercent / 100);
                }

                // Check if price rose to trailing stop
                if (currentPrice >= newStopLoss) {
                    shouldExit = true;
                }
            }
        }

        return { shouldExit, newStopLoss, updatedFields };
    }

    /**
     * Force close a position immediately
     */
    async forceClosePosition(trade: Trade, reason: string): Promise<void> {
        try {
            logger.info(`[TradeManager] Force closing position ${trade.id} due to ${reason}`);

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

            // Notify strategy that position was closed
            if (trade.strategyName) {
                try {
                    const strategy = StrategyManager.getStrategy(trade.strategyName);
                    if (strategy.onPositionClosed) {
                        await strategy.onPositionClosed(trade);
                    }
                } catch (error) {
                    logger.error(`[TradeManager] Error in strategy onPositionClosed for ${trade.id}:`, error);
                }
            }

            logger.info(`[TradeManager] Position force closed: ${trade.id} | Exit Price: ${order.price} | Reason: ${reason}`);
        } catch (error) {
            logger.error(`[TradeManager] Error force closing position ${trade.id}:`, error);
        }
    }
}
