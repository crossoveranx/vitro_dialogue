// converts an assistant-provided duration (like { amount: 5, unit: 'min' }) to ms
export class DurationConverter {
    convert(duration: { amount: number, unit: string }): number {
        switch (duration.unit) {
            case 's': return duration.amount * 1000;
            case 'min': return duration.amount * 60 * 1000;
            default: throw new Error(`Couldn't convert duration {${duration.amount}, ${duration.unit}} to milliseconds.`);
        }
    }
}