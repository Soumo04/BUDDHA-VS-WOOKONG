// State Machine — M2 implementation placeholder
export type StateId = string;

export interface State {
  id: StateId;
  onEnter?: () => void;
  onExit?:  () => void;
  update:   (dt: number) => StateId | null; // return next state id or null to stay
}

export class StateMachine {
  private states = new Map<StateId, State>();
  private current: State | null = null;

  addState(state: State): this {
    this.states.set(state.id, state);
    return this;
  }

  start(id: StateId): void {
    const s = this.states.get(id);
    if (!s) throw new Error(`StateMachine: unknown state "${id}"`);
    this.current = s;
    s.onEnter?.();
  }

  update(dt: number): void {
    if (!this.current) return;
    const next = this.current.update(dt);
    if (next && next !== this.current.id) this.transition(next);
  }

  private transition(id: StateId): void {
    this.current?.onExit?.();
    const s = this.states.get(id);
    if (!s) { console.warn(`StateMachine: unknown transition target "${id}"`); return; }
    this.current = s;
    s.onEnter?.();
  }

  get activeId(): StateId | null { return this.current?.id ?? null; }
}
