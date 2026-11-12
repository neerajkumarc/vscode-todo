import { randomUUID } from 'node:crypto';
import type { Memento } from 'vscode';
import { isRecord, isTodo, isViewMode } from './types';
import type { DayMap, PersistedState, Status, Todo, ViewMode } from './types';

const STORAGE_KEY = 'todo.v1';

export interface StoreHandlers {
  onCorruptData(): void;
  onSaveError(): void;
}

export class TodoStore {
  private state: PersistedState;
  private writeQueue: Promise<void> = Promise.resolve();
  private readonly handlers: StoreHandlers;

  constructor(
    private readonly memento: Memento,
    handlers: StoreHandlers,
  ) {
    this.handlers = handlers;
    const stored = memento.get<unknown>(STORAGE_KEY);
    if (stored === undefined) {
      this.state = emptyState();
      return;
    }

    const parsed = parseState(stored);
    if (parsed) {
      this.state = parsed;
      return;
    }

    console.error('Todo data could not be read and was reset.');
    this.state = emptyState();
    handlers.onCorruptData();
    this.persist();
  }

  getLastDate(): string {
    return this.state.lastDate;
  }

  setLastDate(date: string): void {
    if (!isValidDateKey(date) || date === this.state.lastDate) return;
    this.state = { ...this.state, lastDate: date };
    this.persist();
  }

  getView(): ViewMode {
    return this.state.view;
  }

  setView(view: ViewMode): void {
    if (view === this.state.view) return;
    this.state = { ...this.state, view };
    this.persist();
  }

  getTodos(date: string): Todo[] {
    const todos = this.state.days[date];
    return todos ? [...todos] : [];
  }

  addTodo(date: string, title: string): void {
    const trimmed = title.trim();
    if (trimmed) {
      this.addTodos(date, [trimmed]);
    }
  }

  addTodos(date: string, titles: readonly string[]): void {
    if (!isValidDateKey(date)) return;

    const createdAt = Date.now();
    const created = titles
      .map((title) => title.trim())
      .filter((title) => title.length > 0)
      .map<Todo>((title) => ({
        id: randomUUID(),
        title,
        status: 'todo',
        createdAt,
      }));

    if (created.length === 0) return;

    const existing = this.state.days[date] ?? [];
    this.state = {
      ...this.state,
      days: { ...this.state.days, [date]: [...existing, ...created] },
    };
    this.persist();
  }

  updateTodo(date: string, id: string, patch: { title?: string; status?: Status }): void {
    const todos = this.state.days[date];
    if (!todos) return;

    const index = todos.findIndex((todo) => todo.id === id);
    const current = todos[index];
    if (!current) return;

    const next: Todo = { ...current };
    let changed = false;

    if (patch.title !== undefined) {
      const title = patch.title.trim();
      if (title && title !== current.title) {
        next.title = title;
        changed = true;
      }
    }

    if (patch.status !== undefined && patch.status !== current.status) {
      next.status = patch.status;
      changed = true;
    }

    if (!changed) return;

    const updated = [...todos];
    updated[index] = next;
    this.state = {
      ...this.state,
      days: { ...this.state.days, [date]: updated },
    };
    this.persist();
  }

  deleteTodo(date: string, id: string): void {
    const todos = this.state.days[date];
    if (!todos) return;

    const remaining = todos.filter((todo) => todo.id !== id);
    if (remaining.length === todos.length) return;

    const days = { ...this.state.days };
    if (remaining.length === 0) {
      delete days[date];
    } else {
      days[date] = remaining;
    }

    this.state = { ...this.state, days };
    this.persist();
  }

  moveTodo(date: string, id: string, status: Status, beforeId: string | null): void {
    const todos = this.state.days[date];
    if (!todos) return;

    const moved = todos.find((todo) => todo.id === id);
    if (!moved) return;

    const rest = todos.filter((todo) => todo.id !== id);
    const anchor =
      beforeId === null || beforeId === id
        ? undefined
        : rest.find((todo) => todo.id === beforeId && todo.status === status);
    const at = anchor ? rest.indexOf(anchor) : rest.length;

    const next: Todo = moved.status === status ? moved : { ...moved, status };
    const updated = [...rest.slice(0, at), next, ...rest.slice(at)];
    if (sameOrder(updated, todos)) return;

    this.state = {
      ...this.state,
      days: { ...this.state.days, [date]: updated },
    };
    this.persist();
  }

  private persist(): void {
    this.writeQueue = this.writeQueue.then(async () => {
      try {
        await this.memento.update(STORAGE_KEY, this.snapshot());
      } catch (error) {
        console.error('Could not save todos.', error);
        this.handlers.onSaveError();
      }
    });
  }

  private snapshot(): PersistedState {
    const days: DayMap = {};
    for (const [date, todos] of Object.entries(this.state.days)) {
      if (todos.length > 0) days[date] = todos;
    }
    return {
      version: 1,
      view: this.state.view,
      lastDate: this.state.lastDate,
      days,
    };
  }
}

function emptyState(): PersistedState {
  return { version: 1, view: 'kanban', lastDate: todayKey(), days: {} };
}

function sameOrder(a: readonly Todo[], b: readonly Todo[]): boolean {
  return (
    a.length === b.length &&
    a.every((todo, index) => {
      const other = b[index];
      return other !== undefined && todo.id === other.id && todo.status === other.status;
    })
  );
}

function todayKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidDateKey(value: string): boolean {
  const match = DATE_REGEX.exec(value);
  if (!match) return false;

  const [, y, m, d] = match;
  if (!y || !m || !d) return false;

  const year = Number(y);
  const month = Number(m);
  const day = Number(d);

  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

function parseState(value: unknown): PersistedState | undefined {
  if (!isRecord(value) || value.version !== 1) return undefined;
  if (!isViewMode(value.view)) return undefined;
  if (typeof value.lastDate !== 'string' || !isValidDateKey(value.lastDate)) return undefined;
  if (!isRecord(value.days)) return undefined;

  const days: DayMap = {};
  for (const [date, todos] of Object.entries(value.days)) {
    if (!isValidDateKey(date) || !Array.isArray(todos)) return undefined;
    const parsed: Todo[] = [];
    for (const todo of todos) {
      if (!isTodo(todo)) return undefined;
      parsed.push({
        id: todo.id,
        title: todo.title,
        status: todo.status,
        createdAt: todo.createdAt,
      });
    }
    if (parsed.length > 0) days[date] = parsed;
  }

  return {
    version: 1,
    view: value.view,
    lastDate: value.lastDate,
    days,
  };
}
