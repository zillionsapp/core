
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { DriftClient, Wallet, BN, DriftEnv, QUOTE_PRECISION } from '@drift-labs/sdk';
import { VaultClient, IDL } from '@drift-labs/vaults-sdk';
import { Program, AnchorProvider } from '@coral-xyz/anchor';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';
import bs58 from 'bs58';

// Load env from root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const PRIVATE_KEY = process.env.WALLET_PRIVATE_KEY;
const WALLET_PATH = process.env.WALLET_PATH;
const ENV = (process.env.DRIFT_ENV || 'devnet') as DriftEnv;

async function requestAirdrop(connection: Connection, publicKey: PublicKey) {
    console.log('Requesting airdrop for', publicKey.toBase58());
    try {
        const sig = await connection.requestAirdrop(publicKey, 1000000000); // 1 SOL
        await connection.confirmTransaction(sig);
        console.log('Airdrop successful');
    } catch (e) {
        console.log('Airdrop failed (might be rate limited or mainnet):', e);
    }
}

async function main() {
    console.log('Initializing Vault Deployment...');

    // Load Wallet
    let keypair: Keypair;
    if (PRIVATE_KEY) {
        keypair = Keypair.fromSecretKey(bs58.decode(PRIVATE_KEY));
    } else if (WALLET_PATH) {
        const fullPath = path.resolve(process.cwd(), WALLET_PATH);
        keypair = Keypair.fromSecretKey(
            new Uint8Array(JSON.parse(fs.readFileSync(fullPath, 'utf-8')))
        );
    } else {
        throw new Error('Wallet not configured');
    }

    const connection = new Connection(RPC_URL, 'confirmed');
    const wallet = new Wallet(keypair);

    console.log(`Using wallet: ${wallet.publicKey.toBase58()}`);
    if (ENV === 'devnet') {
        await requestAirdrop(connection, wallet.publicKey);
    }

    // Initialize Drift Client
    const driftClient = new DriftClient({
        connection,
        wallet,
        env: ENV,
    });
    await driftClient.subscribe();

    // Initialize Vault Client
    const provider = new AnchorProvider(connection, wallet, {});
    const programId = new PublicKey('vAuLTsyrvSjzZ2dnLXRNxUkyQQGKxnN6bXadUACqWxl');
    const program = new Program(IDL, programId, provider);

    const vaultClient = new VaultClient({
        driftClient,
        program: program as any
    });

    // Vault Params
    const vaultName = `Zillion Vault ${Math.floor(Math.random() * 1000)}`;
    const spotMarketIndex = 0; // USDC
    const redeemPeriod = new BN(0); // Instant redemption for testing? Or 3600*24
    const maxTokens = new BN(1_000_000).mul(QUOTE_PRECISION); // 1M USDC cap
    const managementFee = new BN(0); // 0%
    const profitShare = 200000; // 20% (PRECISION 1e6)
    const hurdleRate = new BN(0);
    const permissioned = false;
    const minDepositAmount = new BN(10).mul(QUOTE_PRECISION); // 10 USDC

    console.log(`Deploying Vault: "${vaultName}"...`);

    try {
        const vaultPublicKey = await vaultClient.initializeVault({
            name: Buffer.from(vaultName).toJSON().data,
            spotMarketIndex,
            redeemPeriod,
            maxTokens,
            managementFee,
            profitShare,
            hurdleRate,
            permissioned,
            minDepositAmount
        });

        console.log('------------------------------------------------');
        console.log('VAULT DEPLOYED SUCCESSFULLY!');
        console.log(`Vault Address: ${vaultPublicKey.toBase58()}`);
        console.log('------------------------------------------------');
        console.log('Please add this address to your .env file as DRIFT_VAULT_ADDRESS');

    } catch (e) {
        console.error('Failed to deploy vault:', e);
    } finally {
        await driftClient.unsubscribe();
    }
}

main().catch(console.error);
