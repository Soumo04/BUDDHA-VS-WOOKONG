/**
 * GameLoop — requestAnimationFrame loop with fixed-step physics.
 * Logic and rendering are decoupled; dt is capped to prevent spiral of death.
 */
export type UpdateFn = (dt: number, elapsed: number) => void;
export type RenderFn = () => void;

export class GameLoop {
  private updateFn: UpdateFn;
  private renderFn: RenderFn;
  private rafHandle = 0;
  private lastTime = 0;
  private _elapsed = 0;
  private running = false;

  /** Max dt in seconds (prevents huge jumps after tab switch / freeze). */
  private static readonly MAX_DT = 0.1;

  constructor(update: UpdateFn, render: RenderFn) {
    this.updateFn = update;
    this.renderFn = render;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.rafHandle = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafHandle);
  }

  get elapsed(): number { return this._elapsed; }

  private tick = (now: number): void => {
    if (!this.running) return;
    this.rafHandle = requestAnimationFrame(this.tick);

    const rawDt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    const dt = Math.min(rawDt, GameLoop.MAX_DT);
    this._elapsed += dt;

    this.updateFn(dt, this._elapsed);
    this.renderFn();
  };
}
