import { PaperExchange } from '../src/adapters/exchange/paper';
import { RiskManager } from '../src/core/risk.manager';
import { IMarketDataProvider } from '../src/interfaces/market_data.interface';
import { config } from '../src/config/env';

// Test data from actual bot run
const actualTrades = [
    {
        id: "99bww3yfn4",
        symbol: "BTC/USDT",
        side: "BUY",
        quantity: 0.001,
        price: 87969.3,
        stopLossPrice: 83570.83499999999,
        takeProfitPrice: 96766.23000000001
    },
    {
        id: "btgeh7r6ypu",
        symbol: "BTC/USDT",
        side: "BUY",
        quantity: 0.01226817563525302,
        price: 87871.32,
        stopLossPrice: 83477.754,
        takeProfitPrice: 96658.45200000002
    },
    {
        id: "bvhvplgsvhh",
        symbol: "BTC/USDT",
        side: "SELL",
        quantity: 0.001,
        price: 87955.71,
        stopLossPrice: 92353.4955,
        takeProfitPrice: 79160.13900000001,
        exitPrice: 88038.04
    },
    {
        id: "bwc5mpy9cc",
        symbol: "BTC/USDT",
        side: "SELL",
        quantity: 0.011983443445639891,
        price: 88160.01,
        stopLossPrice: 92568.0105,
        takeProfitPrice: 79344.00899999999,
        exitPrice: 88088
    }
];

describe('Trading Math Validation Against Real Data', () => {
    let exchange: PaperExchange;
    let riskManager: RiskManager;
    let mockDataProvider: jest.Mocked<IMarketDataProvider>;

    beforeEach(async () => {
        mockDataProvider = {
            getCandles: jest.fn(),
            getTicker: jest.fn(),
            start: jest.fn(),
        } as any;

        // Reset to match production config
        (config as any).PAPER_INITIAL_BALANCE = 10000;
        (config as any).LEVERAGE_ENABLED = true;
        (config as any).LEVERAGE_VALUE = 5;
        (config as any).RISK_PER_TRADE_PERCENT = 1; // 1% risk per trade
        (config as any).DEFAULT_STOP_LOSS_PERCENT = 5;
        (config as any).DEFAULT_TAKE_PROFIT_PERCENT = 10;

        exchange = new PaperExchange(mockDataProvider);
        riskManager = new RiskManager(exchange);
        await riskManager.init();
    });

    describe('Stop Loss and Take Profit Calculations', () => {
        test.each(actualTrades.filter(t => t.side === 'BUY'))(
            'BUY trade $id should have correct SL/TP calculations',
            (trade) => {
                const { stopLoss, takeProfit } = riskManager.calculateExitPrices(
                    trade.price,
                    trade.quantity,
                    'BUY'
                );

                expect(stopLoss).toBeCloseTo(trade.stopLossPrice, 2);
                expect(takeProfit).toBeCloseTo(trade.takeProfitPrice, 2);
            }
        );

        test.each(actualTrades.filter(t => t.side === 'SELL'))(
            'SELL trade $id should have correct SL/TP calculations',
            (trade) => {
                const { stopLoss, takeProfit } = riskManager.calculateExitPrices(
                    trade.price,
                    trade.quantity,
                    'SELL'
                );

                expect(stopLoss).toBeCloseTo(trade.stopLossPrice, 2);
                expect(takeProfit).toBeCloseTo(trade.takeProfitPrice, 2);
            }
        );
    });

    describe('Quantity Calculations', () => {
        test('should calculate quantities correctly with different balances', async () => {
            // Test with different balances to see how quantity scales
            // Current Logic: Position Size = Balance * POSITION_SIZE_PERCENT (Default 10%)
            // quantity = (balance * 0.10) / price
            const testCases = [
                { balance: 10000, price: 88000, expectedQty: 0.011363 }, // (10000 * 0.10) / 88000 = 1000 / 88000
                { balance: 10989.87, price: 88000, expectedQty: 0.012488 }, // (10989.87 * 0.10) / 88000
                { balance: 12104.99, price: 88000, expectedQty: 0.013756 }, // (12104.99 * 0.10) / 88000
            ];

            for (const testCase of testCases) {
                // Temporarily set balance
                exchange['balances'].set('USDT', testCase.balance);

                const calculatedQuantity = await riskManager.calculateQuantity(
                    'BTC/USDT',
                    testCase.price
                );

                expect(calculatedQuantity).toBeCloseTo(testCase.expectedQty, 3);
            }
        });
    });

    describe('PnL Calculations for Closed Trades', () => {
        test.each(actualTrades.filter(t => t.exitPrice))(
            'closed trade $id should have correct PnL calculation',
            async (trade) => {
                // Set up the position
                mockDataProvider.getTicker.mockResolvedValue({
                    symbol: trade.symbol,
                    price: trade.price,
                    timestamp: Date.now()
                });

                // Open position
                await exchange.placeOrder({
                    symbol: trade.symbol,
                    side: trade.side as 'BUY' | 'SELL',
                    type: 'MARKET',
                    quantity: trade.quantity
                });

                // Get balance after opening
                const balanceAfterOpen = await exchange.getBalance('USDT');

                // Close position at exit price
                mockDataProvider.getTicker.mockResolvedValue({
                    symbol: trade.symbol,
                    price: trade.exitPrice!,
                    timestamp: Date.now()
                });

                await exchange.placeOrder({
                    symbol: trade.symbol,
                    side: trade.side === 'BUY' ? 'SELL' : 'BUY',
                    type: 'MARKET',
                    quantity: trade.quantity
                });

                const balanceAfterClose = await exchange.getBalance('USDT');

                // Calculate expected PnL (the profit/loss from price movement)
                const entryValue = trade.price * trade.quantity;
                const exitValue = trade.exitPrice! * trade.quantity;
                const expectedPnL = trade.side === 'BUY'
                    ? exitValue - entryValue
                    : entryValue - exitValue;

                // With leverage, the PnL is on the full position value
                // The balance change includes margin return + PnL
                // So we need to account for the margin that was returned
                const marginUsed = (trade.price * trade.quantity) / config.LEVERAGE_VALUE;
                const expectedBalanceChange = marginUsed + expectedPnL;

                const actualBalanceChange = balanceAfterClose - balanceAfterOpen;

                expect(actualBalanceChange).toBeCloseTo(expectedBalanceChange, 2);
            }
        );
    });

    describe('Leverage Math Edge Cases', () => {
        test('should handle very small quantities correctly', async () => {
            const price = 88000;
            const quantity = 0.0001; // Very small position

            mockDataProvider.getTicker.mockResolvedValue({
                symbol: 'BTC/USDT',
                price: price,
                timestamp: Date.now()
            });

            await exchange.placeOrder({
                symbol: 'BTC/USDT',
                side: 'BUY',
                type: 'MARKET',
                quantity: quantity
            });

            const balance = await exchange.getBalance('USDT');
            const expectedMargin = (quantity * price) / config.LEVERAGE_VALUE;

            // Balance should be initial - margin
            expect(10000 - balance).toBeCloseTo(expectedMargin, 2);
        });

        test('should handle large price movements with leverage', async () => {
            const entryPrice = 50000;
            const exitPrice = 60000; // 20% increase
            const quantity = 0.1;

            // Buy
            mockDataProvider.getTicker.mockResolvedValue({
                symbol: 'BTC/USDT',
                price: entryPrice,
                timestamp: Date.now()
            });

            await exchange.placeOrder({
                symbol: 'BTC/USDT',
                side: 'BUY',
                type: 'MARKET',
                quantity: quantity
            });

            const balanceAfterBuy = await exchange.getBalance('USDT');

            // Sell at higher price
            mockDataProvider.getTicker.mockResolvedValue({
                symbol: 'BTC/USDT',
                price: exitPrice,
                timestamp: Date.now()
            });

            await exchange.placeOrder({
                symbol: 'BTC/USDT',
                side: 'SELL',
                type: 'MARKET',
                quantity: quantity
            });

            const balanceAfterSell = await exchange.getBalance('USDT');

            // With leverage: margin is returned + full position PnL
            // Position value: 0.1 * 50000 = 5000
            // Margin: 5000 / 5 = 1000
            // Price increase: 20% = 10000 on position
            // Total return: margin (1000) + PnL (1000) = 2000
            const positionValue = quantity * entryPrice;
            const marginUsed = positionValue / config.LEVERAGE_VALUE;
            const priceChange = exitPrice - entryPrice;
            const pnlOnPosition = priceChange * quantity;
            const expectedBalanceChange = marginUsed + pnlOnPosition;

            const actualBalanceChange = balanceAfterSell - balanceAfterBuy;

            expect(actualBalanceChange).toBeCloseTo(expectedBalanceChange, 2);
        });
    });

    describe('Risk Management Validation', () => {
        test('should reject orders that exceed drawdown limits', async () => {
            // Mock the exchange to return a balance that exceeds drawdown limit
            // Initial balance = 10000, MAX_DAILY_DRAWDOWN_PERCENT = 5%
            // Drawdown limit = 500, so balance needs to be <= 9500 to trigger rejection
            jest.spyOn(exchange, 'getBalance').mockResolvedValue(9000); // 10% drawdown

            const isValid = await riskManager.validateOrder({
                symbol: 'BTC/USDT',
                side: 'BUY',
                type: 'MARKET',
                quantity: 0.1
            });

            // Should be rejected due to drawdown
            expect(isValid).toBe(false);
        });
    });
});
