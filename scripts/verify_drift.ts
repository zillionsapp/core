
import { ExchangeFactory } from '../src/adapters/factory';
import { config } from '../src/config/env';
import { DriftExchange } from '../src/adapters/exchange/drift';
import { BinancePublicData } from '../src/adapters/data/binance_public';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load env
dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function verify() {
    console.log('--- Verifying Drift Adapter ---');
    console.log(`Environment: ${config.DRIFT_ENV}`);
    console.log(`Vault Enabled: ${config.VAULT_ENABLED}`);

    // Force Drift driver for this test
    const originalDriver = config.EXCHANGE_DRIVER;
    // We can't easily overwrite config as it is frozen/parsed, but we can directly instantiate DriftExchange

    console.log('Instantiating DriftExchange with Binance Public Data...');
    const marketData = new BinancePublicData();
    const exchange = new DriftExchange(undefined, marketData);

    try {
        await exchange.start();
        console.log('DriftExchange started successfully.');

        console.log('Fetching Candles (SOL-PERP -> SOL/USDT)...');
        const candles = await exchange.getCandles('SOL-PERP', '1h', 5);
        console.log(`Fetched ${candles.length} candles.`);
        if (candles.length > 0) {
            console.log(`Last Candle: ${JSON.stringify(candles[candles.length - 1])}`);
        } else {
            console.warn('No candles returned!');
        }

        console.log('Fetching Account Value...');
        const balance = await exchange.getBalance('USDC');
        console.log(`Account Value: $${balance.toFixed(2)}`);

        console.log('Fetching SOL-PERP Ticker...');
        const ticker = await exchange.getTicker('SOL-PERP');
        console.log(`SOL-PERP Price: $${ticker.price}`);

        if (process.env.TEST_ORDER === 'true') {
            console.log('Placing Test LIMIT Order...');
            const order = await exchange.placeOrder({
                symbol: 'SOL-PERP',
                side: 'BUY',
                type: 'LIMIT',
                quantity: 0.1,
                price: ticker.price * 0.9 // Buy 10% below market
            });
            console.log('Order placed:', order);

            // Cancel it? 
            // exchange.cancelOrder(...) not fully implemented yet
        }

        const vaultMgr = exchange.getVaultManager();
        if (vaultMgr) {
            console.log('Vault Manager is active.');
            const sharePrice = await vaultMgr.getSharePrice();
            console.log(`Vault Share Price: ${sharePrice}`);
            const totalAssets = await vaultMgr.getTotalAssets();
            console.log(`Vault Total Assets: ${totalAssets}`);
        } else {
            console.log('Vault Manager is NOT active.');
        }

    } catch (e) {
        console.error('Verification failed:', e);
    }
}

verify().catch(console.error);
