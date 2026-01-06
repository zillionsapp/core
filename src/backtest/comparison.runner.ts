import { StrategyManager } from '../core/strategy.manager';
import { BacktestRunner } from './runner';
import { config } from '../config/env';

interface BacktestResult {
    strategyName: string;
    symbol: string;
    interval: string;
    tradesCount: number;
    winrate: number;
    profitFactor: number;
    initialBalance: number;
    finalBalance: number;
    pnlUSDT: number;
    pnlPercent: number;
    buyHoldPercent: number;
    timestamp: number;
}

export class ComparisonBacktestRunner {
    private runner: BacktestRunner;

    constructor() {
        this.runner = new BacktestRunner();
    }

    async runAll(symbol: string = config.STRATEGY_SYMBOL, interval: string = config.STRATEGY_INTERVAL, verbose: boolean = false) {
        const strategies = StrategyManager.getAvailableStrategies();
        const results: BacktestResult[] = [];

        console.log(`[Comparison Backtest] Running ${strategies.length} strategies on ${symbol} ${interval} with ${config.BACKTEST_CANDLE_COUNT} candles...`);

        for (const strategyName of strategies) {
            try {
                console.log(`\n--- Running ${strategyName} ---`);
                const result = await this.runner.run(strategyName, symbol, interval, verbose);
                results.push(result);
            } catch (error) {
                console.error(`Error running ${strategyName}:`, error);
            }
        }

        this.generateReport(results, symbol, interval);
        return results;
    }

    private generateReport(results: BacktestResult[], symbol: string, interval: string) {
        if (results.length === 0) {
            console.log('No results to compare.');
            return;
        }

        // Sort by pnlPercent descending
        const sortedResults = results.sort((a, b) => b.pnlPercent - a.pnlPercent);

        console.log('\n' + '='.repeat(80));
        console.log(`STRATEGY COMPARISON REPORT - ${symbol} ${interval}`);
        console.log('='.repeat(80));

        console.log('\nRANKED PERFORMANCE:');
        console.log('Rank | Strategy | Trades | Winrate | Profit Factor | PnL % | Buy&Hold Diff %');
        console.log('-'.repeat(85));

        sortedResults.forEach((result, index) => {
            const rank = (index + 1).toString().padStart(2, ' ');
            const strategy = result.strategyName.padEnd(8);
            const trades = result.tradesCount.toString().padStart(6);
            const winrate = `${result.winrate.toFixed(1)}%`.padStart(7);
            const pf = (result.profitFactor === Infinity ? '∞' : result.profitFactor.toFixed(2)).padStart(13);
            const pnl = `${result.pnlPercent.toFixed(2)}%`.padStart(6);
            const diff = `${(result.pnlPercent - result.buyHoldPercent).toFixed(2)}%`.padStart(15);

            console.log(`${rank} | ${strategy} | ${trades} | ${winrate} | ${pf} | ${pnl} | ${diff}`);
        });

        // Best performer
        const best = sortedResults[0];
        console.log(`\n🏆 BEST PERFORMING STRATEGY: ${best.strategyName}`);
        console.log(`   PnL: ${best.pnlPercent.toFixed(2)}% (${best.pnlUSDT.toFixed(2)} USDT)`);
        console.log(`   Winrate: ${best.winrate.toFixed(1)}%`);
        console.log(`   Profit Factor: ${best.profitFactor === Infinity ? '∞' : best.profitFactor.toFixed(2)}`);
        console.log(`   Trades: ${best.tradesCount}`);

        // Buy & Hold comparison
        const buyHoldAvg = results.reduce((sum, r) => sum + r.buyHoldPercent, 0) / results.length;
        console.log(`\n📊 BUY & HOLD AVERAGE: ${buyHoldAvg.toFixed(2)}%`);

        const beatingBuyHold = results.filter(r => r.pnlPercent > r.buyHoldPercent);
        console.log(`Strategies beating Buy&Hold: ${beatingBuyHold.length}/${results.length} (${((beatingBuyHold.length / results.length) * 100).toFixed(1)}%)`);

        // Statistics
        const avgPnL = results.reduce((sum, r) => sum + r.pnlPercent, 0) / results.length;
        const positiveStrategies = results.filter(r => r.pnlPercent > 0);
        const profitableRatio = (positiveStrategies.length / results.length) * 100;

        console.log(`\n📈 STATISTICS:`);
        console.log(`   Average PnL: ${avgPnL.toFixed(2)}%`);
        console.log(`   Profitable Strategies: ${positiveStrategies.length}/${results.length} (${profitableRatio.toFixed(1)}%)`);
        console.log(`   Best vs Worst Difference: ${(best.pnlPercent - sortedResults[sortedResults.length - 1].pnlPercent).toFixed(2)}%`);

        // Top 3
        console.log(`\n🥇 TOP 3 STRATEGIES:`);
        sortedResults.slice(0, 3).forEach((result, index) => {
            const medal = ['🥇', '🥈', '🥉'][index];
            console.log(`${medal} ${result.strategyName}: ${result.pnlPercent.toFixed(2)}% PnL, ${result.winrate.toFixed(1)}% Winrate`);
        });

        console.log('\n' + '='.repeat(80));
    }
}

// CLI runner
if (require.main === module) {
    const args = process.argv.slice(2);
    const symbol = args[0] || config.STRATEGY_SYMBOL;
    const interval = args[1] || config.STRATEGY_INTERVAL;
    const verbose = args[2] === 'verbose';

    const comparisonRunner = new ComparisonBacktestRunner();
    comparisonRunner.runAll(symbol, interval, verbose).catch(console.error);
}
