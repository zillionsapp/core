
import { IMarketDataProvider } from '../../src/interfaces/market_data.interface';
import { BN } from '@drift-labs/sdk';
import { Keypair } from '@solana/web3.js';
import * as fs from 'fs';

// --- Mocks Setup MUST be before imports of modules that use them ---

const mockConfig = {
    DRIFT_ENV: 'devnet',
    SOLANA_RPC_URL: 'mock_url',
    WALLET_PRIVATE_KEY: 'mock_private_key',
    DRIFT_MAX_PRIORITY_FEE: 5000,
    DRIFT_ENABLE_AUTO_SETTLEMENT: true,
    VAULT_ENABLED: false,
    DRIFT_VAULT_ADDRESS: undefined,
    PAPER_INITIAL_BALANCE: 0,
    PAPER_BALANCE_ASSET: 'USDT',
    EXCHANGE_DRIVER: 'DRIFT'
};

jest.mock('../../src/config/env', () => ({
    config: mockConfig
}));

// Now we can import the module that uses config
import { DriftExchange } from '../../src/adapters/exchange/drift';

const mockDriftClient = {
    subscribe: jest.fn(),
    getUser: jest.fn(),
    getOraclePriceDataAndSlot: jest.fn(),
    getPerpMarketAccount: jest.fn(),
    convertToPerpPrecision: jest.fn((val) => new BN(val * 1000000)), // Mock conversion
    convertToPricePrecision: jest.fn((val) => new BN(val * 1000000)), // Mock conversion
    placePerpOrder: jest.fn(),
    cancelOrder: jest.fn(),
    settlePNL: jest.fn(),
};

const mockUser = {
    getNetSpotMarketValue: jest.fn(),
    getUserAccount: jest.fn(),
    getUserAccountPublicKey: jest.fn(),
    getOpenOrders: jest.fn(),
};

const mockPriorityFeeSubscriber = {
    subscribe: jest.fn(),
    getCustomStrategyResult: jest.fn(),
};

const mockMarketData: IMarketDataProvider = {
    name: 'MOCK',
    getCandles: jest.fn().mockResolvedValue([{
        symbol: 'SOL/USDT',
        interval: '1m',
        open: 100, high: 101, low: 99, close: 100.5,
        volume: 1000, startTime: Date.now()
    }]),
    getTicker: jest.fn(),
};

// Mock the dependencies
jest.mock('@drift-labs/sdk', () => {
    return {
        DriftClient: jest.fn().mockImplementation(() => mockDriftClient),
        Wallet: jest.fn().mockImplementation(() => ({
            publicKey: { toBase58: () => 'mock_wallet_pubkey' },
            payer: { publicKey: { toBase58: () => 'mock_wallet_pubkey' } }
        })),
        PriorityFeeSubscriber: jest.fn().mockImplementation(() => mockPriorityFeeSubscriber),
        BN: require('bn.js'), // Use real BN
        DriftEnv: {},
        OrderType: { MARKET: 'MARKET', LIMIT: 'LIMIT' },
        PositionDirection: { LONG: 'LONG', SHORT: 'SHORT' },
        MarketType: { PERP: 'PERP' },
        BASE_PRECISION: new (require('bn.js'))(1000000),
        PRICE_PRECISION: new (require('bn.js'))(1000000),
        QUOTE_PRECISION: new (require('bn.js'))(1000000),
        convertToNumber: (bn: any) => bn.toNumber() / 1000000,
        PriorityFeeMethod: { SOLANA: 'SOLANA' },
        OracleSource: { PYTH: 'PYTH' }
    };
});

jest.mock('@solana/web3.js', () => ({
    Connection: jest.fn(),
    Keypair: { fromSecretKey: jest.fn() },
    PublicKey: jest.fn().mockImplementation(() => ({ toBase58: () => 'mock-key' }))
}));

jest.mock('bs58', () => ({
    decode: jest.fn().mockReturnValue(new Uint8Array(64))
}));

jest.mock('fs', () => ({
    readFileSync: jest.fn()
}));


describe('DriftExchange', () => {
    let exchange: DriftExchange;

    beforeEach(() => {
        jest.clearAllMocks();

        // Ensure config is set correctly for tests
        mockConfig.WALLET_PRIVATE_KEY = 'mock_private_key';
        mockConfig.DRIFT_ENABLE_AUTO_SETTLEMENT = true;
        mockConfig.DRIFT_MAX_PRIORITY_FEE = 5000;

        exchange = new DriftExchange(undefined, mockMarketData);

        // Setup common mock returns
        mockDriftClient.getUser.mockReturnValue(mockUser);

        mockUser.getNetSpotMarketValue.mockReturnValue(new BN(1000000000)); // 1000 * 10^6

        // Mock Ticker
        mockDriftClient.getPerpMarketAccount.mockReturnValue({
            amm: { oracle: 'mock_oracle', oracleSource: 'PYTH' }
        });
        mockDriftClient.getOraclePriceDataAndSlot.mockReturnValue({
            data: { price: new BN(150000000) } // 150.00
        });
    });

    it('should initialize correctly', async () => {
        await exchange.start();

        expect(mockDriftClient.subscribe).toHaveBeenCalled();
        expect(mockPriorityFeeSubscriber.subscribe).toHaveBeenCalled();
        expect(mockDriftClient.getUser).toHaveBeenCalled();
    });

    it('should fetch balance', async () => {
        await exchange.start();
        const balance = await exchange.getBalance('USDC');
        expect(balance).toBe(1000); // 1000 * 10^6 / 10^6
    });

    it('should place order with priority fee', async () => {
        await exchange.start();
        mockDriftClient.placePerpOrder.mockResolvedValue('tx_signature_123');

        await exchange.placeOrder({
            symbol: 'SOL-PERP',
            side: 'BUY',
            quantity: 1,
            type: 'MARKET'
        });

        expect(mockDriftClient.placePerpOrder).toHaveBeenCalledWith(
            expect.objectContaining({
                marketIndex: 0,
                baseAssetAmount: expect.any(Object), // BN
                direction: 'LONG'
            }),
            expect.objectContaining({
                computeUnitsPrice: 5000
            })
        );
    });

    it('should cancel order', async () => {
        await exchange.start();

        // Mock Open Orders
        const mockOpenOrder = {
            orderId: new BN(123),
            marketIndex: 0,
            postOnly: false
        };
        mockUser.getOpenOrders.mockReturnValue([mockOpenOrder]);
        mockDriftClient.cancelOrder.mockResolvedValue('cancel_tx_123');

        await exchange.cancelOrder('any_id', 'SOL-PERP');

        expect(mockDriftClient.cancelOrder).toHaveBeenCalledWith(mockOpenOrder.orderId);
    });

    it('should settle PnL when enabled', async () => {
        await exchange.start();

        // Trigger the interval logic (by calling private method or waiting, 
        // but explicit testing of method logic is better).
        // Since checkAndSettlePnL is private, we can cast to any to test it
        // OR we can trust that it was set in setInterval (hard to test without fake timers).

        // Let's call it manually via cast

        // Setup mock user account with closed position (base amount 0)
        mockUser.getUserAccount.mockReturnValue({
            perpPositions: [{
                marketIndex: 0,
                baseAssetAmount: new BN(0)
            }]
        });
        // Authority logic
        // We need to make sure getUserAccount().authority returns something
        mockUser.getUserAccount.mockReturnValue({
            perpPositions: [{
                marketIndex: 0,
                baseAssetAmount: new BN(0)
            }],
            authority: 'mock_authority_key'
        });

        mockUser.getUserAccountPublicKey.mockReturnValue('mock_pubkey');
        mockDriftClient.settlePNL.mockResolvedValue('settle_tx_123');

        await (exchange as any).checkAndSettlePnL();

        expect(mockDriftClient.settlePNL).toHaveBeenCalledWith(
            'mock_pubkey',
            expect.objectContaining({ authority: 'mock_authority_key' }),
            0
        );
    });

    it('should use injected market data provider for candles', async () => {
        const candles = await exchange.getCandles('SOL-PERP', '1m', 10);
        expect(mockMarketData.getCandles).toHaveBeenCalledWith('SOL/USDT', '1m', 10);
        expect(candles.length).toBe(1);
    });
});
