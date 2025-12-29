import { IExchange } from '../../interfaces/exchange.interface';
import { PaperExchange } from './paper';
import { HyperliquidExchange } from './hyperliquid';
import { DriftExchange } from './drift';
import { CCXTExchange } from './ccxt';
import { OKXExchange } from './okx';
import { config } from '../../config/env';

export class ExchangeFactory {
    static getExchange(): IExchange {
        switch (config.EXCHANGE_DRIVER) {
            case 'PAPER':
                return new PaperExchange();
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
