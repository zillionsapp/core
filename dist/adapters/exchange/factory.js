"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExchangeFactory = void 0;
const paper_1 = require("./paper");
const binance_public_1 = require("../data/binance_public");
const hyperliquid_1 = require("./hyperliquid");
const drift_1 = require("./drift");
const ccxt_1 = require("./ccxt");
const okx_1 = require("./okx");
const env_1 = require("../../config/env");
class ExchangeFactory {
    static getExchange(db) {
        switch (env_1.config.EXCHANGE_DRIVER) {
            case 'PAPER':
                // Shared Data Provider
                const publicData = new binance_public_1.BinancePublicData();
                return new paper_1.PaperExchange(publicData, undefined, undefined, db);
            case 'HYPERLIQUID':
                return new hyperliquid_1.HyperliquidExchange();
            case 'DRIFT':
                return new drift_1.DriftExchange();
            case 'CCXT':
                return new ccxt_1.CCXTExchange();
            case 'OKX':
                return new okx_1.OKXExchange();
            case 'BINANCE':
                throw new Error('Binance driver not implemented yet');
            default:
                throw new Error(`Unsupported exchange driver: ${env_1.config.EXCHANGE_DRIVER}`);
        }
    }
}
exports.ExchangeFactory = ExchangeFactory;
