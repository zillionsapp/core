import { IDataStore, PortfolioSnapshot } from '../../interfaces/repository.interface';
import { Trade } from '../../core/types';
export declare class SupabaseDataStore implements IDataStore {
    private supabase;
    private inMemoryTrades;
    constructor();
    saveTrade(trade: Trade): Promise<void>;
    getTrades(symbol?: string, limit?: number, offset?: number): Promise<Trade[]>;
    savePortfolioSnapshot(snapshot: PortfolioSnapshot): Promise<void>;
    getLatestPortfolioSnapshot(): Promise<PortfolioSnapshot | null>;
    getPortfolioSnapshots(limit?: number, period?: string): Promise<PortfolioSnapshot[]>;
    private consolidateSnapshots;
    saveBacktestResult(result: any): Promise<void>;
    getBacktestResults(limit?: number): Promise<any[]>;
    getActiveTrade(symbol: string): Promise<Trade | null>;
    getOpenTrades(): Promise<Trade[]>;
    updateTrade(id: string, updates: Partial<Trade>): Promise<void>;
    getRiskState(): Promise<{
        startOfDayBalance: number;
        lastResetDay: number;
    } | null>;
    saveRiskState(state: {
        startOfDayBalance: number;
        lastResetDay: number;
    }): Promise<void>;
    updateChartCache(period: string, data: any[]): Promise<void>;
    getChartCache(period: string): Promise<any[]>;
    saveVaultTransaction(transaction: any): Promise<void>;
    getVaultTransactions(email?: string): Promise<any[]>;
    getVaultState(): Promise<any | null>;
    saveVaultState(state: any): Promise<void>;
    saveCommissionTransaction(transaction: any): Promise<void>;
    getInviterRelationship(userId: string): Promise<{
        inviterId: string;
        commissionRate: number;
        invitedEmail: string;
    } | null>;
    getTotalCommissionsEarned(userId: string): Promise<number>;
    getTotalCommissionsPaid(userId: string): Promise<number>;
    getInvitedUsersCount(inviterId: string): Promise<number>;
    getAllInviterRelationships(): Promise<Array<{
        inviterId: string;
        invitedUserId: string;
        commissionRate: number;
        invitedEmail: string;
    }>>;
    getUserEmail(userId: string): Promise<string>;
    getTotalVaultAssets(): Promise<number>;
}
