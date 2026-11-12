export type Status = 'todo' | 'in-progress' | 'done';
export type ViewMode = 'kanban' | 'list';
export type CopyFilter = 'all' | 'done' | 'undone';

export const MAX_BATCH_SIZE = 200;

export interface Todo {
  id: string;
  title: string;
  status: Status;
  createdAt: number;
}

/** Day key (`YYYY-MM-DD`, local time) to that day's todos. */
export type DayMap = Record<string, Todo[]>;

export interface PersistedState {
  version: 1;
  view: ViewMode;
  lastDate: string;
  days: DayMap;
}

export interface PanelState {
  date: string;
  view: ViewMode;
  todos: Todo[];
}

export type WebviewMessage =
  | { type: 'ready' }
  | { type: 'setDate'; date: string }
  | { type: 'setView'; view: ViewMode }
  | { type: 'addTodo'; title: string }
  | { type: 'addTodos'; titles: string[] }
  | { type: 'updateTodo'; id: string; patch: { title?: string; status?: Status } }
  | { type: 'deleteTodo'; id: string }
  | { type: 'moveTodo'; id: string; status: Status; beforeId: string | null }
  | { type: 'copyTodos'; filter: CopyFilter };

export type HostMessage = { type: 'state' } & PanelState;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isStatus(value: unknown): value is Status {
  return value === 'todo' || value === 'in-progress' || value === 'done';
}

export function isViewMode(value: unknown): value is ViewMode {
  return value === 'kanban' || value === 'list';
}

export function isCopyFilter(value: unknown): value is CopyFilter {
  return value === 'all' || value === 'done' || value === 'undone';
}

export function isTodo(value: unknown): value is Todo {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    typeof value.title === 'string' &&
    value.title.length > 0 &&
    isStatus(value.status) &&
    typeof value.createdAt === 'number' &&
    Number.isFinite(value.createdAt)
  );
}
