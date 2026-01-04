import { IExchange } from '../../interfaces/exchange.interface';
import { PaperExchange } from './paper';
import { BinancePublicData } from '../data/binance_public';
import { HyperliquidExchange } from './hyperliquid';
import { DriftExchange } from './drift';
import { CCXTExchange } from './ccxt';
import { OKXExchange } from './okx';
import { config } from '../../config/env';

import { IVaultManager } from '../../interfaces/vault.interface';

export class ExchangeFactory {
    static getExchange(db?: any): IExchange {
        switch (config.EXCHANGE_DRIVER) {
            case 'PAPER':
                // Shared Data Provider
                const publicData = new BinancePublicData();
                return new PaperExchange(publicData, undefined, undefined, db);
            case 'HYPERLIQUID':
                return new HyperliquidExchange();
            case 'DRIFT':
                return new DriftExchange();
            case 'CCXT':
                return new CCXTExchange();
            case 'OKX':
                return new OKXExchange();
            case 'BINANCE':
                throw new Error('Binance driver not implemented yet');
            default:
                throw new Error(`Unsupported exchange driver: ${config.EXCHANGE_DRIVER}`);
        }
    }
}
