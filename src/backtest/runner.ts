import { StrategyManager } from '../core/strategy.manager';
import { PaperExchange } from '../adapters/exchange/paper';
import { BinancePublicData } from '../adapters/data/binance_public';
import { Candle, OrderRequest, Trade } from '../core/types';
import { SupabaseDataStore } from '../adapters/database/supabase';
import { RiskManager } from '../core/risk.manager';
import { config } from '../config/env';
import { SimulationTimeProvider } from './simulation.time.provider';

export class BacktestRunner {
    private exchange: PaperExchange;
    private db: SupabaseDataStore;
    private riskManager: RiskManager;
    private timeProvider: SimulationTimeProvider;
    private activeTrade: Trade | null = null;

    constructor() {
        // Shared Data Provider
        const publicData = new BinancePublicData();
        this.db = new SupabaseDataStore();
        this.exchange = new PaperExchange(publicData, undefined, undefined, this.db);
        this.timeProvider = new SimulationTimeProvider();
        this.riskManager = new RiskManager(this.exchange, this.db, this.timeProvider);
    }
    async run(strategyName: string, symbol: string, interval: string, verbose: boolean = process.env.NODE_ENV !== 'test') {
        // Reset State for clean run
        this.activeTrade = null;
        if ((this.exchange as any).reset) {
            await (this.exchange as any).reset();
        }

        // 0. Start exchange (initializes vault balance if enabled)
        await this.exchange.start();

        // 1. Capture Initial Balance
        const asset = config.PAPER_BALANCE_ASSET;
        const initialBalance = await this.exchange.getBalance(asset);

        console.log(`[Backtest] Running ${strategyName} on ${symbol} ${interval}...`);

        // 2. Get History
        const candles = await this.exchange.getCandles(symbol, interval, config.BACKTEST_CANDLE_COUNT);
        const strategy = StrategyManager.getStrategy(strategyName);
        strategy.init({});

        let tradesCount = 0;
        let winningTrades = 0;
        let totalGrossProfit = 0;
        let totalGrossLoss = 0;

        // 3. Iterate
        // Warm up strategy history
        for (let i = 0; i < 50; i++) {
            await strategy.update(candles[i]);
        }

        for (let i = 50; i < candles.length; i++) {
            const currentCandle = candles[i];

            // Sync Exchange Price with Backtest Candle
            this.exchange.setManualPrice(currentCandle.close);

            // Update Simulation Time to Candle Close Time
            this.timeProvider.setTime(currentCandle.closeTime || 0);

            if (verbose) await this.logPortfolioState(symbol, currentCandle.close);

            // --- Risk Check (SL/TP) ---
            if (this.activeTrade) {
                let exitReason = '';

                if (this.activeTrade.side === 'BUY') {
                    // LONG Position: Check Low for SL, High for TP
                    if (this.activeTrade.stopLossPrice && currentCandle.low <= this.activeTrade.stopLossPrice) {
                        exitReason = 'STOP_LOSS';
                    } else if (this.activeTrade.takeProfitPrice && currentCandle.high >= this.activeTrade.takeProfitPrice) {
                        exitReason = 'TAKE_PROFIT';
                    }
                } else {
                    // SHORT Position: Check High for SL, Low for TP
                    if (this.activeTrade.stopLossPrice && currentCandle.high >= this.activeTrade.stopLossPrice) {
                        exitReason = 'STOP_LOSS';
                    } else if (this.activeTrade.takeProfitPrice && currentCandle.low <= this.activeTrade.takeProfitPrice) {
                        exitReason = 'TAKE_PROFIT';
                    }
                }

                if (exitReason) {
                    // Execute Close Order
                    try {
                        const entryValue = this.activeTrade.price * this.activeTrade.quantity;
                        const order = await this.exchange.placeOrder({
                            symbol,
                            side: this.activeTrade.side === 'BUY' ? 'SELL' : 'BUY',
                            type: 'MARKET',
                            quantity: this.activeTrade.quantity
                        });
                        const exitValue = order.price * order.quantity;

                        // Calculate PnL
                        let tradePnL = 0;
                        if (this.activeTrade.side === 'BUY') {
                            tradePnL = exitValue - entryValue;
                        } else {
                            // Short PnL: (Entry Price - Exit Price) * Quantity
                            // Equivalent to: Entry Value - Exit Value
                            tradePnL = entryValue - exitValue;
                        }

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

            // --- Strategy Update (only for opening positions) ---
            if (!this.activeTrade) {
                const signal = await strategy.update(currentCandle);

                if (signal && signal.action !== 'HOLD') {
                    try {
                        // Calculate proper position size based on risk management
                        const quantity = await this.riskManager.calculateQuantity(symbol, currentCandle.close, signal.stopLoss);

                        const order = await this.exchange.placeOrder({
                            symbol,
                            side: signal.action,
                            type: 'MARKET',
                            quantity: quantity // Use calculated quantity instead of fixed 0.1
                        });
                        tradesCount++;

                        // Calculate SL/TP using the actual position size
                        const exitPrices = this.riskManager.calculateExitPrices(order.price, order.quantity, order.side, signal.stopLoss, signal.takeProfit);

                        const leverage = config.LEVERAGE_ENABLED ? config.LEVERAGE_VALUE : 1;
                        const margin = (order.price * order.quantity) / leverage;

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
                            takeProfitPrice: exitPrices.takeProfit,
                            leverage,
                            margin
                        };
                        if (verbose) console.log(`[Backtest] ${signal.action} Entry. SL: ${this.activeTrade.stopLossPrice}, TP: ${this.activeTrade.takeProfitPrice}`);

                    } catch (e) {
                        // Ignore funds error in simple loop
                    }
                }
            }
        }

        // 4. Report
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

            // For equity calculation (backtest): balance (available) + margin + unrealized PnL
            const leverage = config.LEVERAGE_ENABLED ? config.LEVERAGE_VALUE : 1;
            const margin = entryValue / leverage;
            equity = balance + margin + pnl;
        }

        console.log(`[Portfolio] ${symbol} | Balance: ${balance.toFixed(2)} ${asset} | Equity: ${equity.toFixed(2)} ${asset} | Unrealized PnL: ${pnl.toFixed(2)} ${asset} (${pnlPercent.toFixed(2)}%)`);
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
