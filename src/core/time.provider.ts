export interface ITimeProvider {
    now(): number;
    getUTCDate(): number;
}

export class RealTimeProvider implements ITimeProvider {
    now(): number {
        return Date.now();
    }

    getUTCDate(): number {
        return new Date().getUTCDate();
    }
}
