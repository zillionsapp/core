import { PortfolioManager } from '../../src/core/portfolio.manager';
import { IDataStore, PortfolioSnapshot } from '../../src/interfaces/repository.interface';
import { IExchange } from '../../src/interfaces/exchange.interface';
import { ITimeProvider } from '../../src/core/time.provider';

describe('PortfolioManager Chart Cache', () => {
    let manager: PortfolioManager;
    let mockDb: jest.Mocked<IDataStore>;
    let mockExchange: jest.Mocked<IExchange>;
    let mockTime: jest.Mocked<ITimeProvider>;

    beforeEach(() => {
        mockDb = {
            savePortfolioSnapshot: jest.fn().mockResolvedValue(undefined),
            getPortfolioSnapshots: jest.fn().mockResolvedValue([]),
            getChartCache: jest.fn().mockResolvedValue([]),
            updateChartCache: jest.fn().mockResolvedValue(undefined),
            getTrades: jest.fn().mockResolvedValue([]),
            getOpenTrades: jest.fn().mockResolvedValue([]),
        } as any;

        mockExchange = {
            getBalance: jest.fn().mockResolvedValue({ available: 10000, total: 10000 }),
        } as any;

        mockTime = {
            now: jest.fn().mockReturnValue(1000000),
        } as any;

        manager = new PortfolioManager(mockExchange, mockDb, mockTime);
    });

    it('should bootstrap cache if it is empty', async () => {
        const dummySnapshot: PortfolioSnapshot = {
            timestamp: 1000000,
            currentEquity: 10500,
        } as any;

        const historicalSnapshots: PortfolioSnapshot[] = [
            { timestamp: 900000, currentEquity: 10000 } as any,
            { timestamp: 950000, currentEquity: 10200 } as any,
        ];

        mockDb.getChartCache.mockResolvedValue([]);
        mockDb.getPortfolioSnapshots.mockResolvedValue(historicalSnapshots);

        // Use an any cast to call the private method for testing purpose or just call saveSnapshot
        // Calling saveSnapshot triggers the refresh flow
        jest.spyOn(manager as any, 'generateSnapshot').mockResolvedValue(dummySnapshot);

        await manager.saveSnapshot();

        // Wait for background async calls
        await new Promise(resolve => setTimeout(resolve, 50));

        expect(mockDb.getChartCache).toHaveBeenCalled();
        expect(mockDb.getPortfolioSnapshots).toHaveBeenCalledWith(1000, expect.any(String));
        expect(mockDb.updateChartCache).toHaveBeenCalled();

        // Verify we passed data containing both historical and the new point
        const updateCall = mockDb.updateChartCache.mock.calls.find(call => call[0] === 'all');
        const updatedData = updateCall![1];
        expect(updatedData.length).toBe(3); // 2 historical + 1 new
        expect(updatedData[updatedData.length - 1].equity).toBe(10500);
    });

    it('should update cache incrementally if it already exists', async () => {
        const dummySnapshot: PortfolioSnapshot = {
            timestamp: 1000000,
            currentEquity: 10700,
        } as any;

        const existingCache = [
            { timestamp: 900000, equity: 10000 },
            { timestamp: 950000, equity: 10200 },
        ];

        mockDb.getChartCache.mockResolvedValue(existingCache);
        jest.spyOn(manager as any, 'generateSnapshot').mockResolvedValue(dummySnapshot);

        await manager.saveSnapshot();
        await new Promise(resolve => setTimeout(resolve, 50));

        // Should NOT call getPortfolioSnapshots (historical) if cache exists
        expect(mockDb.getPortfolioSnapshots).not.toHaveBeenCalled();
        expect(mockDb.updateChartCache).toHaveBeenCalled();

        const updateCall = mockDb.updateChartCache.mock.calls.find(call => call[0] === 'all');
        const updatedData = updateCall![1];
        expect(updatedData.length).toBe(3);
        expect(updatedData[2].equity).toBe(10700);
    });

    it('should downsample when cache size exceeds limit', async () => {
        const largeCache = Array.from({ length: 600 }, (_, i) => ({
            timestamp: i * 1000,
            equity: 10000 + i
        }));

        mockDb.getChartCache.mockResolvedValue(largeCache);
        jest.spyOn(manager as any, 'generateSnapshot').mockResolvedValue({
            timestamp: 700000,
            currentEquity: 11000
        } as any);

        await manager.saveSnapshot();
        await new Promise(resolve => setTimeout(resolve, 50));

        const updateCall = mockDb.updateChartCache.mock.calls.find(call => call[0] === 'all');
        const updatedData = updateCall![1];

        // TARGET_POINTS is 200 in the code
        expect(updatedData.length).toBe(200);
    });
});
