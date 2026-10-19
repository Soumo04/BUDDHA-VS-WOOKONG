/**
 * DamageNumbers — pooled DOM-based floating damage text.
 * Uses a fixed pool of <div> elements to avoid per-hit allocations.
 */

interface DamageLabel {
  el: HTMLDivElement;
  active: boolean;
  timer: number;
  maxLife: number;
  screenX: number;
  screenY: number;
  velY: number;
}

export class DamageNumbers {
  private pool: DamageLabel[] = [];
  private container: HTMLDivElement;
  private readonly POOL_SIZE = 20;
  private readonly LIFE = 1.2; // seconds

  constructor() {
    // Dedicated container sits over canvas, pointer-events:none
    this.container = document.createElement('div');
    this.container.style.cssText = `
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 15;
      overflow: hidden;
    `;
    document.getElementById('app')?.appendChild(this.container);

    // Pre-create pool elements
    for (let i = 0; i < this.POOL_SIZE; i++) {
      const el = document.createElement('div');
      el.style.cssText = `
        position: absolute;
        font-family: 'Cinzel', serif;
        font-weight: 700;
        pointer-events: none;
        user-select: none;
        display: none;
        text-shadow: 0 1px 4px rgba(0,0,0,0.8), 0 0 12px currentColor;
        will-change: transform, opacity;
        white-space: nowrap;
      `;
      this.container.appendChild(el);
      this.pool.push({
        el,
        active: false,
        timer: 0,
        maxLife: this.LIFE,
        screenX: 0,
        screenY: 0,
        velY: 0,
      });
    }
  }

  /**
   * Spawn a floating damage number at screen coordinates.
   * @param screenX   Pixel X from left
   * @param screenY   Pixel Y from top
   * @param value     Damage value to display
   * @param type      'player'=red, 'boss'=gold, 'crit'=white/large
   */
  spawn(screenX: number, screenY: number, value: number, type: 'player' | 'boss' | 'crit' = 'boss'): void {
    const label = this.pool.find(l => !l.active);
    if (!label) return;

    const isCrit = type === 'crit' || value >= 30;
    const color = type === 'player' ? '#ff4444'
                : isCrit           ? '#ffffff'
                :                    '#ffd60a';
    const size  = isCrit ? '28px' : value >= 20 ? '22px' : '16px';

    label.active   = true;
    label.timer    = 0;
    label.maxLife  = this.LIFE;
    label.screenX  = screenX + (Math.random() - 0.5) * 40;
    label.screenY  = screenY - 20;
    label.velY     = -(60 + Math.random() * 40); // px/s upward

    label.el.textContent = isCrit ? `✦${value}` : String(value);
    label.el.style.color = color;
    label.el.style.fontSize = size;
    label.el.style.left = `${label.screenX}px`;
    label.el.style.top  = `${label.screenY}px`;
    label.el.style.opacity = '1';
    label.el.style.display = 'block';
    label.el.style.transform = isCrit ? 'scale(1.3)' : 'scale(1)';
  }

  update(dt: number): void {
    for (const label of this.pool) {
      if (!label.active) continue;

      label.timer += dt;
      const t = label.timer / label.maxLife; // 0→1

      label.screenY += label.velY * dt;
      label.velY    *= (1 - 5 * dt); // decelerate

      const opacity = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
      label.el.style.top     = `${label.screenY}px`;
      label.el.style.opacity = String(Math.max(0, opacity));

      if (label.timer >= label.maxLife) {
        label.active = false;
        label.el.style.display = 'none';
      }
    }
  }
}
