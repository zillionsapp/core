import { RiskManager } from '../src/core/risk.manager';
import { IDataStore } from '../src/interfaces/repository.interface';
import { IExchange } from '../src/interfaces/exchange.interface';
import { ITimeProvider } from '../src/core/time.provider';

// Mocks
class MockStore implements IDataStore {
    private storage: any = {};
    async saveRiskState(state: any) { this.storage['risk_state'] = state; }
    async getRiskState() { return this.storage['risk_state'] || null; }

    // Stubs
    async saveTrade() { }
    async getTrades() { return []; }
    async savePortfolioSnapshot() { }
    async saveBacktestResult() { }
    async getBacktestResults() { return []; }
    async getLatestPortfolioSnapshot() { return null; }
    async getPortfolioSnapshots() { return []; }
    async getActiveTrade() { return null; }
    async getOpenTrades() { return []; }
    async updateTrade() { }
    async updateChartCache() { }
    async getChartCache() { return []; }
}

class MockExchange implements IExchange {
    name = 'MOCK';
    async getBalance() { return 10000; }
    // Stubs
    async getTicker() { return { symbol: 'BTC/USDT', price: 50000, timestamp: Date.now() }; }
    async placeOrder() { return {} as any; }
    async cancelOrder() { }
    async getOrder() { return {} as any; }
    async getCandles() { return []; }
    async start() { }
}

class MockTimeProvider implements ITimeProvider {
    private _now = 1000000000000;
    private _day = 1;

    setDay(day: number) { this._day = day; }
    now() { return this._now; }
    getUTCDate() { return this._day; }
}

describe('RiskManager Persistence', () => {
    let store: MockStore;
    let exchange: MockExchange;
    let timeProvider: MockTimeProvider;

    beforeEach(() => {
        store = new MockStore();
        exchange = new MockExchange();
        timeProvider = new MockTimeProvider();
    });

    test('should initialize and save default state', async () => {
        const riskManager = new RiskManager(exchange, store, timeProvider);
        await riskManager.init();

        const state = await store.getRiskState();
        expect(state).not.toBeNull();
        expect(state.startOfDayBalance).toBe(10000);
        expect(state.lastResetDay).toBe(1);
    });

    test('should recover state on restart if same day', async () => {
        // Pre-fill state with a "current" balance of 10000 but a "startOfDay" of 12000 (meaning we lost money currently)
        await store.saveRiskState({
            startOfDayBalance: 12000,
            lastResetDay: 1
        });

        const riskManager = new RiskManager(exchange, store, timeProvider);
        await riskManager.init();

        // Verify it didn't reset startOfDayBalance to current balance (10000)
        // Access private property logic via validation check or explicit any cast if needed, 
        // but cleaner to verify validation logic fails if drop is too high?
        // Let's inspect internal state via "validateOrder" behavior

        // If Init worked, StartOfDay is 12000. Current is 10000.
        // Drop = (12000 - 10000) / 12000 = 16.6%
        // Max DD is 5% (default). So validateOrder should return false.

        const allowed = await riskManager.validateOrder({ symbol: 'BTC', side: 'BUY', type: 'MARKET', quantity: 0.1 });
        expect(allowed).toBe(false);
    });

    test('should reset state on new day', async () => {
        // Old state from yesterday
        await store.saveRiskState({
            startOfDayBalance: 12000,
            lastResetDay: 0 // Yesterday
        });

        timeProvider.setDay(1); // Today

        const riskManager = new RiskManager(exchange, store, timeProvider);
        await riskManager.init();

        // Should reset startOfDayBalance to current balance (10000)
        // So drop is 0%. validateOrder should pass.
        const allowed = await riskManager.validateOrder({ symbol: 'BTC', side: 'BUY', type: 'MARKET', quantity: 0.1 });
        expect(allowed).toBe(true);

        const newState = await store.getRiskState();
        expect(newState.startOfDayBalance).toBe(10000);
        expect(newState.lastResetDay).toBe(1);
    });
});
