/**
 * ObjectPool<T> — generic typed pool to avoid per-frame allocations.
 * Usage: pool.acquire() to get an object, pool.release(obj) to return it.
 */
export class ObjectPool<T> {
  private pool: T[] = [];
  private factory: () => T;
  private onAcquire?: (obj: T) => void;
  private onRelease?: (obj: T) => void;

  constructor(
    factory: () => T,
    options?: { prewarm?: number; onAcquire?: (obj: T) => void; onRelease?: (obj: T) => void }
  ) {
    this.factory = factory;
    this.onAcquire = options?.onAcquire;
    this.onRelease = options?.onRelease;
    if (options?.prewarm) this.prewarm(options.prewarm);
  }

  prewarm(count: number): void {
    for (let i = 0; i < count; i++) this.pool.push(this.factory());
  }

  acquire(): T {
    const obj = this.pool.length > 0 ? this.pool.pop()! : this.factory();
    this.onAcquire?.(obj);
    return obj;
  }

  release(obj: T): void {
    this.onRelease?.(obj);
    this.pool.push(obj);
  }

  get available(): number { return this.pool.length; }
}
