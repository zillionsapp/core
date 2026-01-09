import { createClient } from '@supabase/supabase-js';
import { config } from '../src/config/env';
import { Trade } from '../src/core/types';

interface PortfolioSnapshot {
    winRate: number;
    profitFactor: number;
    winningTrades: number;
    losingTrades: number;
}

class CalculationVerifier {
    private supabase;

    constructor() {
        if (!config.SUPABASE_URL || !config.SUPABASE_KEY) {
            throw new Error('Missing Supabase credentials');
        }
        this.supabase = createClient(config.SUPABASE_URL, config.SUPABASE_KEY);
    }

    /**
     * Calculate trade PnL using the same logic as PortfolioManager
     */
    private calculateTradePnL(trade: Trade): number {
        if (!trade.exitPrice) return 0;

        const quantity = Number(trade.quantity);
        const entryPrice = Number(trade.price);
        const exitPrice = Number(trade.exitPrice);

        const entryValue = entryPrice * quantity;
        const exitValue = exitPrice * quantity;

        if (trade.side === 'BUY') {
            return exitValue - entryValue;
        } else {
            return entryValue - exitValue;
        }
    }

    /**
     * Calculate win rate using the same logic as PortfolioManager
     */
    private calculateWinRate(trades: Trade[]): number {
        if (trades.length === 0) return 0;

        const winningTrades = trades.filter(trade => this.calculateTradePnL(trade) > 0);
        return winningTrades.length / trades.length;
    }

    /**
     * Calculate profit factor using the same logic as PortfolioManager
     */
    private calculateProfitFactor(trades: Trade[]): number {
        let grossProfit = 0;
        let grossLoss = 0;

        for (const trade of trades) {
            const pnl = this.calculateTradePnL(trade);
            if (pnl > 0) {
                grossProfit += pnl;
            } else if (pnl < 0) {
                grossLoss += Math.abs(pnl);
            }
        }

        return grossLoss === 0 ? (grossProfit > 0 ? Infinity : 0) : grossProfit / grossLoss;
    }

    /**
     * Fetch all closed trades from database
     */
    async fetchClosedTrades(): Promise<Trade[]> {
        console.log('Fetching closed trades...');

        const { data, error } = await this.supabase
            .from('trades')
            .select('*')
            .eq('status', 'CLOSED')
            .order('timestamp', { ascending: false });

        if (error) {
            throw new Error(`Error fetching closed trades: ${error.message}`);
        }

        console.log(`Found ${data?.length || 0} closed trades`);
        return (data as Trade[]) || [];
    }

    /**
     * Fetch latest portfolio snapshot
     */
    async fetchLatestSnapshot(): Promise<PortfolioSnapshot | null> {
        console.log('Fetching latest portfolio snapshot...');

        const { data, error } = await this.supabase
            .from('portfolio_snapshots')
            .select('winRate, profitFactor, winningTrades, losingTrades')
            .order('timestamp', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error && error.code !== 'PGRST116') {
            throw new Error(`Error fetching portfolio snapshot: ${error.message}`);
        }

        if (!data) {
            console.log('No portfolio snapshots found');
            return null;
        }

        return {
            winRate: (data as any).winRate ?? (data as any).win_rate ?? 0,
            profitFactor: (data as any).profitFactor ?? (data as any).profit_factor ?? 0,
            winningTrades: (data as any).winningTrades ?? (data as any).winning_trades ?? 0,
            losingTrades: (data as any).losingTrades ?? (data as any).losing_trades ?? 0
        };
    }

    /**
     * Run the verification test
     */
    async runVerification(): Promise<void> {
        try {
            console.log('=== Starting Calculation Stress Test ===\n');

            // Fetch data
            const closedTrades = await this.fetchClosedTrades();
            const latestSnapshot = await this.fetchLatestSnapshot();

            if (closedTrades.length === 0) {
                console.log('No closed trades found. Nothing to verify.');
                return;
            }

            // Calculate metrics manually
            const calculatedWinRate = this.calculateWinRate(closedTrades);
            const calculatedProfitFactor = this.calculateProfitFactor(closedTrades);
            const calculatedWinningTrades = closedTrades.filter(t => this.calculateTradePnL(t) > 0).length;
            const calculatedLosingTrades = closedTrades.filter(t => this.calculateTradePnL(t) < 0).length;

            console.log('=== Manual Calculations ===');
            console.log(`Total Trades: ${closedTrades.length}`);
            console.log(`Winning Trades: ${calculatedWinningTrades}`);
            console.log(`Losing Trades: ${calculatedLosingTrades}`);
            console.log(`Win Rate: ${(calculatedWinRate * 100).toFixed(2)}%`);
            console.log(`Profit Factor: ${calculatedProfitFactor.toFixed(4)}`);
            console.log('');

            if (!latestSnapshot) {
                console.log('No portfolio snapshot to compare against.');
                return;
            }

            console.log('=== Stored Values ===');
            console.log(`Winning Trades: ${latestSnapshot.winningTrades}`);
            console.log(`Losing Trades: ${latestSnapshot.losingTrades}`);
            console.log(`Win Rate: ${(latestSnapshot.winRate * 100).toFixed(2)}%`);
            console.log(`Profit Factor: ${latestSnapshot.profitFactor.toFixed(4)}`);
            console.log('');

            // Compare values
            console.log('=== Verification Results ===');

            const winRateMatch = Math.abs(calculatedWinRate - latestSnapshot.winRate) < 0.0001;
            const profitFactorMatch = Math.abs(calculatedProfitFactor - latestSnapshot.profitFactor) < 0.0001;
            const winningTradesMatch = calculatedWinningTrades === latestSnapshot.winningTrades;
            const losingTradesMatch = calculatedLosingTrades === latestSnapshot.losingTrades;

            console.log(`Win Rate Match: ${winRateMatch ? '✅' : '❌'} (${calculatedWinRate.toFixed(6)} vs ${latestSnapshot.winRate.toFixed(6)})`);
            console.log(`Profit Factor Match: ${profitFactorMatch ? '✅' : '❌'} (${calculatedProfitFactor.toFixed(6)} vs ${latestSnapshot.profitFactor.toFixed(6)})`);
            console.log(`Winning Trades Match: ${winningTradesMatch ? '✅' : '❌'} (${calculatedWinningTrades} vs ${latestSnapshot.winningTrades})`);
            console.log(`Losing Trades Match: ${losingTradesMatch ? '✅' : '❌'} (${calculatedLosingTrades} vs ${latestSnapshot.losingTrades})`);

            const allMatch = winRateMatch && profitFactorMatch && winningTradesMatch && losingTradesMatch;

            console.log('');
            console.log(`Overall Result: ${allMatch ? '✅ ALL CALCULATIONS CORRECT' : '❌ DISCREPANCIES FOUND'}`);

            if (!allMatch) {
                console.log('\n=== Detailed Trade Analysis ===');
                closedTrades.slice(0, 10).forEach((trade, index) => {
                    const pnl = this.calculateTradePnL(trade);
                    console.log(`Trade ${index + 1}: ${trade.id} - ${trade.side} ${trade.symbol} - PnL: ${pnl.toFixed(2)}`);
                });
                if (closedTrades.length > 10) {
                    console.log(`... and ${closedTrades.length - 10} more trades`);
                }
            }

        } catch (error) {
            console.error('Error during verification:', error);
            process.exit(1);
        }
    }
}

// Run the test if this script is executed directly
if (require.main === module) {
    const verifier = new CalculationVerifier();
    verifier.runVerification().then(() => {
        console.log('\n=== Stress Test Complete ===');
        process.exit(0);
    }).catch((error) => {
        console.error('Stress test failed:', error);
        process.exit(1);
    });
}

export { CalculationVerifier };
