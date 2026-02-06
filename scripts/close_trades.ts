import { TradeManager } from '../src/core/trade.manager';
import { SupabaseDataStore } from '../src/adapters/database/supabase';
import { ExchangeFactory } from '../src/adapters/exchange/factory';
import { logger } from '../src/core/logger';
import dotenv from 'dotenv';
import { config } from '../src/config/env';

dotenv.config();

/**
 * Script to close all open trades across all symbols.
 * Useful for emergency stops or resetting the bot state.
 */
async function closeAllTrades() {
    console.log('--- Close All Open Trades Script ---');
    console.log('Exchange Driver:', config.EXCHANGE_DRIVER);

    const db = new SupabaseDataStore();

    // Check if we have database connection
    if (!config.SUPABASE_URL || !config.SUPABASE_KEY) {
        console.warn('Warning: SUPABASE_URL or SUPABASE_KEY not set. Operating on in-memory data only.');
    }

    const exchange = ExchangeFactory.getExchange(db);
    await exchange.start();
    const tradeManager = new TradeManager(exchange, db);

    console.log('Fetching open trades...');
    const openTrades = await db.getOpenTrades();

    if (openTrades.length === 0) {
        console.log('No open trades found to close.');
        process.exit(0);
    }

    console.log(`Found ${openTrades.length} open trades. Closing them now...`);

    let successCount = 0;
    let failCount = 0;

    for (const trade of openTrades) {
        try {
            console.log(`Closing trade ${trade.id} for ${trade.symbol} (${trade.side} ${trade.quantity})...`);
            await tradeManager.forceClosePosition(trade, 'MANUAL_CLOSE_ALL_SCRIPT');
            console.log(`✓ successfully closed trade ${trade.id}`);
            successCount++;
        } catch (error) {
            console.error(`✗ Failed to close trade ${trade.id}:`, error);
            failCount++;
        }
    }

    console.log('-----------------------------------');
    console.log(`Execution completed.`);
    console.log(`Total trades found: ${openTrades.length}`);
    console.log(`Successfully closed: ${successCount}`);
    console.log(`Failed to close: ${failCount}`);
    console.log('-----------------------------------');

    process.exit(0);
}

closeAllTrades().catch(err => {
    console.error('Script failed with fatal error:', err);
    process.exit(1);
});
