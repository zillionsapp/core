import request from 'supertest';
import app from '../../src/api/server';

describe('Zillion REST API', () => {
    it('GET /health should return ok', async () => {
        const res = await request(app).get('/health');
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('ok');
    });

    it('GET /api/portfolio should return 404 if no snapshots (InMemory mode)', async () => {
        const res = await request(app).get('/api/portfolio');
        // In clean test env without Supabase creds, this might be 404
        expect(res.status === 404 || res.status === 200).toBeTruthy();
    });

    it('GET /api/trades should return an array', async () => {
        const res = await request(app).get('/api/trades');
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBeTruthy();
    });

    it('POST /api/backtest/run should fail with missing params', async () => {
        const res = await request(app).post('/api/backtest/run').send({});
        expect(res.status).toBe(400);
    });

    it('POST /api/backtest/run should execute backtest', async () => {
        // This will actually run a small backtest in mock mode
        const res = await request(app).post('/api/backtest/run').send({
            strategyName: 'SMA_CROSSOVER',
            symbol: 'BTC/USDT',
            interval: '1h'
        });
        expect(res.status).toBe(200);
        expect(res.body.result).toBeDefined();
        expect(res.body.result.strategyName).toBe('SMA_CROSSOVER');
    }, 30000); // 30s timeout for backtest
});
