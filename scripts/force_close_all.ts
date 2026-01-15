import { ExchangeFactory } from '../src/adapters/exchange/factory';
import { SupabaseDataStore } from '../src/adapters/database/supabase';
import { TradeManager } from '../src/core/trade.manager';
import { CommissionManager } from '../src/core/commission.manager';
import { logger } from '../src/core/logger';
import { config } from '../src/config/env';

/**
 * Force Close All Open Trades Script
 *
 * This script will force close all currently open trades in the system.
 * Use with caution as this will immediately close all positions at market price.
 *
 * Usage: npm run force-close-all
 */

async function forceCloseAllTrades() {
    logger.info('[ForceCloseAll] =========================================');
    logger.info('[ForceCloseAll] Starting force close of all open trades');
    logger.info('[ForceCloseAll] =========================================');

    try {
        // Initialize components
        const db = new SupabaseDataStore();
        const exchange = ExchangeFactory.getExchange(db);
        const tradeManager = new TradeManager(exchange, db);
        const commissionManager = new CommissionManager(db);

        // Connect CommissionManager to TradeManager
        tradeManager.setCommissionManager(commissionManager);

        // Get Vault Manager from exchange if available
        if (exchange.getVaultManager) {
            const vaultManager = exchange.getVaultManager();
            if (vaultManager) {
                commissionManager.setVaultManager(vaultManager);
            }
        }

        // Start exchange connection
        await exchange.start();

        // Get all open trades
        const openTrades = await db.getOpenTrades();

        if (openTrades.length === 0) {
            logger.info('[ForceCloseAll] No open trades found. Nothing to close.');
            return;
        }

        logger.info(`[ForceCloseAll] Found ${openTrades.length} open trade(s) to close:`);
        openTrades.forEach(trade => {
            logger.info(`[ForceCloseAll] - ${trade.id}: ${trade.side} ${trade.quantity} ${trade.symbol} at ${trade.price}`);
        });

        // Force close each trade
        let closedCount = 0;
        let errorCount = 0;

        for (const trade of openTrades) {
            try {
                logger.info(`[ForceCloseAll] Force closing trade ${trade.id} (${trade.symbol})...`);
                await tradeManager.forceClosePosition(trade, 'FORCE_CLOSE_ALL');
                logger.info(`[ForceCloseAll] ✓ Successfully closed trade ${trade.id}`);
                closedCount++;
            } catch (error) {
                logger.error(`[ForceCloseAll] ✗ Failed to close trade ${trade.id}:`, error);
                errorCount++;
            }
        }

        logger.info('[ForceCloseAll] =========================================');
        logger.info(`[ForceCloseAll] Force close operation completed:`);
        logger.info(`[ForceCloseAll] - Successfully closed: ${closedCount}`);
        logger.info(`[ForceCloseAll] - Failed to close: ${errorCount}`);
        logger.info('[ForceCloseAll] =========================================');

        if (errorCount > 0) {
            logger.warn('[ForceCloseAll] Some trades failed to close. Check logs above for details.');
            process.exit(1);
        }

    } catch (error) {
        logger.error('[ForceCloseAll] Fatal error during force close operation:', error);
        process.exit(1);
    }
}

// Run the script
forceCloseAllTrades().catch(err => {
    logger.error('[ForceCloseAll] Unhandled error:', err);
    process.exit(1);
});
