/**
 * InputManager — unified action map for keyboard, gamepad, and touch.
 * All game code reads from action states; never from raw key codes.
 */

export type ActionName =
  | 'MOVE_FORWARD' | 'MOVE_BACKWARD' | 'MOVE_LEFT' | 'MOVE_RIGHT'
  | 'ATTACK' | 'HEAVY' | 'DODGE' | 'CLONE' | 'LOCK_ON' | 'PAUSE';

export interface MoveVector { x: number; y: number; } // normalized [-1,1]

export class InputManager {
  private pressed = new Set<ActionName>();
  private justPressed = new Set<ActionName>();
  private justReleased = new Set<ActionName>();
  private prevPressed = new Set<ActionName>();

  // Raw move axes (merged from keys + stick + joystick)
  private _moveX = 0;
  private _moveY = 0;

  // Touch joystick state
  private touchJoystickActive = false;
  private touchJoystickDelta = { x: 0, y: 0 };
  private touchStartId: number | null = null;
  private touchStartPos = { x: 0, y: 0 };
  private readonly JOYSTICK_RADIUS = 50;

  // Mouse look delta (for camera)
  private _mouseDeltaX = 0;
  private _mouseDeltaY = 0;
  private _pointerLocked = false;

  constructor() {
    this.bindKeyboard();
    this.bindGamepad();
    this.bindPointerLock();
  }

  /* ------------------------------------------------------------------ */
  /* Public API                                                           */
  /* ------------------------------------------------------------------ */

  /** Call once per frame BEFORE reading any state. */
  poll(): void {
    this.justPressed.clear();
    this.justReleased.clear();

    // Detect just-pressed / just-released from prev frame
    this.pressed.forEach(a => { if (!this.prevPressed.has(a)) this.justPressed.add(a); });
    this.prevPressed.forEach(a => { if (!this.pressed.has(a)) this.justReleased.add(a); });
    this.prevPressed = new Set(this.pressed);

    this.pollGamepad();
    this.buildMoveVector();

    // Reset mouse delta after reading
    this._mouseDeltaX = 0;
    this._mouseDeltaY = 0;
  }

  isDown(action: ActionName): boolean { return this.pressed.has(action); }
  isJustPressed(action: ActionName): boolean { return this.justPressed.has(action); }
  isJustReleased(action: ActionName): boolean { return this.justReleased.has(action); }

  get moveVector(): MoveVector {
    const len = Math.sqrt(this._moveX * this._moveX + this._moveY * this._moveY);
    if (len < 0.01) return { x: 0, y: 0 };
    return { x: this._moveX / len, y: this._moveY / len };
  }

  get moveRaw(): MoveVector { return { x: this._moveX, y: this._moveY }; }

  get mouseDelta(): { x: number; y: number } {
    return { x: this._mouseDeltaX, y: this._mouseDeltaY };
  }

  get pointerLocked(): boolean { return this._pointerLocked; }

  /** Register mobile action buttons (called by MobileControls after DOM ready). */
  registerMobileButton(element: HTMLElement, action: ActionName): void {
    element.addEventListener('pointerdown', () => this.press(action), { passive: true });
    element.addEventListener('pointerup',   () => this.release(action), { passive: true });
    element.addEventListener('pointerleave',() => this.release(action), { passive: true });
  }

  /** Register mobile joystick zone. */
  registerJoystickZone(zone: HTMLElement): void {
    zone.addEventListener('pointerdown', this.onJoystickStart, { passive: true });
    zone.addEventListener('pointermove',  this.onJoystickMove,  { passive: true });
    zone.addEventListener('pointerup',    this.onJoystickEnd,   { passive: true });
    zone.addEventListener('pointerleave', this.onJoystickEnd,   { passive: true });
  }

  /* ------------------------------------------------------------------ */
  /* Private — Keyboard                                                   */
  /* ------------------------------------------------------------------ */

  private readonly KEY_MAP: Record<string, ActionName> = {
    'KeyW': 'MOVE_FORWARD', 'ArrowUp':    'MOVE_FORWARD',
    'KeyS': 'MOVE_BACKWARD','ArrowDown':  'MOVE_BACKWARD',
    'KeyA': 'MOVE_LEFT',    'ArrowLeft':  'MOVE_LEFT',
    'KeyD': 'MOVE_RIGHT',   'ArrowRight': 'MOVE_RIGHT',
    'Space':  'DODGE',
    'KeyQ':   'CLONE',
    'Tab':    'LOCK_ON',
    'Escape': 'PAUSE',
  };

  private bindKeyboard(): void {
    window.addEventListener('keydown', e => {
      if (e.code === 'Tab') e.preventDefault();
      const action = this.KEY_MAP[e.code];
      if (action) this.press(action);
    });
    window.addEventListener('keyup', e => {
      const action = this.KEY_MAP[e.code];
      if (action) this.release(action);
    });
    window.addEventListener('mousedown', e => {
      if (e.button === 0) this.press('ATTACK');
      if (e.button === 2) this.press('HEAVY');
    });
    window.addEventListener('mouseup', e => {
      if (e.button === 0) this.release('ATTACK');
      if (e.button === 2) this.release('HEAVY');
    });
    window.addEventListener('contextmenu', e => e.preventDefault());
  }

  /* ------------------------------------------------------------------ */
  /* Private — Gamepad                                                    */
  /* ------------------------------------------------------------------ */

  private gamepadAxes = { x: 0, y: 0 };

  private bindGamepad(): void {
    // Gamepad is polled each frame via pollGamepad()
  }

  private pollGamepad(): void {
    const gamepads = navigator.getGamepads();
    const gp = gamepads[0];
    if (!gp) return;

    // Left stick → move
    this.gamepadAxes.x = Math.abs(gp.axes[0]) > 0.15 ? gp.axes[0] : 0;
    this.gamepadAxes.y = Math.abs(gp.axes[1]) > 0.15 ? gp.axes[1] : 0;

    // Right stick → camera (merged with mouse delta)
    const rsX = Math.abs(gp.axes[2]) > 0.15 ? gp.axes[2] : 0;
    const rsY = Math.abs(gp.axes[3]) > 0.15 ? gp.axes[3] : 0;
    this._mouseDeltaX += rsX * 3;
    this._mouseDeltaY += rsY * 3;

    // Buttons
    const setBtn = (idx: number, action: ActionName) => {
      if (gp.buttons[idx]?.pressed) this.press(action);
      else this.release(action);
    };
    setBtn(0,  'ATTACK');  // A / Cross
    setBtn(2,  'HEAVY');   // X / Square
    setBtn(1,  'DODGE');   // B / Circle
    setBtn(4,  'CLONE');   // LB / L1
    setBtn(10, 'LOCK_ON'); // R3
    setBtn(9,  'PAUSE');   // Start / Menu
  }

  /* ------------------------------------------------------------------ */
  /* Private — Pointer Lock (mouse look)                                  */
  /* ------------------------------------------------------------------ */

  private bindPointerLock(): void {
    document.addEventListener('pointerlockchange', () => {
      this._pointerLocked = document.pointerLockElement !== null;
    });
    document.addEventListener('mousemove', e => {
      if (this._pointerLocked) {
        this._mouseDeltaX += e.movementX;
        this._mouseDeltaY += e.movementY;
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* Private — Touch joystick                                             */
  /* ------------------------------------------------------------------ */

  private onJoystickStart = (e: PointerEvent): void => {
    if (this.touchStartId !== null) return;
    this.touchStartId = e.pointerId;
    this.touchStartPos = { x: e.clientX, y: e.clientY };
    this.touchJoystickActive = true;
  };

  private onJoystickMove = (e: PointerEvent): void => {
    if (e.pointerId !== this.touchStartId) return;
    const dx = e.clientX - this.touchStartPos.x;
    const dy = e.clientY - this.touchStartPos.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const clamped = Math.min(len, this.JOYSTICK_RADIUS);
    const scale = clamped / this.JOYSTICK_RADIUS;
    this.touchJoystickDelta = {
      x: (len > 0 ? dx / len : 0) * scale,
      y: (len > 0 ? dy / len : 0) * scale,
    };

    // Update knob visual
    const knob = document.getElementById('joystick-knob');
    if (knob) {
      const clampedX = (len > 0 ? dx / len : 0) * clamped;
      const clampedY = (len > 0 ? dy / len : 0) * clamped;
      knob.style.transform = `translate(${clampedX}px, ${clampedY}px)`;
    }
  };

  private onJoystickEnd = (e: PointerEvent): void => {
    if (e.pointerId !== this.touchStartId) return;
    this.touchStartId = null;
    this.touchJoystickActive = false;
    this.touchJoystickDelta = { x: 0, y: 0 };
    const knob = document.getElementById('joystick-knob');
    if (knob) knob.style.transform = '';
  };

  /* ------------------------------------------------------------------ */
  /* Private — helpers                                                    */
  /* ------------------------------------------------------------------ */

  private press(action: ActionName): void { this.pressed.add(action); }
  private release(action: ActionName): void { this.pressed.delete(action); }

  private buildMoveVector(): void {
    // Keys
    let x = 0, y = 0;
    if (this.isDown('MOVE_LEFT'))     x -= 1;
    if (this.isDown('MOVE_RIGHT'))    x += 1;
    if (this.isDown('MOVE_FORWARD'))  y += 1;
    if (this.isDown('MOVE_BACKWARD')) y -= 1;

    // Gamepad stick (overrides keys if significant)
    if (Math.abs(this.gamepadAxes.x) + Math.abs(this.gamepadAxes.y) > 0.05) {
      x = this.gamepadAxes.x;
      y = -this.gamepadAxes.y; // gamepad Y is inverted
    }

    // Touch joystick (overrides if active)
    if (this.touchJoystickActive) {
      x = this.touchJoystickDelta.x;
      y = -this.touchJoystickDelta.y;
    }

    this._moveX = x;
    this._moveY = y;
  }
}
