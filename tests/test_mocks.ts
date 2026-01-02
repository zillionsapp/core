import { IDataStore } from '../src/interfaces/repository.interface';
import { ITimeProvider } from '../src/core/time.provider';
import { Trade } from '../src/core/types';

export class MockStore implements IDataStore {
    private storage: any = {};
    async saveRiskState(state: any) { this.storage['risk_state'] = state; }
    async getRiskState() { return this.storage['risk_state'] || null; }

    // Stubs
    async saveTrade(trade: Trade) { }
    async getTrades() { return []; }
    async savePortfolioSnapshot() { }
    async saveBacktestResult() { }
    async getBacktestResults() { return []; }
    async getLatestPortfolioSnapshot() { return null; }
    async getActiveTrade() { return null; }
    async getOpenTrades() { return []; }
    async updateTrade() { }
}

export class MockTimeProvider implements ITimeProvider {
    private _now = Date.now();
    private _day = new Date().getUTCDate();

    setDay(day: number) { this._day = day; }
    setNow(now: number) { this._now = now; }
    now() { return this._now; }
    getUTCDate() { return this._day; }
}
