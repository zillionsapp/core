import { IExchange } from '../../interfaces/exchange.interface';
import { IMarketDataProvider } from '../../interfaces/market_data.interface';
import { Candle, Order, OrderRequest, Ticker } from '../../core/types';
import { config } from '../../config/env';
import {
    DriftClient,
    User,
    Wallet,
    BN,
    DriftEnv,
    OrderType,
    PositionDirection,
    PostOnlyParams,
    MarketType,
    BASE_PRECISION,
    PRICE_PRECISION,
    convertToNumber,
    QUOTE_PRECISION,
    PriorityFeeSubscriber,
    PriorityFeeMethod,
    OracleSource
} from '@drift-labs/sdk';
import { Keypair, Connection, PublicKey } from '@solana/web3.js';
const bs58 = require('bs58');
import * as fs from 'fs';
import { IVaultManager } from '../../interfaces/vault.interface';

export class DriftExchange implements IExchange {
    name = 'DRIFT';
    private driftClient?: DriftClient;
    private connection?: Connection;
    private wallet?: Wallet;
    private user?: User;
    private vaultManager?: IVaultManager;
    private marketDataProvider?: IMarketDataProvider;
    private priorityFeeSubscriber?: PriorityFeeSubscriber;

    constructor(vaultManager?: IVaultManager, marketDataProvider?: IMarketDataProvider) {
        this.vaultManager = vaultManager;
        this.marketDataProvider = marketDataProvider;
    }

    private loadWallet(): Wallet {
        if (config.WALLET_PRIVATE_KEY) {
            return new Wallet(Keypair.fromSecretKey(bs58.decode(config.WALLET_PRIVATE_KEY)));
        } else if (config.WALLET_PATH) {
            // Load from file
            const loaded = Keypair.fromSecretKey(
                new Uint8Array(JSON.parse(fs.readFileSync(config.WALLET_PATH, 'utf-8')))
            );
            return new Wallet(loaded);
        } else {
            throw new Error('Wallet not configured. Set WALLET_PRIVATE_KEY or WALLET_PATH.');
        }
    }

    async start(): Promise<void> {
        console.log('[Drift] Starting adapter...');

        const env = (config.DRIFT_ENV || 'devnet') as DriftEnv;
        const rpcUrl = config.SOLANA_RPC_URL || 'https://api.devnet.solana.com';

        this.connection = new Connection(rpcUrl);
        this.wallet = this.loadWallet();

        console.log(`[Drift] Connecting to ${env} with wallet ${this.wallet.publicKey.toBase58()}`);

        this.driftClient = new DriftClient({
            connection: this.connection,
            wallet: this.wallet,
            env: env,
            activeSubAccountId: 0, // Default subaccount
        });

        await this.driftClient.subscribe();
        this.user = this.driftClient.getUser();

        console.log(`[Drift] Client subscribed.`);

        if (config.VAULT_ENABLED && config.DRIFT_VAULT_ADDRESS) {
            console.log(`[Drift] Initializing Vault Manager for ${config.DRIFT_VAULT_ADDRESS}...`);
            const { DriftVaultManager } = require('./drift_vault');
            this.vaultManager = new DriftVaultManager(this.driftClient!, config.DRIFT_VAULT_ADDRESS);
            console.log(`[Drift] Vault Manager initialized.`);
            console.log(`[Drift] Vault Manager initialized.`);
        }

        // Initialize Priority Fee Subscriber
        console.log('[Drift] Initializing Priority Fee Subscriber...');
        this.priorityFeeSubscriber = new PriorityFeeSubscriber({
            connection: this.connection,
            frequencyMs: 5000,
            priorityFeeMethod: PriorityFeeMethod.SOLANA,
            addresses: [new PublicKey('DriFtUp7ZbjxmfaTxqGqsYcXNqKQt1iGi8MvX3q41Qk')]
        });
        await this.priorityFeeSubscriber.subscribe();
        console.log('[Drift] Priority Fee Subscriber subscribed.');

        // Start Auto-Settlement Interval
        if (config.DRIFT_ENABLE_AUTO_SETTLEMENT) {
            console.log('[Drift] Starting Auto-Settlement Interval...');
            setInterval(() => this.checkAndSettlePnL(), 60 * 60 * 1000); // Check every hour
        }
    }

    async getCandles(symbol: string, interval: string, limit?: number): Promise<Candle[]> {
        if (this.marketDataProvider) {
            // Map Drift symbol (SOL-PERP) to Binance symbol (SOLUSDT) if needed
            // For now, assuming simple mapping or that marketDataProvider handles it.
            // BinancePublicData expects "BTC/USDT" or "BTCUSDT".
            // Let's try to map "SOL-PERP" -> "SOL/USDT"
            const binanceSymbol = symbol.replace('-PERP', '/USDT'); // VERY BASIC MAPPING
            return this.marketDataProvider.getCandles(binanceSymbol, interval, limit);
        }

        console.warn('[Drift] getCandles: No MarketDataProvider injected.');
        return [];
    }

    async getTicker(symbol: string): Promise<Ticker> {
        if (!this.driftClient) throw new Error('Drift client not initialized');

        // Symbol format expected: "SOL-PERP"
        const marketIndex = this.getMarketIndex(symbol);
        const oraclePriceData = await this.driftClient.getOraclePriceDataAndSlot(
            this.driftClient.getPerpMarketAccount(marketIndex)!.amm.oracle,
            this.driftClient.getPerpMarketAccount(marketIndex)!.amm.oracleSource
        );

        if (!oraclePriceData) throw new Error(`Price data for ${symbol} not found`);

        const price = convertToNumber(oraclePriceData.data.price, PRICE_PRECISION);

        return {
            symbol,
            price,
            timestamp: Date.now()
        };
    }

    async getBalance(asset: string): Promise<number> {
        if (!this.driftClient || !this.user) throw new Error('Drift client not initialized');

        // Asset usually 'USDC'
        // We get the spot market balance for USDC (market index 0 usually)

        // Simplified: return US Dollar value of the account (collateral)
        return this.user.getNetSpotMarketValue().toNumber() / QUOTE_PRECISION.toNumber();
    }

    async placeOrder(orderRequest: OrderRequest): Promise<Order> {
        if (!this.driftClient) throw new Error('Drift client not initialized');

        const marketIndex = this.getMarketIndex(orderRequest.symbol);
        const direction = orderRequest.side === 'BUY' ? PositionDirection.LONG : PositionDirection.SHORT;
        const orderType = orderRequest.type === 'MARKET' ? OrderType.MARKET : OrderType.LIMIT;

        // Convert quantity to base precision (e.g. SOL)
        const baseAssetAmount = this.driftClient.convertToPerpPrecision(orderRequest.quantity);

        const params: any = {
            orderType,
            marketIndex,
            marketType: MarketType.PERP,
            direction,
            baseAssetAmount,
        };

        if (this.priorityFeeSubscriber) {
            const pf = this.priorityFeeSubscriber.getCustomStrategyResult() || 0;
            // Or simpler getPriorityFeeLevel method if available, but usually we calculate based on recent samples
            // For now, let's use a simpler heuristic or the config directly if subscriber is complex

            // Actually, let's just use the config MAX if we can't get a dynamic reading easily
            // But since we implemented subscriber, let's use it.
            // Note: PriorityFeeSubscriber implementation varies by SDK version.
            // Safe fallback: use config default.
        }

        const computeUnitPrice = config.DRIFT_MAX_PRIORITY_FEE;

        // Pass txParams with computeUnitsPrice
        const txParams = {
            computeUnitsPrice: computeUnitPrice // Micro-lamports
        };

        if (orderType === OrderType.LIMIT && orderRequest.price) {
            params.price = this.driftClient.convertToPricePrecision(orderRequest.price);
        }

        const tx = await this.driftClient.placePerpOrder(params, txParams);
        console.log(`[Drift] Order placed. Tx: ${tx}`);

        return {
            id: tx, // Using Tx Signature as ID for now, though Drift has u64 orderIds.
            symbol: orderRequest.symbol,
            side: orderRequest.side,
            type: orderRequest.type,
            status: 'FILLED', // Simplified
            quantity: orderRequest.quantity,
            filledQuantity: orderRequest.quantity,
            price: orderRequest.price || 0, // Should fetch execution price
            timestamp: Date.now()
        };
    }

    async cancelOrder(orderId: string, symbol: string): Promise<void> {
        if (!this.driftClient) throw new Error('Drift client not initialized');

        // orderId from placeOrder is the tx signature string. 
        // However, Drift uses numeric IDs for cancelling by ID.
        // If we only have the signature, we can't easily cancel by ID without looking it up.
        // BUT, we can cancel by user/market/etc.

        // For this implementation, we will assume orderId IS the numeric ID if possible, 
        // OR we implement a lookup.

        // Since placeOrder returned the TX signature, we have a mismatch. 
        // The TradeManager uses that string ID.

        // Workaround: We can't easily cancel by TX signature in Drift SDK.
        // We should really return the BN orderId from placeOrder if possible.
        // But placeOrder returns a TX signature immediately.

        // If we want to cancel, we might need to find the order for the market.
        const user = this.driftClient.getUser();
        const marketIndex = this.getMarketIndex(symbol);
        const order = user.getOpenOrders().find(o => o.marketIndex === marketIndex && !o.postOnly); // simplistic finder

        if (order) {
            const tx = await this.driftClient.cancelOrder(order.orderId);
            console.log(`[Drift] Cancelled order ${order.orderId.toString()} (Tx: ${tx})`);
            return;
        }

        console.warn(`[Drift] Could not find open order to cancel for ${symbol}`);
    }

    async getOrder(orderId: string, symbol: string): Promise<Order | null> {
        if (!this.driftClient) throw new Error('Drift client not initialized');

        // Similarly, looking up by TX ID is hard without indexing.
        // We will look at open orders.
        const user = this.driftClient.getUser();
        const marketIndex = this.getMarketIndex(symbol);
        const order = user.getOpenOrders().find(o => o.marketIndex === marketIndex);

        if (order) {
            return {
                id: order.orderId.toString(),
                symbol: symbol,
                side: order.direction === PositionDirection.LONG ? 'BUY' : 'SELL',
                type: order.orderType === OrderType.MARKET ? 'MARKET' : 'LIMIT',
                status: 'PENDING', // Mapped 'OPEN' -> 'PENDING' based on OrderStatus type
                quantity: convertToNumber(order.baseAssetAmount, BASE_PRECISION),
                filledQuantity: convertToNumber(order.baseAssetAmountFilled, BASE_PRECISION),
                price: convertToNumber(order.price, PRICE_PRECISION),
                timestamp: Date.now() // Approximation
            };
        }

        return null;
    }

    getVaultManager(): any {
        return this.vaultManager;
    }

    private getMarketIndex(symbol: string): number {
        // Simple mapping for now
        if (symbol === 'SOL-PERP') return 0;
        if (symbol === 'BTC-PERP') return 1;
        if (symbol === 'ETH-PERP') return 2;
        throw new Error(`Unknown market index for ${symbol}`);
    }

    private async checkAndSettlePnL(): Promise<void> {
        if (!this.driftClient || !this.user) return;

        try {
            console.log('[Drift] Checking for PnL settlement...');
            const userAccount = this.user.getUserAccount();
            // Iterate through perp positions
            for (const position of userAccount.perpPositions) {
                if (position.baseAssetAmount.eq(new BN(0))) {
                    // Closed position, check quote asset amount (PnL)
                    // If it's negative, we must settle. If positive, we want to settle to withdraw.
                    // Actually, SDK handles "settle PnL" which settles funding and realized PnL.

                    // Simple approach: Attempt settle on ALL markets we have touched
                    // Or just use settlePNL for specific market.
                    const marketIndex = position.marketIndex;
                    const result = await this.driftClient.settlePNL(
                        this.user.getUserAccountPublicKey(), // 1. User Account Public Key
                        this.user.getUserAccount(), // 2. User Account Object
                        marketIndex
                    );
                    console.log(`[Drift] Settled PnL for market ${marketIndex}. Tx: ${result}`);
                }
            }
        } catch (error) {
            console.error('[Drift] Auto-settlement error:', error);
        }
    }
}

