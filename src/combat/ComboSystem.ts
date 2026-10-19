/**
 * ComboSystem — manages the 3-hit staff combo chain.
 * Call tryHit() on attack input. Returns the current hit data or null.
 * Integrates with Wukong's state machine.
 */

export interface ComboHitDef {
  id: string;
  damage: number;
  focusGain: number;
  hitstopMs: number;
  comboWindow: number; // seconds before chain resets
  range: number;
}

export interface ComboResult {
  hitIndex: number;      // 0,1,2
  hitDef: ComboHitDef;
  isFinisher: boolean;   // true on hit index 2
}

export class ComboSystem {
  private hits: ComboHitDef[];
  private index = 0;
  private windowTimer = 0;   // counts down — reset resets combo
  private attackTimer = 0;   // counts how long we're in an attack state
  private readonly ATTACK_DURATION = 0.35; // s — how long an attack state lasts

  private _isAttacking = false;
  private _hitstopTimer = 0;

  constructor(hits: ComboHitDef[]) {
    this.hits = hits;
  }

  /** Call each frame with dt. */
  update(dt: number): void {
    if (this._hitstopTimer > 0) {
      this._hitstopTimer -= dt * 1000; // hitstop in ms
      return; // freeze combo during hitstop
    }

    if (this._isAttacking) {
      this.attackTimer += dt;
      if (this.attackTimer >= this.ATTACK_DURATION) {
        this._isAttacking = false;
        this.attackTimer = 0;
      }
    }

    if (this.windowTimer > 0) {
      this.windowTimer -= dt;
      if (this.windowTimer <= 0) {
        this.index = 0; // window expired — reset
      }
    }
  }

  /**
   * Attempt to trigger the next hit in the chain.
   * Returns ComboResult if hit fires, null if currently attacking.
   */
  tryHit(): ComboResult | null {
    if (this._isAttacking) return null; // still in attack state

    const hitDef = this.hits[this.index];
    if (!hitDef) return null;

    const result: ComboResult = {
      hitIndex: this.index,
      hitDef,
      isFinisher: this.index === this.hits.length - 1,
    };

    // Apply hitstop
    this._hitstopTimer = hitDef.hitstopMs;
    this._isAttacking  = true;
    this.attackTimer   = 0;

    // Set window for next hit
    this.windowTimer = hitDef.comboWindow > 0 ? hitDef.comboWindow : 0;

    // Advance or reset
    this.index = result.isFinisher ? 0 : this.index + 1;

    return result;
  }

  get isAttacking(): boolean { return this._isAttacking; }
  get comboIndex():  number  { return this.index; }
  get windowActive(): boolean { return this.windowTimer > 0; }

  /** Force reset (e.g., on damage or dodge). */
  reset(): void {
    this.index = 0;
    this.windowTimer = 0;
    this._isAttacking = false;
    this.attackTimer = 0;
  }
}
