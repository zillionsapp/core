import { VaultManager } from '../../src/core/vault.manager';
import { PaperExchange } from '../../src/adapters/exchange/paper';
import { RiskManager } from '../../src/core/risk.manager';
import { MockStore, MockTimeProvider } from '../test_mocks';
import { config } from '../../src/config/env';
import { MemoryDataProvider } from '../../src/adapters/data/memory_data';

describe('Vault Trading Integration', () => {
    let mockStore: MockStore;
    let timeProvider: MockTimeProvider;
    let dataProvider: MemoryDataProvider;

    beforeEach(() => {
        mockStore = new MockStore();
        timeProvider = new MockTimeProvider();
        dataProvider = new MemoryDataProvider([]);

        // Reset config defaults for tests
        (config as any).VAULT_ENABLED = true;
        (config as any).PAPER_INITIAL_BALANCE = 10000;
        (config as any).PAPER_BALANCE_ASSET = 'USDT';
    });

    it('should have 0 balance and reject trading when vault is enabled but empty', async () => {
        // Vault is enabled in config, pass mockStore as db
        const exchange = new PaperExchange(dataProvider, timeProvider, undefined, mockStore);
        const vaultManager = exchange.getVaultManager();
        expect(vaultManager).toBeDefined();

        const riskManager = new RiskManager(exchange, mockStore, timeProvider);

        // Resolve circular dependency for the test
        const portfolioManager = new (jest.fn().mockImplementation(() => ({
            getCurrentEquity: jest.fn().mockResolvedValue(0)
        })))() as any;
        (vaultManager as any).setEquityProvider(portfolioManager);

        // 1. Start exchange (loads vault balance)
        await exchange.start();

        // 2. Mock market data
        dataProvider.setTicker('BTC/USDT', { symbol: 'BTC/USDT', price: 50000, timestamp: Date.now() });

        // 3. Verify balance is 0
        const balance = await exchange.getBalance('USDT');
        expect(balance).toBe(0);

        // 4. Risk check should fail to calculate quantity (or return 0)
        const quantity = await riskManager.calculateQuantity('BTC/USDT', 50000);
        expect(quantity).toBe(0);

        // 4. Manual order placement should fail
        await expect(exchange.placeOrder({
            symbol: 'BTC/USDT',
            side: 'BUY',
            type: 'MARKET',
            quantity: 1
        })).rejects.toThrow(/Insufficient funds/);
    });

    it('should have correct balance and allow trading when vault has deposits', async () => {
        const exchange = new PaperExchange(dataProvider, timeProvider, undefined, mockStore);
        const vaultManager = exchange.getVaultManager();
        const riskManager = new RiskManager(exchange, mockStore, timeProvider);

        // Resolve circular dependency for the test
        const portfolioManager = new (jest.fn().mockImplementation(() => ({
            getCurrentEquity: jest.fn().mockResolvedValue(5000)
        })))() as any;
        (vaultManager as any).setEquityProvider(portfolioManager);

        // Mock state for funds
        jest.spyOn(mockStore, 'getVaultState').mockResolvedValue({
            total_assets: 5000,
            total_shares: 5000
        });

        // Also need some mock transactions if getTotalDepositedBalance uses them
        jest.spyOn(mockStore, 'getVaultTransactions').mockResolvedValue([
            { amount: 5000, type: 'DEPOSIT', email: 'test@example.com' }
        ]);

        // 1. Start exchange
        await exchange.start();

        // 2. Verify balance is 5000
        const balance = await exchange.getBalance('USDT');
        expect(balance).toBe(5000);

        // 3. Risk check should return valid quantity
        // Default position size is 10% = 500 USDT. At 50k, qty = 0.01
        const quantity = await riskManager.calculateQuantity('BTC/USDT', 50000);
        expect(quantity).toBeGreaterThan(0);
        expect(quantity).toBeCloseTo(0.01);

        // 4. Order placement should succeed
        dataProvider.setTicker('BTC/USDT', { symbol: 'BTC/USDT', price: 50000, timestamp: Date.now() });
        const order = await exchange.placeOrder({
            symbol: 'BTC/USDT',
            side: 'BUY',
            type: 'MARKET',
            quantity: 0.01
        });
        expect(order.status).toBe('FILLED');

        const newBalance = await exchange.getBalance('USDT');
        expect(newBalance).toBeLessThan(5000); // Margin deducted
    });

    it('should use PAPER_INITIAL_BALANCE when vault is disabled', async () => {
        (config as any).VAULT_ENABLED = false;

        // Even if vaultManager is passed, it should be ignored if config is false
        const vaultManager = new VaultManager(mockStore);
        const exchange = new PaperExchange(dataProvider, timeProvider, vaultManager);

        await exchange.start();

        const balance = await exchange.getBalance('USDT');
        expect(balance).toBe(10000); // Uses config.PAPER_INITIAL_BALANCE
    });
});
