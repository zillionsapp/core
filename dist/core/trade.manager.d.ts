import { IExchange } from '../interfaces/exchange.interface';
import { IDataStore } from '../interfaces/repository.interface';
import { Trade, Candle } from './types';
import { CommissionManager } from './commission.manager';
export declare class TradeManager {
    private exchange;
    private db;
    private commissionManager?;
    constructor(exchange: IExchange, db: IDataStore);
    /**
     * Set the CommissionManager for commission calculations on trade close
     */
    setCommissionManager(commissionManager: CommissionManager): void;
    /**
     * Check all open positions and manage them (check SL/TP, close if triggered)
     */
    checkAndManagePositions(latestCandle?: Candle): Promise<void>;
    private checkPosition;
    private calculateTrailingStop;
    /**
     * Force close a position immediately
     */
    forceClosePosition(trade: Trade, reason: string): Promise<void>;
    /**
     * Close a position and handle commission distribution
     */
    private closePosition;
    /**
     * Calculate P&L for a closed trade
     */
    private calculateTradePnL;
    /**
     * Process commission payment for a closed trade
     * Called when a trade closes with profit
     * @deprecated Use processVaultCommissionPayment in CommissionManager instead
     */
    private processCommissionPayment;
}
