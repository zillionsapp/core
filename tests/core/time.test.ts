import { TimeUtils } from '../../src/core/time.utils';

describe('TimeUtils', () => {
    it('should correctly parse intervals to ms', () => {
        expect(TimeUtils.parseIntervalToMs('1m')).toBe(60 * 1000);
        expect(TimeUtils.parseIntervalToMs('5m')).toBe(5 * 60 * 1000);
        expect(TimeUtils.parseIntervalToMs('1h')).toBe(60 * 60 * 1000);
        expect(TimeUtils.parseIntervalToMs('1d')).toBe(24 * 60 * 60 * 1000);
    });

    it('should calculate sleep duration to the next boundary (mocking time)', () => {
        const interval = '1m'; // 60,000ms
        const intervalMs = 60000;

        // Mock Date.now to 45,000 (15s before boundary)
        jest.spyOn(Date, 'now').mockReturnValue(45000);

        const buffer = 2000;
        const expectedSleep = 15000 + buffer; // 15s until 60s boundary + 2s buffer

        expect(TimeUtils.getSleepDuration(interval, buffer)).toBe(expectedSleep);

        jest.restoreAllMocks();
    });

    it('should throw error for unsupported units', () => {
        expect(() => TimeUtils.parseIntervalToMs('1s')).toThrow();
    });
});
