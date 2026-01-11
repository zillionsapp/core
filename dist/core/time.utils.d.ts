export declare class TimeUtils {
    /**
     * Parses interval strings (e.g. '1m', '1h') to milliseconds
     */
    static parseIntervalToMs(interval: string): number;
    /**
     * Calculates sleep duration until the next candle plus a buffer
     */
    static getSleepDuration(interval: string, bufferMs?: number): number;
}
