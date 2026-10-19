/**
 * EventBus — tiny typed event emitter for cross-system communication.
 * No global state: pass an instance around via dependency injection.
 */
type Handler<T = unknown> = (data: T) => void;

export class EventBus {
  private listeners = new Map<string, Handler[]>();

  on<T>(event: string, handler: Handler<T>): void {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event)!.push(handler as Handler);
  }

  off<T>(event: string, handler: Handler<T>): void {
    const list = this.listeners.get(event);
    if (!list) return;
    const idx = list.indexOf(handler as Handler);
    if (idx !== -1) list.splice(idx, 1);
  }

  emit<T>(event: string, data?: T): void {
    this.listeners.get(event)?.forEach(h => h(data as unknown));
  }

  once<T>(event: string, handler: Handler<T>): void {
    const wrapper: Handler<T> = (data) => {
      handler(data);
      this.off(event, wrapper);
    };
    this.on(event, wrapper);
  }
}

/** Typed event catalogue — add entries as new events are introduced. */
export type GameEvents = {
  'game:start': void;
  'game:pause': void;
  'game:resume': void;
  'game:victory': void;
  'game:defeat': void;
  'player:hit': { damage: number; position: { x: number; y: number; z: number } };
  'player:died': void;
  'boss:hit': { damage: number; position: { x: number; y: number; z: number } };
  'boss:phase_change': { phase: 1 | 2 | 3 };
  'boss:died': void;
  'combo:count': { count: number };
  'combo:reset': void;
};
