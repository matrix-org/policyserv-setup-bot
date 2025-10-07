interface LimitDetails {
    count: number;
    lastReset: Date;
}

export class RateLimit {
    private store = new Map<string, LimitDetails>();

    constructor(public readonly windowMs: number, public readonly max: number) {
        // Set a cleanup timer to remove expired entries (and save a bit of memory)
        setInterval(() => {
            const toDelete: string[] = [];
            for (const [key, details] of this.store) {
                if (this.isExpired(details)) {
                    toDelete.push(key); // queue the delete so we don't mutate what we're iterating over
                }
            }
            for (const key of toDelete) {
                this.store.delete(key);
            }
        }, this.windowMs * 2);
    }

    private isExpired(details: LimitDetails): boolean {
        return (details.lastReset.getTime() + this.windowMs) <= Date.now();
    }

    public isLimited(key: string): boolean {
        if (!this.store.has(key)) {
            this.store.set(key, {
                count: 0,
                lastReset: new Date(Date.now()),
            });
            return false; // the first request is always free
        }
        const details = this.store.get(key)!;
        console.log(`Checking rate limit for ${key}: ${details.count}/${this.max} (last reset ${details.lastReset.toISOString()})`);
        if (this.isExpired(details)) { // reset the count if the window has passed
            console.log(`Resetting rate limit for ${key}`);
            details.count = -1; // we're about to +1 this, and the first request is free
            details.lastReset = new Date(Date.now());
        }
        details.count++; // always increment the count, so we can check how egregious it is later
        return details.count >= this.max;
    }

    public isEgregiousLimit(key: string): boolean {
        const details = this.store.get(key);
        if (!details || this.isExpired(details)) {
            return false; // they aren't limited, so can't be egregious about it
        }

        // We consider 5 over the limit to be egregious. 5 is somewhat arbitrary, but we want to avoid
        // spamming the user with "you are rate limited" messages.
        return details.count >= (this.max + 5);
    }
}
