import { IDataStore, PortfolioSnapshot } from '../src/interfaces/repository.interface';
import { ITimeProvider } from '../src/core/time.provider';
import { Trade } from '../src/core/types';

export class MockStore implements IDataStore {
    private trades: Trade[] = [];
    private riskState: any = null;
    private snapshots: PortfolioSnapshot[] = [];

    async saveRiskState(state: any) { this.riskState = state; }
    async getRiskState() { return this.riskState; }

    async saveTrade(trade: Trade) {
        this.trades.push(trade);
    }

    async getTrades(symbol?: string) {
        let t = this.trades;
        if (symbol) t = t.filter(x => x.symbol === symbol);
        return [...t].sort((a, b) => b.timestamp - a.timestamp);
    }

    async savePortfolioSnapshot(snapshot: PortfolioSnapshot) {
        this.snapshots.push(snapshot);
    }

    async getLatestPortfolioSnapshot() {
        return this.snapshots.length > 0 ? this.snapshots[this.snapshots.length - 1] : null;
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
}

export class MockTimeProvider implements ITimeProvider {
    private _now = Date.now();
    private _day = new Date().getUTCDate();

    setDay(day: number) { this._day = day; }
    setNow(now: number) { this._now = now; }
    now() { return this._now; }
    getUTCDate() { return this._day; }
}
