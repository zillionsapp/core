import { StrategyManager } from '../core/strategy.manager';
import { PaperExchange } from '../adapters/exchange/paper';
import { BinancePublicData } from '../adapters/data/binance_public';
import { Candle, OrderRequest, Trade } from '../core/types';
import { SupabaseDataStore } from '../adapters/database/supabase';
import { RiskManager } from '../core/risk.manager';

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
    async run(strategyName: string, symbol: string, interval: string) {
        // 0. Capture Initial Balance
        const initialBalance = await this.exchange.getBalance('USDT');

        console.log(`[Backtest] Running ${strategyName} on ${symbol} ${interval}...`);

        // 1. Get History (Mocking 1000 candles)
        const candles = await this.exchange.getCandles(symbol, interval, 1000);
        const strategy = StrategyManager.getStrategy(strategyName);
        strategy.init({});

        let tradesCount = 0;

        // 2. Iterate
        for (let i = 50; i < candles.length; i++) {
            const currentCandle = candles[i];

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
                        const order = await this.exchange.placeOrder({
                            symbol,
                            side: 'SELL',
                            type: 'MARKET',
                            quantity: this.activeTrade.quantity
                        });
                        console.log(`[Backtest] ${exitReason} triggered at ${currentCandle.close} (High: ${currentCandle.high}, Low: ${currentCandle.low})`);
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
                            ...order,
                            orderId: order.id,
                            stopLossPrice: exitPrices.stopLoss,
                            takeProfitPrice: exitPrices.takeProfit
                        };
                        console.log(`[Backtest] BUY Entry.SL: ${this.activeTrade.stopLossPrice}, TP: ${this.activeTrade.takeProfitPrice} `);

                    } catch (e) {
                        // Ignore funds error in simple loop
                    }
                } else if (signal.action === 'SELL' && this.activeTrade) {
                    // Strategy explicit close
                    try {
                        await this.exchange.placeOrder({
                            symbol,
                            side: 'SELL',
                            type: 'MARKET',
                            quantity: this.activeTrade.quantity
                        });
                        this.activeTrade = null;
                        console.log(`[Backtest] Strategy SELL Exit.`);
                    } catch (e) { }
                }
            }
        }

        // 3. Report
        const finalBalance = await this.exchange.getBalance('USDT');
        const pnlUSDT = finalBalance - initialBalance;
        const pnlPercent = (pnlUSDT / initialBalance) * 100;

        const startPrice = candles[50].close;
        const endPrice = candles[candles.length - 1].close;
        const buyHoldPercent = ((endPrice - startPrice) / startPrice) * 100;

        console.log('--- Backtest Complete ---');
        console.log(`Trades: ${tradesCount} `);
        console.log(`Initial USDT: ${initialBalance.toFixed(2)} `);
        console.log(`Final USDT: ${finalBalance.toFixed(2)} `);
        console.log(`Strategy PnL: ${pnlUSDT.toFixed(2)} USDT (${pnlPercent.toFixed(2)}%)`);
        console.log(`Buy & Hold PnL: ${buyHoldPercent.toFixed(2)}%`);
    }
}

// Simple CLI runner if executed directly
if (require.main === module) {
    const runner = new BacktestRunner();
    runner.run('SMA_CROSSOVER', 'BTC/USDT', '1h');
}
