/**
 * Small time-limited cache of promises. Failed loads aren't kept. Keys must include whose request it is
 * (e.g. "alice:1234"): each person reads with their own API key, so a cached answer must never cross people.
 */
export class TtlCache<V> {
  private readonly entries = new Map<string, { at: number; value: Promise<V> }>();
  private readonly max: number;
  private readonly ttlMs: number;

  constructor(max: number, ttlMs: number) {
    this.max = max;
    this.ttlMs = ttlMs;
  }

  get(key: string, load: () => Promise<V>): Promise<V> {
    const now = Date.now();
    const hit = this.entries.get(key);
    if (hit && now - hit.at < this.ttlMs) return hit.value;
    const value = load().catch((err: unknown) => {
      if (this.entries.get(key)?.value === value) this.entries.delete(key);
      throw err;
    });
    this.entries.delete(key);
    this.entries.set(key, { at: now, value });
    while (this.entries.size > this.max) this.entries.delete(this.entries.keys().next().value!);
    return value;
  }
}
