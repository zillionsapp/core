import { IDataStore, PortfolioSnapshot } from '../src/interfaces/repository.interface';
import { ITimeProvider } from '../src/core/time.provider';
import { Trade } from '../src/core/types';

export class MockStore implements IDataStore {
    private trades: Trade[] = [];
    private riskState: { startOfDayBalance: number, lastResetDay: number } | null = null;
    private snapshots: PortfolioSnapshot[] = [];
    private chartCache: Map<string, any[]> = new Map();
    private vaultTransactions: any[] = [];
    private inviterRelationships: Map<string, { inviterId: string; commissionRate: number; invitedEmail: string }> = new Map();

    async saveRiskState(state: { startOfDayBalance: number, lastResetDay: number }) { this.riskState = state; }
    async getRiskState() { return this.riskState; }

    async saveTrade(trade: Trade) {
        this.trades.push(trade);
    }

    async getTrades(symbol?: string, limit?: number, offset?: number) {
        let t = [...this.trades];
        if (symbol) t = t.filter(x => x.symbol === symbol);
        t.sort((a, b) => b.timestamp - a.timestamp);

        const start = offset || 0;
        const end = limit ? start + limit : t.length;
        return t.slice(start, end);
    }

    async savePortfolioSnapshot(snapshot: PortfolioSnapshot) {
        this.snapshots.push(snapshot);
    }

    async getLatestPortfolioSnapshot() {
        return this.snapshots.length > 0 ? this.snapshots[this.snapshots.length - 1] : null;
    }

    async getPortfolioSnapshots(limit: number, period?: string) {
        // Mock implementation ignores period for simplicity
        return this.snapshots.slice(-limit);
    }

    async getActiveTrade(symbol: string) {
        return this.trades.find(t => t.symbol === symbol && t.status === 'OPEN') || null;
    }

    async getOpenTrades() {
        return this.trades.filter(t => t.status === 'OPEN');
    }

    async updateTrade(id: string, updates: Partial<Trade>) {
        const trade = this.trades.find(t => t.id === id);
        if (trade) Object.assign(trade, updates);
    }

    async saveBacktestResult(result: any) { }
    async getBacktestResults() { return []; }

    async updateChartCache(period: string, data: any[]) {
        this.chartCache.set(period, data);
    }

    async getChartCache(period: string) {
        return this.chartCache.get(period) || [];
    }

    async saveVaultTransaction(transaction: any): Promise<void> { 
        this.vaultTransactions.push(transaction);
    }
    async getVaultTransactions(email?: string): Promise<any[]> { 
        if (email) {
            return this.vaultTransactions.filter(t => t.email === email);
        }
        return this.vaultTransactions;
    }
    async getVaultState(): Promise<any | null> { return null; }
    async saveVaultState(state: any): Promise<void> { }

    // Commission methods
    async saveCommissionTransaction(transaction: any): Promise<void> {
        this.vaultTransactions.push(transaction);
    }
    async getInviterRelationship(userId: string): Promise<{ inviterId: string; commissionRate: number; invitedEmail: string } | null> {
        return this.inviterRelationships.get(userId) || null;
    }
    async getTotalCommissionsEarned(userId: string): Promise<number> {
        return this.vaultTransactions
            .filter(t => t.inviter_id === userId && t.type === 'COMMISSION_EARNED')
            .reduce((sum, t) => sum + Math.abs(t.amount || 0), 0);
    }
    async getTotalCommissionsPaid(userId: string): Promise<number> {
        return this.vaultTransactions
            .filter(t => t.invited_user_id === userId && t.type === 'COMMISSION_PAID')
            .reduce((sum, t) => sum + Math.abs(t.amount || 0), 0);
    }
    async getInvitedUsersCount(inviterId: string): Promise<number> {
        const inviteCodes = new Set<string>();
        for (const t of this.vaultTransactions) {
            if (t.inviter_id === inviterId && t.type === 'COMMISSION_EARNED') {
                inviteCodes.add(t.invited_user_id);
            }
        }
        return inviteCodes.size;
    }

    // Helper for tests
    addVaultTransaction(transaction: any) {
        this.vaultTransactions.push(transaction);
    }
    setInviterRelationship(userId: string, relationship: { inviterId: string; commissionRate: number; invitedEmail: string }) {
        this.inviterRelationships.set(userId, relationship);
    }
}

export class MockTimeProvider implements ITimeProvider {
    private _now = Date.now();
    private _day = new Date().getUTCDate();

    setDay(day: number) { this._day = day; }
    setNow(now: number) { this._now = now; }
    now() { return this._now; }
    getUTCDate() { return this._day; }
}
