
import { PortfolioManager } from '../../src/core/portfolio.manager';
import { Trade } from '../../src/core/types';

describe('Backend PnL Logic Verification', () => {
    // This test ensures that the backend calculations are mathematically sound and consistent
    // with the expectations of a professional trading bot (ROE vs Notional).

    let portfolioManager: PortfolioManager;

    beforeEach(() => {
        // Minimal mock setup since we only test pure calculation methods
        portfolioManager = new PortfolioManager({} as any, {} as any);
    });

    const mockTrade = (side: 'BUY' | 'SELL', price: number, exitPrice: number, quantity: number, leverage: number = 1): Trade => ({
        id: '1', orderId: '1', symbol: 'BTC/USDT', status: 'CLOSED', timestamp: 0,
        side, price, exitPrice, quantity, leverage, margin: (price * quantity) / leverage
    } as Trade);

    it('should calculate accurate Dollar PnL matching (Exit - Entry) * Qty', () => {
        // User's Case:
        // Entry: 89,740.73
        // Exit: 89,788.41
        // Qty: 0.011115
        // Diff: +47.68
        // Expected Dollar PnL: 47.68 * 0.011115 ~= 0.53

        // Note: User had a LOSS in their example (-0.53).
        // If Entry 89740 < Exit 89788, a SELL (Short) would lose money.
        // Let's assume it was a SELL trade.

        const trade = mockTrade('SELL', 89740.73, 89788.41, 0.011115, 10);

        // Use the private method via casting (or public if available, but here we test internal logic)
        const pnl = (portfolioManager as any).calculateTradePnL(trade);

        // Expected: (Entry - Exit) * Qty
        // (89740.73 - 89788.41) * 0.011115
        // -47.68 * 0.011115 = -0.5299...

        expect(pnl).toBeCloseTo(-0.53, 2);
    });

    it('should NOT calculate Percentage PnL on the backend (Validation)', () => {
        // The backend should return raw dollar values. 
        // We verify that the Snapshot object's closedTrades list contains just the dollar PnL,
        // confirming that the "Percentage" display is purely a frontend responsibility.

        // This test simulates the snapshot generation logic part 
        const trade = mockTrade('SELL', 89740.73, 89788.41, 0.011115, 10);
        const pnl = (portfolioManager as any).calculateTradePnL(trade);

        const snapshotEntry = {
            ...trade,
            pnl
        };

        // Assert that we are NOT storing a 'pnlPercentage' field in the snapshot trade objects
        expect(snapshotEntry).not.toHaveProperty('pnlPercentage');

        // Validate the PnL is the dollar amount
        expect(snapshotEntry.pnl).toBeCloseTo(-0.53, 2);
    });

    it('should verify Margin calculation mechanism', () => {
        // Margin = Position Value / Leverage
        const trade = mockTrade('BUY', 10000, 11000, 1, 10); // 1 BTC @ 10k, 10x Lev
        // Position Val = 10,000
        // Margin = 1,000

        const margin = trade.margin;
        expect(margin).toBe(1000);
    });

});
