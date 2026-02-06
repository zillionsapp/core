import { IExchange } from '../interfaces/exchange.interface';
import { IDataStore } from '../interfaces/repository.interface';
import { IStrategy } from '../interfaces/strategy.interface';
import { Trade, OrderRequest, Candle } from './types';
import { logger } from './logger';
import { StrategyManager } from './strategy.manager';
import { CommissionManager } from './commission.manager';
import { config } from '../config/env';

export class TradeManager {
    private commissionManager?: CommissionManager;

    constructor(
        private exchange: IExchange,
        private db: IDataStore
    ) { }

    /**
     * Set the CommissionManager for commission calculations on trade close
     */
    setCommissionManager(commissionManager: CommissionManager): void {
        this.commissionManager = commissionManager;
    }

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

            // --- Breakeven Logic (NEW) ---
            // Activates BEFORE Trailing Stop to secure the entry early
            const breakevenTriggerPercent = config.BREAKEVEN_TRIGGER_PERCENT;
            const leverage = trade.leverage || 1;

            if (!trade.breakevenActivated && breakevenTriggerPercent > 0) {
                const priceChangePercent = trade.side === 'BUY'
                    ? ((currentPrice - trade.price) / trade.price) * 100
                    : ((trade.price - currentPrice) / trade.price) * 100;
                const profitPercent = priceChangePercent * leverage;

                if (profitPercent >= breakevenTriggerPercent) {
                    // Move SL to Entry Price
                    let newStopLoss = trade.price;

                    // Optimization: Add a tiny buffer (0.1%) to cover fees
                    const feeBuffer = trade.price * 0.001;
                    if (trade.side === 'BUY') {
                        newStopLoss += feeBuffer;
                    } else {
                        newStopLoss -= feeBuffer;
                    }

                    // Only update if it improves the position
                    const isImprovement = trade.side === 'BUY'
                        ? newStopLoss > (trade.stopLossPrice || 0)
                        : newStopLoss < (trade.stopLossPrice || Infinity);

                    if (isImprovement) {
                        updatedTrade.stopLossPrice = newStopLoss;
                        updatedTrade.breakevenActivated = true;
                        logger.info(`[TradeManager] Breakeven triggered for ${trade.symbol} at ${profitPercent.toFixed(2)}% profit. SL moved to ${newStopLoss}`);
                    }
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
                // Check if current price triggers SL
                if ((trade.side === 'BUY' && currentPrice <= trade.stopLossPrice) ||
                    (trade.side === 'SELL' && currentPrice >= trade.stopLossPrice)) {
                    exitReason = 'STOP_LOSS';
                }
                // Check if Intra-Candle Low/High triggers SL (for Replay/Backtest accuracy)
                else if (latestCandle) {
                    if (trade.side === 'BUY' && latestCandle.low <= trade.stopLossPrice) {
                        exitReason = 'STOP_LOSS';
                    } else if (trade.side === 'SELL' && latestCandle.high >= trade.stopLossPrice) {
                        exitReason = 'STOP_LOSS';
                    }
                }
            }

            // Check take profit
            if (!exitReason && trade.takeProfitPrice) {
                // Check if current price triggers TP
                if ((trade.side === 'BUY' && currentPrice >= trade.takeProfitPrice) ||
                    (trade.side === 'SELL' && currentPrice <= trade.takeProfitPrice)) {
                    exitReason = 'TAKE_PROFIT';
                }
                // Check if Intra-Candle High/Low triggers TP
                else if (latestCandle) {
                    if (trade.side === 'BUY' && latestCandle.high >= trade.takeProfitPrice) {
                        exitReason = 'TAKE_PROFIT';
                    } else if (trade.side === 'SELL' && latestCandle.low <= trade.takeProfitPrice) {
                        exitReason = 'TAKE_PROFIT';
                    }
                }
            }

            // Update trade in database if any fields changed
            if (Object.keys(updatedTrade).length > 0) {
                await this.db.updateTrade(trade.id, updatedTrade);
                logger.info(`[TradeManager] Trade updated for ${trade.symbol}: ${JSON.stringify(updatedTrade)}`);
            }

            if (exitReason) {
                logger.info(`[TradeManager] ${exitReason} triggered for ${trade.symbol} at ${currentPrice} (Entry: ${trade.price})`);
                await this.closePosition(trade, exitReason);
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
        const leverage = trade.leverage || 1;

        // Calculate current profit percentage (leveraged)
        const priceChangePercent = trade.side === 'BUY'
            ? ((currentPrice - trade.price) / trade.price) * 100
            : ((trade.price - currentPrice) / trade.price) * 100;
        const profitPercent = priceChangePercent * leverage;

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
                    // Move stop loss up: trail distance below the new high (adjusted for leverage)
                    newStopLoss = newHigh * (1 - (trailPercent / leverage) / 100);
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
                    // Move stop loss down: trail distance above the new low (adjusted for leverage)
                    newStopLoss = newLow * (1 + (trailPercent / leverage) / 100);
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
        logger.info(`[TradeManager] Force closing position ${trade.id} due to ${reason}`);
        await this.closePosition(trade, reason);
    }

    /**
     * Close a position and handle commission distribution
     */
    private async closePosition(trade: Trade, reason: string): Promise<void> {
        // Place closing order
        const orderRequest: OrderRequest = {
            symbol: trade.symbol,
            side: trade.side === 'BUY' ? 'SELL' : 'BUY',
            type: 'MARKET',
            quantity: trade.quantity
        };

        const order = await this.exchange.placeOrder(orderRequest);

        // Update trade in database
        const closedTrade: Trade = {
            ...trade,
            status: 'CLOSED',
            exitPrice: order.price,
            exitTimestamp: order.timestamp,
            duration: order.timestamp - trade.timestamp,
            exitReason: reason
        };
        await this.db.updateTrade(trade.id, closedTrade);

        // Process vault-wide commission payments if profitable
        const tradePnL = this.calculateTradePnL(closedTrade);
        logger.info(`[TradeManager] Trade closed: ${closedTrade.id}, P&L: ${tradePnL}, exitReason: ${closedTrade.exitReason}`);
        if (tradePnL > 0 && this.commissionManager) {
            logger.info(`[TradeManager] Processing commission for profitable trade ${closedTrade.id} with P&L ${tradePnL}`);
            await this.commissionManager.processVaultCommissionPayment(closedTrade);
        } else {
            logger.info(`[TradeManager] Skipping commission for trade ${closedTrade.id} - P&L: ${tradePnL}, hasCommissionManager: ${!!this.commissionManager}`);
        }

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

        logger.info(`[TradeManager] Position closed: ${trade.id} | Exit Price: ${order.price} | Reason: ${reason}`);
    }

    /**
     * Calculate P&L for a closed trade
     */
    private calculateTradePnL(trade: Trade): number {
        if (trade.status !== 'CLOSED' || !trade.exitPrice) {
            return 0;
        }

        if (trade.side === 'BUY') {
            return (trade.exitPrice - trade.price) * trade.quantity;
        } else {
            return (trade.price - trade.exitPrice) * trade.quantity;
        }
    }

    /**
     * Process commission payment for a closed trade
     * Called when a trade closes with profit
     * @deprecated Use processVaultCommissionPayment in CommissionManager instead
     */
    private async processCommissionPayment(trade: Trade): Promise<void> {
        if (!this.commissionManager) {
            logger.debug('[TradeManager] No CommissionManager set, skipping commission');
            return;
        }

        try {
            // Get userId from the trade - this would typically be stored on the trade
            // For now, we'll need to pass it through or derive it from the context
            // The userId should be associated with the trade in a real implementation
            const userId = (trade as any).userId || 'default-user';
            const email = (trade as any).userEmail || '';

            if (!userId || userId === 'default-user') {
                logger.debug('[TradeManager] No userId on trade, skipping commission');
                return;
            }

            const commission = await this.commissionManager.processCommissionPayment(trade, userId, email);
            if (commission > 0) {
                logger.info(`[TradeManager] Commission processed: ${commission.toFixed(4)} for trade ${trade.id}`);
            }
        } catch (error) {
            logger.error(`[TradeManager] Error processing commission for trade ${trade.id}:`, error);
        }
    }
}
