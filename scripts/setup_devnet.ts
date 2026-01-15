import { Connection, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
const bs58 = require('bs58');

// Load env
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const PRIVATE_KEY = process.env.WALLET_PRIVATE_KEY;
const WALLET_PATH = process.env.WALLET_PATH;

async function main() {
    console.log('--- Devnet Wallet Setup ---');

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
        console.error('Error: Wallet not configured in .env (WALLET_PRIVATE_KEY or WALLET_PATH)');
        process.exit(1);
    }

    const connection = new Connection(RPC_URL, 'confirmed');
    console.log(`Wallet Address: ${keypair.publicKey.toBase58()}`);
    console.log(`RPC Connected: ${RPC_URL}`);

    const balance = await connection.getBalance(keypair.publicKey);
    console.log(`Current Balance: ${balance / LAMPORTS_PER_SOL} SOL`);

    if (RPC_URL.includes('devnet')) {
        console.log('Requesting 1 SOL Airdrop...');
        try {
            const sig = await connection.requestAirdrop(keypair.publicKey, 1 * LAMPORTS_PER_SOL);
            await connection.confirmTransaction(sig);
            console.log('Airdrop Successful! 🎉');

            const newBalance = await connection.getBalance(keypair.publicKey);
            console.log(`New Balance: ${newBalance / LAMPORTS_PER_SOL} SOL`);

            console.log('\nNOTE: For trading on Drift Devnet, you also need USDC.');
            console.log('      Go to https://app.drift.trade/ (Devnet) and use their Faucet to mint USDC.');
        } catch (e: any) {
            console.error('Airdrop failed:', e.message);
            console.log('Note: Devnet faucets are rate-limited. Try https://faucet.solana.com/ if this fails.');
        }
    } else {
        console.log('Skipping airdrop (Not connected to Devnet).');
    }
}

main().catch(console.error);
