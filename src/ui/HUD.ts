/**
 * HUD — DOM-based overlay updated imperatively each frame.
 * No framework; direct style mutations for 60-fps performance.
 */
import type { Wukong } from '@entities/Wukong';
import type { Buddha } from '@entities/Buddha';
import type { EventBus } from '@core/EventBus';

export class HUD {
  private hpBar!: HTMLElement;
  private staminaBar!: HTMLElement;
  private focusBar!: HTMLElement;
  private bossHpBar!: HTMLElement;
  private bossHpGhost!: HTMLElement;
  private phaseBadge!: HTMLElement;
  private cloneCooldown!: HTMLElement;
  private comboCounter!: HTMLElement;
  private comboNumber!: HTMLElement;
  private comboHideTimer = 0;
  private ghostHp = 1;
  private ghostTimer = 0;

  constructor(bus: EventBus) {
    this.hpBar        = document.getElementById('hp-bar')!;
    this.staminaBar   = document.getElementById('stamina-bar')!;
    this.focusBar     = document.getElementById('focus-bar')!;
    this.bossHpBar    = document.getElementById('boss-hp-bar')!;
    this.bossHpGhost  = document.getElementById('boss-hp-ghost')!;
    this.phaseBadge   = document.getElementById('phase-badge')!;
    this.cloneCooldown= document.getElementById('clone-cooldown')!;
    this.comboCounter = document.getElementById('combo-counter')!;
    this.comboNumber  = document.getElementById('combo-number')!;

    bus.on('combo:count', (data: unknown) => {
      const { count } = data as { count: number };
      this.showCombo(count);
    });
    bus.on('combo:reset', () => { this.comboHideTimer = 0; });
    bus.on('boss:phase_change', (data: unknown) => {
      const { phase } = data as { phase: 1 | 2 | 3 };
      this.phaseBadge.textContent = ['I','II','III'][phase - 1] ?? 'I';
    });
  }

  show(): void {
    document.getElementById('hud')?.classList.remove('hidden');
  }

  hide(): void {
    document.getElementById('hud')?.classList.add('hidden');
  }

  update(dt: number, wukong: Wukong, buddha: Buddha): void {
    // Player bars
    this.hpBar.style.width      = `${wukong.hpFraction * 100}%`;
    this.staminaBar.style.width = `${wukong.staminaFraction * 100}%`;
    this.focusBar.style.width   = `${wukong.focusFraction * 100}%`;

    // Boss HP (with ghost trail)
    const bossFrac = buddha.hpFraction;
    this.bossHpBar.style.width = `${bossFrac * 100}%`;

    if (bossFrac < this.ghostHp - 0.001) {
      this.ghostTimer = 0.6;
    }
    if (this.ghostTimer > 0) {
      this.ghostTimer -= dt;
      this.bossHpGhost.style.width = `${this.ghostHp * 100}%`;
    } else {
      this.ghostHp = Math.max(bossFrac, this.ghostHp - dt * 0.4);
      this.bossHpGhost.style.width = `${this.ghostHp * 100}%`;
    }

    // Clone cooldown overlay (scaleY trick)
    const cloneFrac = wukong.cloneCooldownFraction;
    (this.cloneCooldown as HTMLElement).style.transform = `scaleY(${cloneFrac})`;

    // Combo hide
    if (this.comboHideTimer > 0) {
      this.comboHideTimer -= dt;
      if (this.comboHideTimer <= 0) this.comboCounter.classList.add('hidden');
    }
  }

  private showCombo(count: number): void {
    this.comboNumber.textContent = String(count);
    this.comboCounter.classList.remove('hidden');
    // Re-trigger pop animation
    this.comboNumber.style.animation = 'none';
    void this.comboNumber.offsetWidth; // reflow
    this.comboNumber.style.animation = '';
    this.comboHideTimer = 2.5;
  }

  /** Update 2-D lock-on reticle position from 3-D world space. */
  updateLockOn(visible: boolean, screenX: number, screenY: number): void {
    const el = document.getElementById('lock-on-reticle')!;
    if (!visible) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    el.style.left = `${screenX}px`;
    el.style.top  = `${screenY}px`;
  }
}
