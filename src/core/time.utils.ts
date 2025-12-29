export class TimeUtils {
    /**
     * Parses interval strings (e.g. '1m', '1h') to milliseconds
     */
    static parseIntervalToMs(interval: string): number {
        const unit = interval.slice(-1);
        const value = parseInt(interval.slice(0, -1));

        switch (unit) {
            case 'm': return value * 60 * 1000;
            case 'h': return value * 60 * 60 * 1000;
            case 'd': return value * 24 * 60 * 60 * 1000;
            case 'w': return value * 7 * 24 * 60 * 60 * 1000;
            case 'M': return value * 30 * 24 * 60 * 60 * 1000; // Rough month
            default:
                throw new Error(`Unsupported interval unit: ${unit}`);
        }
    }

    /**
     * Calculates sleep duration until the next candle plus a buffer
     */
    static getSleepDuration(interval: string, bufferMs: number = 2000): number {
        const intervalMs = this.parseIntervalToMs(interval);
        const now = Date.now();
        const timeSinceLastBoundary = now % intervalMs;
        const timeUntilNextBoundary = intervalMs - timeSinceLastBoundary;

        // Add buffer to ensure exchange has settled the candle
        return timeUntilNextBoundary + bufferMs;
    }
}
