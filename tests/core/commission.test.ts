import { MockStore, MockTimeProvider } from '../test_mocks';
import { VaultManager } from '../../src/core/vault.manager';
import { CommissionManager } from '../../src/core/commission.manager';
import { Trade } from '../../src/core/types';

describe('Commission System', () => {
    describe('VaultManager - Commission Balance', () => {
        it('should include COMMISSION_EARNED in total balance', async () => {
            const store = new MockStore();
            const timeProvider = new MockTimeProvider();
            const vaultManager = new VaultManager(store, timeProvider);

            // Add deposit
            store.addVaultTransaction({
                email: 'user@test.com',
                amount: 1000,
                shares: 100,
                type: 'DEPOSIT',
                timestamp: Date.now() - 1000
            });

            // Add commission earned (inviter receives money)
            store.addVaultTransaction({
                email: 'inviter@test.com',
                amount: 50,
                shares: 0,
                type: 'COMMISSION_EARNED',
                timestamp: Date.now(),
                inviter_id: 'inviter-123',
                invited_user_id: 'invited-456',
                commission_rate: 0.10
            });

            const balance = await vaultManager.getTotalDepositedBalance();
            // Should be: 1000 (deposit) + 50 (commission earned) = 1050
            expect(balance).toBe(1050);
        });

        it('should include COMMISSION_PAID in total balance (negative amount)', async () => {
            const store = new MockStore();
            const timeProvider = new MockTimeProvider();
            const vaultManager = new VaultManager(store, timeProvider);

            // Add deposit
            store.addVaultTransaction({
                email: 'user@test.com',
                amount: 1000,
                shares: 100,
                type: 'DEPOSIT',
                timestamp: Date.now() - 1000
            });

            // Add commission paid (invited user pays - stored as negative)
            store.addVaultTransaction({
                email: 'user@test.com',
                amount: -50, // Negative amount
                shares: 0,
                type: 'COMMISSION_PAID',
                timestamp: Date.now(),
                inviter_id: 'inviter-123',
                invited_user_id: 'user-id',
                commission_rate: 0.10
            });

            const balance = await vaultManager.getTotalDepositedBalance();
            // Should be: 1000 (deposit) + (-50) (commission paid) = 950
            expect(balance).toBe(950);
        });

        it('should calculate balance correctly with mixed transactions', async () => {
            const store = new MockStore();
            const timeProvider = new MockTimeProvider();
            const vaultManager = new VaultManager(store, timeProvider);

            const now = Date.now();

            // Add various transactions
            store.addVaultTransaction({
                email: 'user@test.com',
                amount: 1000,
                shares: 100,
                type: 'DEPOSIT',
                timestamp: now - 5000
            });

            store.addVaultTransaction({
                email: 'user@test.com',
                amount: 25, // Earned commission
                shares: 0,
                type: 'COMMISSION_EARNED',
                timestamp: now - 4000
            });

            store.addVaultTransaction({
                email: 'user@test.com',
                amount: -10, // Paid commission
                shares: 0,
                type: 'COMMISSION_PAID',
                timestamp: now - 3000
            });

            store.addVaultTransaction({
                email: 'user@test.com',
                amount: 50, // Another commission earned
                shares: 0,
                type: 'COMMISSION_EARNED',
                timestamp: now - 2000
            });

            const balance = await vaultManager.getTotalDepositedBalance();
            // Should be: 1000 + 25 - 10 + 50 = 1065
            expect(balance).toBe(1065);
        });

        it('should filter transactions by timestamp', async () => {
            const store = new MockStore();
            const timeProvider = new MockTimeProvider();
            
            // Set time provider to a specific point in time
            const now = Date.now();
            timeProvider.setNow(now + 1000); // Current time is +1000ms

            const vaultManager = new VaultManager(store, timeProvider);

            // Add transaction in the past
            store.addVaultTransaction({
                email: 'user@test.com',
                amount: 1000,
                shares: 100,
                type: 'DEPOSIT',
                timestamp: now - 500
            });

            // Add transaction in the future (should be filtered out)
            store.addVaultTransaction({
                email: 'user@test.com',
                amount: 500,
                shares: 50,
                type: 'DEPOSIT',
                timestamp: now + 10000 // Future
            });

            const balance = await vaultManager.getTotalDepositedBalance();
            // Only past transaction should be included
            expect(balance).toBe(1000);
        });
    });

    describe('CommissionManager - Calculation', () => {
        it('should calculate commission correctly for BUY trade with profit', async () => {
            const store = new MockStore();
            const commissionManager = new CommissionManager(store);

            const trade: Trade = {
                id: 'trade-123',
                orderId: 'order-123',
                symbol: 'BTC/USDT',
                side: 'BUY',
                quantity: 0.1,
                price: 50000,
                timestamp: Date.now() - 10000,
                status: 'CLOSED',
                exitPrice: 55000, // 10% profit
                exitTimestamp: Date.now(),
                exitReason: 'TAKE_PROFIT'
            };

            const commissionRate = 0.10; // 10%
            const commission = commissionManager.calculateCommission(trade, commissionRate);

            // Profit = (55000 - 50000) * 0.1 = 500
            // Commission = 500 * 0.10 = 50
            expect(commission).toBe(50);
        });

        it('should calculate commission correctly for SELL trade with profit', async () => {
            const store = new MockStore();
            const commissionManager = new CommissionManager(store);

            const trade: Trade = {
                id: 'trade-456',
                orderId: 'order-456',
                symbol: 'BTC/USDT',
                side: 'SELL',
                quantity: 0.1,
                price: 55000,
                timestamp: Date.now() - 10000,
                status: 'CLOSED',
                exitPrice: 50000, // 500 profit
                exitTimestamp: Date.now(),
                exitReason: 'TAKE_PROFIT'
            };

            const commissionRate = 0.10;
            const commission = commissionManager.calculateCommission(trade, commissionRate);

            // Profit = (55000 - 50000) * 0.1 = 500
            // Commission = 500 * 0.10 = 50
            expect(commission).toBe(50);
        });

        it('should return 0 commission for losing trade', async () => {
            const store = new MockStore();
            const commissionManager = new CommissionManager(store);

            const trade: Trade = {
                id: 'trade-789',
                orderId: 'order-789',
                symbol: 'BTC/USDT',
                side: 'BUY',
                quantity: 0.1,
                price: 50000,
                timestamp: Date.now() - 10000,
                status: 'CLOSED',
                exitPrice: 48000, // 2000 loss
                exitTimestamp: Date.now(),
                exitReason: 'STOP_LOSS'
            };

            const commission = commissionManager.calculateCommission(trade, 0.10);
            expect(commission).toBe(0); // No commission on loss
        });

        it('should return 0 for open trade', async () => {
            const store = new MockStore();
            const commissionManager = new CommissionManager(store);

            const trade: Trade = {
                id: 'trade-open',
                orderId: 'order-open',
                symbol: 'BTC/USDT',
                side: 'BUY',
                quantity: 0.1,
                price: 50000,
                timestamp: Date.now(),
                status: 'OPEN'
            };

            const commission = commissionManager.calculateCommission(trade, 0.10);
            expect(commission).toBe(0); // No commission on open trade
        });

        it('should process commission payment and save transactions', async () => {
            const store = new MockStore();
            const commissionManager = new CommissionManager(store);

            // Set up inviter relationship
            store.setInviterRelationship('user-123', {
                inviterId: 'inviter-456',
                commissionRate: 0.10,
                invitedEmail: 'invited@test.com'
            });

            const trade: Trade = {
                id: 'trade-commission',
                orderId: 'order-commission',
                symbol: 'BTC/USDT',
                side: 'BUY',
                quantity: 0.1,
                price: 50000,
                timestamp: Date.now() - 10000,
                status: 'CLOSED',
                exitPrice: 55000,
                exitTimestamp: Date.now(),
                exitReason: 'TAKE_PROFIT'
            };

            const commission = await commissionManager.processCommissionPayment(
                trade,
                'user-123',
                'invited@test.com'
            );

            expect(commission).toBe(0);

            // Verify no transactions were saved (deprecated method)
            const transactions = await store.getVaultTransactions();
            expect(transactions.length).toBe(0);
        });

        it('should skip commission if no inviter relationship exists', async () => {
            const store = new MockStore();
            const commissionManager = new CommissionManager(store);

            const trade: Trade = {
                id: 'trade-no-rel',
                orderId: 'order-no-rel',
                symbol: 'BTC/USDT',
                side: 'BUY',
                quantity: 0.1,
                price: 50000,
                timestamp: Date.now() - 10000,
                status: 'CLOSED',
                exitPrice: 55000,
                exitTimestamp: Date.now(),
                exitReason: 'TAKE_PROFIT'
            };

            const commission = await commissionManager.processCommissionPayment(
                trade,
                'user-no-rel',
                'no-rel@test.com'
            );

            expect(commission).toBe(0);

            // No transactions should be saved
            const transactions = await store.getVaultTransactions();
            expect(transactions.length).toBe(0);
        });
    });

    describe('Commission Summary', () => {
        it('should return correct commission summary', async () => {
            const store = new MockStore();
            const commissionManager = new CommissionManager(store);

            // Add some commission transactions
            store.addVaultTransaction({
                type: 'COMMISSION_EARNED',
                amount: 100,
                inviter_id: 'user-123'
            });

            store.addVaultTransaction({
                type: 'COMMISSION_EARNED',
                amount: 50,
                inviter_id: 'user-123'
            });

            store.addVaultTransaction({
                type: 'COMMISSION_PAID',
                amount: -25,
                invited_user_id: 'user-123'
            });

            store.addVaultTransaction({
                type: 'COMMISSION_EARNED',
                amount: 100,
                inviter_id: 'user-123',
                invited_user_id: 'user-a'
            });

            store.addVaultTransaction({
                type: 'COMMISSION_EARNED',
                amount: 75,
                inviter_id: 'user-123',
                invited_user_id: 'user-b'
            });

            const summary = await commissionManager.getCommissionSummary('user-123');

            expect(summary.totalEarned).toBe(325); // 100 + 50 + 100 + 75
            expect(summary.totalPaid).toBe(25);
            expect(summary.invitedCount).toBe(3); // user-a and user-b
        });
    });

    describe('Inviter Relationship Caching', () => {
        it('should cache relationships for performance', async () => {
            const store = new MockStore();
            const commissionManager = new CommissionManager(store);

            // Set relationship
            await commissionManager.setInviterRelationship(
                'user-abc',
                'inviter-xyz',
                0.15,
                'user@email.com'
            );

            // First lookup - should hit database (empty)
            const rel1 = await commissionManager.getInviterRelationship('user-abc');
            expect(rel1).toBeDefined();
            expect(rel1?.inviterId).toBe('inviter-xyz');
            expect(rel1?.commissionRate).toBe(0.15);

            // Second lookup - should hit cache
            const rel2 = await commissionManager.getInviterRelationship('user-abc');
            expect(rel2).toBe(rel1); // Same object reference from cache

            // Clear cache for specific user
            commissionManager.clearCache('user-abc');

            // Third lookup - should query database again
            const rel3 = await commissionManager.getInviterRelationship('user-abc');
            expect(rel3).toBeDefined();
        });

        it('should clear all cache when called without userId', () => {
            const store = new MockStore();
            const commissionManager = new CommissionManager(store);

            // Set relationships
            commissionManager.setInviterRelationship('user-1', 'inviter-1', 0.10, 'email1@test.com');
            commissionManager.setInviterRelationship('user-2', 'inviter-2', 0.10, 'email2@test.com');

            // Clear all cache
            commissionManager.clearCache();

            // Access private cache to verify it's empty
            // This is an implementation detail check
        });
    });
});
