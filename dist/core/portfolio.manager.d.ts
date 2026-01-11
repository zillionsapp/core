import { IExchange } from '../interfaces/exchange.interface';
import { IDataStore, PortfolioSnapshot } from '../interfaces/repository.interface';
import { ITimeProvider } from './time.provider';
import { IVaultManager } from '../interfaces/vault.interface';
export declare class PortfolioManager {
    private exchange;
    private db;
    private timeProvider;
    private vaultManager?;
    constructor(exchange: IExchange, db: IDataStore, timeProvider?: ITimeProvider, vaultManager?: IVaultManager | undefined);
    /**
     * Implementation of EquityProvider for VaultManager
     */
    getCurrentEquity(): Promise<number>;
    /**
     * Generate a comprehensive portfolio snapshot with all metrics.
     *
     * This method performs the following steps:
     * 1. Capture the current timestamp.
     * 2. Retrieve **all** open trades and the full trade history (no artificial limits).
     * 3. Separate closed trades from open trades.
     * 4. Compute realized PnL from closed trades.
     * 5. Derive the wallet balance as `initialBalance + realizedPnL`.
     * 6. Calculate margin used for each open trade, respecting the configured `LEVERAGE_VALUE`.
     * 7. Determine holdings for each asset, including the base balance asset.
     * 8. Attempt to fetch the real available balance from the exchange. If the exchange call fails or returns an invalid value, fall back to `walletBalance - totalMarginUsed`.
     * 9. Ensure the available balance is never negative.
     * 10. Fetch current market prices for all symbols present in open trades.
     * 11. Compute unrealized PnL for each open trade.
     * 12. Assemble the `PortfolioSnapshot` object with all calculated metrics.
     */
    generateSnapshot(): Promise<PortfolioSnapshot>;
    /**
     * Save the current portfolio snapshot
     */
    saveSnapshot(): Promise<void>;
    private refreshChartCache;
    private downsample;
    private calculateTotalPnL;
    private calculateTradePnL;
    private calculateUnrealizedPnL;
    private calculateWinRate;
    private calculateProfitFactor;
}
