/**
 * AudioManager — Web Audio API with master / music / sfx gain buses.
 * Mobile requires user gesture before AudioContext can start.
 */
export class AudioManager {
  private ctx: AudioContext | null = null;
  private masterGain!: GainNode;
  private musicGain!: GainNode;
  private sfxGain!: GainNode;
  private bufferCache = new Map<string, AudioBuffer>();
  private musicSource: AudioBufferSourceNode | null = null;
  private unlocked = false;

  private _musicVol = 0.7;
  private _sfxVol   = 0.9;

  /** Call on first user gesture to unlock AudioContext on mobile. */
  unlock(): void {
    if (this.unlocked) return;
    this.ctx = new AudioContext();
    this.masterGain = this.ctx.createGain();
    this.musicGain  = this.ctx.createGain();
    this.sfxGain    = this.ctx.createGain();

    this.musicGain.connect(this.masterGain);
    this.sfxGain.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);

    this.musicGain.gain.value = this._musicVol;
    this.sfxGain.gain.value   = this._sfxVol;

    this.unlocked = true;
  }

  set musicVolume(v: number) {
    this._musicVol = v;
    if (this.musicGain) this.musicGain.gain.setTargetAtTime(v, this.ctx!.currentTime, 0.05);
  }

  set sfxVolume(v: number) {
    this._sfxVol = v;
    if (this.sfxGain) this.sfxGain.gain.setTargetAtTime(v, this.ctx!.currentTime, 0.05);
  }

  async loadBuffer(url: string): Promise<AudioBuffer | null> {
    if (!this.ctx) return null;
    if (this.bufferCache.has(url)) return this.bufferCache.get(url)!;
    try {
      const res = await fetch(url);
      const data = await res.arrayBuffer();
      const buf = await this.ctx.decodeAudioData(data);
      this.bufferCache.set(url, buf);
      return buf;
    } catch {
      console.warn(`[AudioManager] Could not load: ${url}`);
      return null;
    }
  }

  playMusic(buffer: AudioBuffer | null, loop = true): void {
    if (!this.ctx || !buffer) return;
    this.stopMusic();
    this.musicSource = this.ctx.createBufferSource();
    this.musicSource.buffer = buffer;
    this.musicSource.loop = loop;
    this.musicSource.connect(this.musicGain);
    this.musicSource.start(0);
  }

  stopMusic(fadeOutSec = 0.5): void {
    if (!this.musicSource || !this.ctx) return;
    const src = this.musicSource;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(this._musicVol, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + fadeOutSec);
    src.connect(gain);
    src.stop(this.ctx.currentTime + fadeOutSec);
    this.musicSource = null;
  }

  playSFX(buffer: AudioBuffer | null, volume = 1): void {
    if (!this.ctx || !buffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    src.connect(gain);
    gain.connect(this.sfxGain);
    src.start(0);
  }
}
