export class HistoryManager<T> {
  private past: T[] = [];
  private future: T[] = [];
  private limit: number;

  constructor(limit = 40) {
    this.limit = limit;
  }

  push(snapshot: T) {
    this.past.push(snapshot);
    if (this.past.length > this.limit) this.past.shift();
    this.future = [];
  }

  undo(current: T): T | null {
    if (!this.past.length) return null;
    const prev = this.past.pop()!;
    this.future.push(current);
    return prev;
  }

  redo(current: T): T | null {
    if (!this.future.length) return null;
    const next = this.future.pop()!;
    this.past.push(current);
    return next;
  }

  get canUndo() {
    return this.past.length > 0;
  }

  get canRedo() {
    return this.future.length > 0;
  }

  clear() {
    this.past = [];
    this.future = [];
  }
}
