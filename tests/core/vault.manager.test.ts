import { VaultManager } from '../../src/core/vault.manager';
import { IDataStore } from '../../src/interfaces/repository.interface';

describe('VaultManager', () => {
    let vaultManager: VaultManager;
    let mockDb: jest.Mocked<IDataStore>;

    beforeEach(() => {
        mockDb = {
            getVaultState: jest.fn(),
            saveVaultState: jest.fn(),
            saveVaultTransaction: jest.fn(),
            getVaultTransactions: jest.fn().mockResolvedValue([]),
            getLatestPortfolioSnapshot: jest.fn(),
        } as any;

        vaultManager = new VaultManager(mockDb);
    });

    it('should calculate initial share price as 1.0', async () => {
        mockDb.getVaultState.mockResolvedValue(null);
        mockDb.getVaultTransactions.mockResolvedValue([]);

        const price = await vaultManager.getSharePrice();
        expect(price).toBe(1.0);
    });

    it('should calculate share price based on total assets and shares', async () => {
        mockDb.getVaultState.mockResolvedValue({ total_shares: 1000 } as any);
        // Mock getTotalShares via transactions
        mockDb.getVaultTransactions.mockResolvedValue([
            { type: 'DEPOSIT', shares: 1000, timestamp: Date.now() - 1000 }
        ] as any);
        // Mock getTotalAssets via getLatestPortfolioSnapshot fallback
        mockDb.getLatestPortfolioSnapshot.mockResolvedValue({ currentEquity: 1200, timestamp: Date.now() - 500 } as any);

        const price = await vaultManager.getSharePrice();
        expect(price).toBe(1.2);
    });

    it('should handle deposit and issue correct shares', async () => {
        mockDb.getVaultState.mockResolvedValue({ total_assets: 0, total_shares: 1000 } as any);
        mockDb.getVaultTransactions.mockResolvedValue([
            { type: 'DEPOSIT', shares: 1000, timestamp: Date.now() - 1000 }
        ] as any);
        mockDb.getLatestPortfolioSnapshot.mockResolvedValue({ currentEquity: 1200, timestamp: Date.now() - 500 } as any);

        const tx = await vaultManager.deposit('test@example.com', 120);

        expect(tx.shares).toBe(100); // 120 / 1.2
        expect(mockDb.saveVaultTransaction).toHaveBeenCalledWith(expect.objectContaining({
            email: 'test@example.com',
            amount: 120,
            shares: 100,
            type: 'DEPOSIT'
        }));
        expect(mockDb.saveVaultState).toHaveBeenCalledWith({
            total_assets: 120,
            total_shares: 1100
        });
    });

    it('should handle withdrawal and return correct amount', async () => {
        mockDb.getVaultState.mockResolvedValue({ total_assets: 1320, total_shares: 1100 } as any);
        mockDb.getVaultTransactions.mockResolvedValue([
            { type: 'DEPOSIT', shares: 1100, timestamp: Date.now() - 1000 }
        ] as any);
        mockDb.getLatestPortfolioSnapshot.mockResolvedValue({ currentEquity: 1320, timestamp: Date.now() - 500 } as any); // Price = 1.2

        const tx = await vaultManager.withdraw('test@example.com', 100);

        expect(tx.amount).toBe(120);
        expect(mockDb.saveVaultState).toHaveBeenCalledWith({
            total_assets: 1200,
            total_shares: 1000
        });
    });

    it('should throw error if withdrawing more shares than available', async () => {
        mockDb.getVaultState.mockResolvedValue({ total_shares: 50 } as any);
        mockDb.getVaultTransactions.mockResolvedValue([]);
        mockDb.getLatestPortfolioSnapshot.mockResolvedValue({ currentEquity: 50 } as any);

        await expect(vaultManager.withdraw('test@example.com', 100))
            .rejects.toThrow('Insufficient shares in vault');
    });
});
