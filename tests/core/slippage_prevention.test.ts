import { TradeManager } from '../../src/core/trade.manager';
import { PaperExchange } from '../../src/adapters/exchange/paper';
import { MockStore } from '../test_mocks';
import { Trade, Candle, Order, OrderRequest } from '../../src/core/types';

describe('Slippage Prevention Logic', () => {
    let tradeManager: TradeManager;
    let exchange: PaperExchange;
    let mockStore: MockStore;

    beforeEach(() => {
        // Mock dependencies
        const mockProvider = {
            name: 'MOCK',
            getCandles: jest.fn().mockResolvedValue([]),
            getTicker: jest.fn().mockResolvedValue({ symbol: 'BTC/USDT', price: 90000, timestamp: Date.now() })
        };

        mockStore = new MockStore();
        exchange = new PaperExchange(mockProvider); // Real logic for placeOrder
        tradeManager = new TradeManager(exchange, mockStore);

        // Spy on exchange.placeOrder
        jest.spyOn(exchange, 'placeOrder').mockResolvedValue({
            id: 'ord_1',
            price: 89000, // Expected execution price
            status: 'FILLED',
            timestamp: Date.now()
        } as Order);
    });

    it('should trigger Stop Loss on Sell wick (High >= SL) even if Close < SL', async () => {
        // Setup a SHORT trade with SL at 91000
        const trade: Trade = {
            id: 'trade_short',
            symbol: 'BTC/USDT',
            side: 'SELL',
            quantity: 1,
            price: 90000,
            stopLossPrice: 91000,
            status: 'OPEN',
            timestamp: Date.now(),
            orderId: 'ord_open'
        };

        // Mock store returning this trade
        jest.spyOn(mockStore, 'getOpenTrades').mockResolvedValue([trade]);
        jest.spyOn(exchange, 'getTicker').mockResolvedValue({ symbol: 'BTC/USDT', price: 90500, timestamp: Date.now() });

        // Candle: Open 90000, High 91500 (Hits SL), Low 89000, Close 90500 (Safe)
        const candle: Candle = {
            symbol: 'BTC/USDT',
            interval: '1h',
            open: 90000,
            high: 91500, // > 91000 SL
            low: 89000,
            close: 90500, // Safe
            volume: 100,
            startTime: Date.now()
        };

        await tradeManager.checkAndManagePositions(candle);

        // Expect placeOrder to be called (closing the position)
        expect(exchange.placeOrder).toHaveBeenCalledWith(expect.objectContaining({
            side: 'BUY',
            quantity: 1
        }));
    });

    it('should trigger Stop Loss on Buy wick (Low <= SL) even if Close > SL', async () => {
        // Setup a LONG trade with SL at 89000
        const trade: Trade = {
            id: 'trade_long',
            symbol: 'BTC/USDT',
            side: 'BUY',
            quantity: 1,
            price: 90000,
            stopLossPrice: 89000,
            status: 'OPEN',
            timestamp: Date.now(),
            orderId: 'ord_open'
        };

        // Mock store returning this trade
        jest.spyOn(mockStore, 'getOpenTrades').mockResolvedValue([trade]);
        jest.spyOn(exchange, 'getTicker').mockResolvedValue({ symbol: 'BTC/USDT', price: 90500, timestamp: Date.now() });

        // Candle: Open 90000, High 91000, Low 88000 (Hits SL), Close 90500 (Safe)
        const candle: Candle = {
            symbol: 'BTC/USDT',
            interval: '1h',
            open: 90000,
            high: 91000,
            low: 88000, // < 89000 SL
            close: 90500, // Safe
            volume: 100,
            startTime: Date.now()
        };

        await tradeManager.checkAndManagePositions(candle);

        // Expect placeOrder to be called
        expect(exchange.placeOrder).toHaveBeenCalled();
    });
});
