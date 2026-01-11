import { IVaultManager, VaultTransaction } from '../interfaces/vault.interface';
import { IDataStore } from '../interfaces/repository.interface';
import { ITimeProvider } from './time.provider';
export interface EquityProvider {
    getCurrentEquity(): Promise<number>;
}
export declare class VaultManager implements IVaultManager {
    private db;
    private equityProvider?;
    private timeProvider;
    constructor(db: IDataStore, timeProvider?: ITimeProvider);
    /**
     * Set the equity provider to avoid circular dependencies
     */
    setEquityProvider(provider: EquityProvider): void;
    getSharePrice(): Promise<number>;
    getTotalAssets(): Promise<number>;
    getTotalShares(): Promise<number>;
    getTotalDepositedBalance(): Promise<number>;
    deposit(email: string, amount: number): Promise<VaultTransaction>;
    withdraw(email: string, shares: number): Promise<VaultTransaction>;
}
