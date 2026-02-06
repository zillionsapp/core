import { SupabaseDataStore } from '../src/adapters/database/supabase';
import { ExchangeFactory } from '../src/adapters/exchange/factory';
import { RiskManager } from '../src/core/risk.manager';
import { PortfolioManager } from '../src/core/portfolio.manager';
import { Trade, OrderRequest } from '../src/core/types';
import { config } from '../src/config/env';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Script to manually open a position with professional risk management.
 * 
 * Usage:
 * npm run open:trade -- --side=BUY --symbol=BTC/USDT [--sl=2] [--tp=4]
 */
async function manualTrade() {
    const args = process.argv.slice(2);
    const params: any = {};
    args.forEach(arg => {
        if (arg.startsWith('--')) {
            const [key, value] = arg.slice(2).split('=');
            params[key] = value;
        }
    });

    const symbol = params.symbol || config.STRATEGY_SYMBOL;
    const side = params.side?.toUpperCase();
    const sl = params.sl ? parseFloat(params.sl) : undefined;
    const tp = params.tp ? parseFloat(params.tp) : undefined;

    if (!side || (side !== 'BUY' && side !== 'SELL')) {
        console.error('Usage: npm run open:trade -- --side=BUY|SELL [--symbol=SYMBOL] [--sl=PERCENT] [--tp=PERCENT]');
        console.error('Example: npm run open:trade -- --side=BUY --symbol=BTC/USDT --sl=1 --tp=3');
        process.exit(1);
    }

    console.log(`--- Manual Trade Script ---`);
    console.log(`Symbol: ${symbol}`);
    console.log(`Side: ${side}`);
    if (sl) console.log(`Custom SL: ${sl}%`);
    if (tp) console.log(`Custom TP: ${tp}%`);

    const db = new SupabaseDataStore();
    const exchange = ExchangeFactory.getExchange(db);

    // Initialize exchange (syncs positions safely)
    await exchange.start();

    const riskManager = new RiskManager(exchange, db);
    const portfolioManager = new PortfolioManager(exchange, db);

    // 1. Get current market data
    const ticker = await exchange.getTicker(symbol);
    const currentPrice = ticker.price;
    const currentEquity = await portfolioManager.getCurrentEquity();

    console.log(`Current Price: ${currentPrice}`);
    console.log(`Current Equity: ${currentEquity.toFixed(2)} ${config.PAPER_BALANCE_ASSET}`);

    // 2. Calculate professional quantity based on risk settings from ENV
    // This respects RISK_PER_TRADE_PERCENT, MAX_POSITION_SIZE_PERCENT, etc.
    const quantity = await riskManager.calculateQuantity(symbol, currentPrice, sl, currentEquity);

    if (quantity <= 0) {
        console.error('Risk management rejected the trade or quantity calculated as 0.');
        process.exit(1);
    }

    const orderRequest: OrderRequest = {
        symbol,
        side: side as 'BUY' | 'SELL',
        type: 'MARKET',
        quantity
    };

    // 3. Final risk validation
    const isSafe = await riskManager.validateOrder(orderRequest, currentEquity);
    if (!isSafe) {
        console.error('Final risk validation failed (leveraged risk limits reached).');
        process.exit(1);
    }

    // 4. Execution
    console.log(`Executing ${side} order for ${quantity.toFixed(6)} ${symbol}...`);
    const order = await exchange.placeOrder(orderRequest);

    // 5. Persistence & SL/TP calculation
    const exitPrices = riskManager.calculateExitPrices(order.price, order.quantity, order.side, sl, tp);
    const leverage = config.LEVERAGE_ENABLED ? config.LEVERAGE_VALUE : 1;
    const margin = (order.price * order.quantity) / leverage;

    const trade: Trade = {
        id: order.id,
        orderId: order.id,
        symbol: order.symbol,
        side: order.side,
        quantity: order.quantity,
        price: order.price,
        timestamp: order.timestamp,
        status: 'OPEN',
        stopLossPrice: exitPrices.stopLoss,
        takeProfitPrice: exitPrices.takeProfit,
        strategyName: 'MANUAL',
        leverage,
        margin,
        trailingStopEnabled: config.TRAILING_STOP_ENABLED,
        trailingStopActivated: false,
        trailingStopActivationPercent: config.TRAILING_STOP_ACTIVATION_PERCENT,
        trailingStopTrailPercent: config.TRAILING_STOP_TRAIL_PERCENT,
        trailingStopHighPrice: order.side === 'BUY' ? order.price : undefined,
        trailingStopLowPrice: order.side === 'SELL' ? order.price : undefined
    };

    await db.saveTrade(trade);
    await portfolioManager.saveSnapshot();

    console.log('-----------------------------------');
    console.log(`✓ Trade successfully opened: ${trade.id}`);
    console.log(`Executed Price: ${trade.price}`);
    console.log(`Quantity: ${trade.quantity}`);
    console.log(`Stop Loss: ${exitPrices.stopLoss.toFixed(2)}`);
    console.log(`Take Profit: ${exitPrices.takeProfit.toFixed(2)}`);
    console.log('-----------------------------------');

    process.exit(0);
}

manualTrade().catch(error => {
    console.error('Script failed:', error);
    process.exit(1);
});
