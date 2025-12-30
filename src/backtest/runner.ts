import { StrategyManager } from '../core/strategy.manager';
import { PaperExchange } from '../adapters/exchange/paper';
import { BinancePublicData } from '../adapters/data/binance_public';
import { Candle, OrderRequest, Trade } from '../core/types';
import { SupabaseDataStore } from '../adapters/database/supabase';
import { RiskManager } from '../core/risk.manager';
import { config } from '../config/env';

export class BacktestRunner {
    private exchange: PaperExchange;
    private db: SupabaseDataStore;
    private riskManager: RiskManager;
    private activeTrade: Trade | null = null;

    constructor() {
        // Shared Data Provider
        const publicData = new BinancePublicData();
        this.exchange = new PaperExchange(publicData);
        this.db = new SupabaseDataStore();
        this.riskManager = new RiskManager(this.exchange);
    }
    async run(strategyName: string, symbol: string, interval: string, verbose: boolean = process.env.NODE_ENV !== 'test') {
        // 0. Capture Initial Balance
        const asset = config.PAPER_BALANCE_ASSET;
        const initialBalance = await this.exchange.getBalance(asset);

        console.log(`[Backtest] Running ${strategyName} on ${symbol} ${interval}...`);

        // 1. Get History (Mocking 1000 candles)
        const candles = await this.exchange.getCandles(symbol, interval, 1000);
        const strategy = StrategyManager.getStrategy(strategyName);
        strategy.init({});

        let tradesCount = 0;
        let winningTrades = 0;
        let totalGrossProfit = 0;
        let totalGrossLoss = 0;

        // 2. Iterate
        for (let i = 50; i < candles.length; i++) {
            const currentCandle = candles[i];
            if (verbose) await this.logPortfolioState(symbol, currentCandle.close);

            // --- Risk Check (SL/TP) ---
            if (this.activeTrade) {
                let exitReason = '';
                // Check Low for SL, High for TP (Assuming Long)
                // TODO: Support Short logic when needed
                if (this.activeTrade.stopLossPrice && currentCandle.low <= this.activeTrade.stopLossPrice) {
                    exitReason = 'STOP_LOSS';
                } else if (this.activeTrade.takeProfitPrice && currentCandle.high >= this.activeTrade.takeProfitPrice) {
                    exitReason = 'TAKE_PROFIT';
                }

                if (exitReason) {
                    // Execute SELL
                    try {
                        const entryValue = this.activeTrade.price * this.activeTrade.quantity;
                        const order = await this.exchange.placeOrder({
                            symbol,
                            side: 'SELL',
                            type: 'MARKET',
                            quantity: this.activeTrade.quantity
                        });
                        const exitValue = order.price * order.quantity;
                        const tradePnL = exitValue - entryValue;

                        if (tradePnL > 0) {
                            winningTrades++;
                            totalGrossProfit += tradePnL;
                        } else {
                            totalGrossLoss += Math.abs(tradePnL);
                        }

                        if (verbose) console.log(`[Backtest] ${exitReason} triggered at ${currentCandle.close} (High: ${currentCandle.high}, Low: ${currentCandle.low}) | ID: ${this.activeTrade.id}`);
                        this.activeTrade = null;
                    } catch (e) { console.error(e); }
                }
            }

            // --- Strategy Update ---
            const signal = await strategy.update(currentCandle);

            if (signal && signal.action !== 'HOLD') {
                if (signal.action === 'BUY' && !this.activeTrade) {
                    try {
                        const order = await this.exchange.placeOrder({
                            symbol,
                            side: signal.action,
                            type: 'MARKET',
                            quantity: 0.1 // Fixed
                        });
                        tradesCount++;

                        // Calculate SL/TP
                        const exitPrices = this.riskManager.calculateExitPrices(order.price, order.side, signal.stopLoss, signal.takeProfit);

                        this.activeTrade = {
                            id: order.id,
                            orderId: order.id,
                            symbol: order.symbol,
                            side: order.side,
                            quantity: order.quantity,
                            price: order.price,
                            timestamp: order.timestamp,
                            status: 'OPEN',
                            stopLossPrice: exitPrices.stopLoss,
                            takeProfitPrice: exitPrices.takeProfit
                        };
                        if (verbose) console.log(`[Backtest] BUY Entry. SL: ${this.activeTrade.stopLossPrice}, TP: ${this.activeTrade.takeProfitPrice}`);

                    } catch (e) {
                        // Ignore funds error in simple loop
                    }
                } else if (signal.action === 'SELL' && this.activeTrade) {
                    // Strategy explicit close
                    try {
                        const entryValue = this.activeTrade.price * this.activeTrade.quantity;
                        const order = await this.exchange.placeOrder({
                            symbol,
                            side: 'SELL',
                            type: 'MARKET',
                            quantity: this.activeTrade.quantity
                        });
                        const exitValue = order.price * order.quantity;
                        const tradePnL = exitValue - entryValue;

                        if (tradePnL > 0) {
                            winningTrades++;
                            totalGrossProfit += tradePnL;
                        } else {
                            totalGrossLoss += Math.abs(tradePnL);
                        }

                        if (verbose) console.log(`[Backtest] Strategy SELL Exit. | ID: ${this.activeTrade.id}`);
                        this.activeTrade = null;
                    } catch (e) { }
                }
            }
        }

        // 3. Report
        const finalBalance = await this.exchange.getBalance(asset);
        const pnlUSDT = finalBalance - initialBalance;
        const pnlPercent = (pnlUSDT / initialBalance) * 100;

        const startPrice = candles[50].close;
        const endPrice = candles[candles.length - 1].close;
        const buyHoldPercent = ((endPrice - startPrice) / startPrice) * 100;

        const winrate = tradesCount > 0 ? (winningTrades / tradesCount) * 100 : 0;
        const profitFactor = totalGrossLoss > 0 ? totalGrossProfit / totalGrossLoss : totalGrossProfit > 0 ? Infinity : 0;

        const result = {
            strategyName,
            symbol,
            interval,
            tradesCount,
            winrate,
            profitFactor,
            initialBalance,
            finalBalance,
            pnlUSDT,
            pnlPercent,
            buyHoldPercent,
            timestamp: Date.now()
        };

        await this.db.saveBacktestResult(result);

        console.log('--- Backtest Complete ---');
        console.log(`Trades: ${tradesCount} `);
        console.log(`Winrate: ${winrate.toFixed(2)}% `);
        console.log(`Profit Factor: ${profitFactor === Infinity ? '∞' : profitFactor.toFixed(2)} `);
        console.log(`Initial USDT: ${initialBalance.toFixed(2)} `);
        console.log(`Final USDT: ${finalBalance.toFixed(2)} `);
        console.log(`Strategy PnL: ${pnlUSDT.toFixed(2)} USDT (${pnlPercent.toFixed(2)}%)`);
        console.log(`Buy & Hold PnL: ${buyHoldPercent.toFixed(2)}%`);

        return result;
    }

    private async logPortfolioState(symbol: string, currentPrice: number) {
        const asset = config.PAPER_BALANCE_ASSET;
        const balance = await this.exchange.getBalance(asset);
        let equity = balance;
        let pnl = 0;
        let pnlPercent = 0;

        if (this.activeTrade) {
            const entryValue = this.activeTrade.price * this.activeTrade.quantity;
            const currentValue = currentPrice * this.activeTrade.quantity;

            if (this.activeTrade.side === 'BUY') {
                pnl = currentValue - entryValue;
            } else {
                pnl = entryValue - currentValue;
            }

            pnlPercent = (pnl / entryValue) * 100;
            equity = balance + pnl;
        }

        console.log(`[Portfolio] ${symbol} | Balance: ${balance.toFixed(2)} ${asset} | Equity: ${equity.toFixed(2)} ${asset} | PnL: ${pnl.toFixed(2)} ${asset} (${pnlPercent.toFixed(2)}%)`);
    }
}

// Simple CLI runner if executed directly
if (require.main === module) {
    const args = process.argv.slice(2);
    const strategyName = args[0] || config.STRATEGY_NAME;
    const symbol = args[1] || config.STRATEGY_SYMBOL;
    const interval = args[2] || config.STRATEGY_INTERVAL;

    const runner = new BacktestRunner();
    runner.run(strategyName, symbol, interval).catch(console.error);
}
