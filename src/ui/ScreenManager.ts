/**
 * ScreenManager — controls which full-screen overlay is visible.
 * Transitions between: LOADING → TITLE → FIGHT → PAUSE → VICTORY / DEFEAT
 */
import type { AudioManager } from '@core/AudioManager';

export type GameScreen = 'loading' | 'title' | 'fight' | 'pause' | 'victory' | 'defeat';

export class ScreenManager {
  private current: GameScreen = 'loading';
  private audio: AudioManager;

  constructor(audio: AudioManager) {
    this.audio = audio;
    this.setupTitleParticles();
  }

  show(screen: GameScreen): void {
    // Hide all
    ['title-screen','victory-screen','defeat-screen','pause-screen','loading-screen']
      .forEach(id => document.getElementById(id)?.classList.add('hidden'));
    document.getElementById('hud')?.classList.add('hidden');
    document.getElementById('mobile-controls')?.classList.add('hidden');

    this.current = screen;

    switch (screen) {
      case 'loading':
        document.getElementById('loading-screen')?.classList.remove('hidden');
        break;
      case 'title':
        document.getElementById('title-screen')?.classList.remove('hidden');
        break;
      case 'fight':
        document.getElementById('hud')?.classList.remove('hidden');
        if (this.isMobile()) document.getElementById('mobile-controls')?.classList.remove('hidden');
        // Request pointer lock for mouse look (PC only)
        if (!this.isMobile()) {
          document.getElementById('game-canvas')?.requestPointerLock?.();
        }
        break;
      case 'pause':
        document.getElementById('pause-screen')?.classList.remove('hidden');
        document.getElementById('hud')?.classList.remove('hidden');
        document.exitPointerLock?.();
        break;
      case 'victory':
        document.getElementById('victory-screen')?.classList.remove('hidden');
        document.exitPointerLock?.();
        break;
      case 'defeat':
        document.getElementById('defeat-screen')?.classList.remove('hidden');
        document.exitPointerLock?.();
        break;
    }
  }

  get active(): GameScreen { return this.current; }

  setLoadingProgress(fraction: number, text?: string): void {
    const bar = document.getElementById('loading-bar') as HTMLElement | null;
    const txt = document.getElementById('loading-text') as HTMLElement | null;
    if (bar) bar.style.width = `${Math.round(fraction * 100)}%`;
    if (txt && text) txt.textContent = text;
  }

  private isMobile(): boolean {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  }

  private setupTitleParticles(): void {
    const container = document.getElementById('title-particles');
    if (!container) return;
    // Create 30 CSS floating particles (no Three.js needed in title)
    for (let i = 0; i < 30; i++) {
      const p = document.createElement('div');
      p.style.cssText = `
        position:absolute;
        width:${2 + Math.random() * 4}px;
        height:${2 + Math.random() * 4}px;
        background:rgba(212,160,23,${0.2 + Math.random() * 0.5});
        border-radius:50%;
        left:${Math.random() * 100}%;
        top:${Math.random() * 100}%;
        animation: float-particle ${4 + Math.random() * 6}s ease-in-out ${Math.random() * 4}s infinite alternate;
        pointer-events:none;
      `;
      container.appendChild(p);
    }

    // Inject keyframes if not already in CSS
    if (!document.getElementById('particle-keyframes')) {
      const style = document.createElement('style');
      style.id = 'particle-keyframes';
      style.textContent = `
        @keyframes float-particle {
          from { transform: translateY(0) rotate(0deg); opacity: 0.3; }
          to   { transform: translateY(-60px) rotate(180deg); opacity: 0.8; }
        }
      `;
      document.head.appendChild(style);
    }
  }
}
