import {
  MAX_BATCH_SIZE,
  isCopyFilter,
  isRecord,
  isTodo,
  isViewMode,
} from '../src/types';
import type {
  HostMessage,
  PanelState,
  Status,
  Todo,
  ViewMode,
  WebviewMessage,
} from '../src/types';

interface VsCodeApi {
  postMessage(message: WebviewMessage): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

const vscode = acquireVsCodeApi();

const NEXT_STATUS: Record<Status, Status> = {
  todo: 'in-progress',
  'in-progress': 'done',
  done: 'todo',
};

const STATUS_LABEL: Record<Status, string> = {
  todo: 'Mark as in progress',
  'in-progress': 'Mark as done',
  done: 'Reopen',
};

const STATUS_GLYPH: Record<Status, string> = {
  todo: '→',
  'in-progress': '✓',
  done: '↺',
};

const COLUMN_LABEL: Record<Status, string> = {
  todo: 'Todo',
  'in-progress': 'In progress',
  done: 'Done',
};

const ORDER: readonly Status[] = ['todo', 'in-progress', 'done'];

const COLUMNS: ReadonlyArray<{ status: Status; label: string }> = ORDER.map((status) => ({
  status,
  label: COLUMN_LABEL[status],
}));

const dateInput = requireElement('date', HTMLInputElement);
const viewSelect = requireElement('view', HTMLSelectElement);
const content = requireElement('content', HTMLElement);
const copyMenu = requireElement('copy', HTMLDetailsElement);
const copySummary = requireElement('copy-summary', HTMLElement);
const live = requireElement('live', HTMLElement);

let current: PanelState | undefined;
let adding = false;
let lastDate = '';
let lastView: ViewMode | undefined;
let pendingFocusId: string | null = null;

let draggedId: string | null = null;
let draggedCard: HTMLElement | null = null;
let dropTarget: { body: HTMLElement; beforeId: string | null } | null = null;
let highlighted: HTMLElement | undefined;
let dropLine: HTMLElement | undefined;
let pressedCard: HTMLElement | null = null;

dateInput.addEventListener('change', () => {
  if (dateInput.value) send({ type: 'setDate', date: dateInput.value });
});

viewSelect.addEventListener('change', () => {
  send({ type: 'setView', view: viewSelect.value === 'list' ? 'list' : 'kanban' });
});

copyMenu.addEventListener('click', (event) => {
  if (!(event.target instanceof Element)) return;
  const item = event.target.closest('button[data-filter]');
  if (!(item instanceof HTMLButtonElement)) return;
  const filter = item.dataset.filter;
  if (!isCopyFilter(filter)) return;
  copyMenu.open = false;
  copySummary.focus();
  send({ type: 'copyTodos', filter });
});

copyMenu.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || !copyMenu.open) return;
  event.preventDefault();
  copyMenu.open = false;
  copySummary.focus();
});

document.addEventListener('click', (event) => {
  if (!copyMenu.open) return;
  if (event.target instanceof Node && copyMenu.contains(event.target)) return;
  copyMenu.open = false;
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && draggedId) clearDrag();
});

window.addEventListener('pointerup', releasePress);
window.addEventListener('pointercancel', releasePress);

window.addEventListener('message', (event: MessageEvent<unknown>) => {
  if (isHostMessage(event.data)) render(event.data);
});

function render(next: PanelState): void {
  if (next.date !== lastDate || next.view !== lastView) adding = false;
  lastDate = next.date;
  lastView = next.view;
  current = next;

  dateInput.value = next.date;
  viewSelect.value = next.view;
  content.replaceChildren(
    next.view === 'kanban' ? renderKanban(next.todos) : renderList(next.todos),
  );
  if (draggedCard && !draggedCard.isConnected) clearDrag();
  restoreFocus(next.todos);
}

function rerender(): void {
  if (current) render(current);
}

function renderKanban(todos: readonly Todo[]): HTMLElement {
  const board = createElement('div', 'board');
  board.addEventListener('dragover', (event) => {
    const overColumn = event.target instanceof Element && event.target.closest('.column');
    if (!overColumn) clearDropTarget();
  });
  board.addEventListener('dragleave', (event) => {
    if (event.relatedTarget instanceof Node && board.contains(event.relatedTarget)) return;
    clearDropTarget();
  });

  for (const column of COLUMNS) board.append(createColumn(column, todos));

  return board;
}

function createColumn(
  column: { status: Status; label: string },
  todos: readonly Todo[],
): HTMLElement {
  const section = createElement('section', 'column');
  const heading = createElement('h2', 'column-title');
  heading.textContent = column.label;
  section.append(heading);

  if (column.status === 'todo') {
    const actions = createElement('div', 'column-actions');
    actions.append(adding ? createAddInput() : createAddButton());
    section.append(actions);
  }

  const body = createElement('div', 'column-body');
  for (const todo of todos) {
    if (todo.status === column.status) body.append(createCard(todo));
  }
  section.append(body);

  section.addEventListener('dragover', (event) => handleDragOver(event, section, body));
  section.addEventListener('drop', (event) => handleDrop(event, body, column.status));

  return section;
}

function renderList(todos: readonly Todo[]): HTMLElement {
  const list = createElement('div', 'list');

  if (todos.length === 0) {
    const empty = createElement('p', 'empty');
    empty.textContent = 'No tasks for this day.';
    list.append(empty);
  }

  for (const todo of todos) list.append(createRow(todo));

  const footer = createElement('div', 'list-footer');
  footer.append(adding ? createAddInput() : createAddButton());
  list.append(footer);

  return list;
}

function createCard(todo: Todo): HTMLElement {
  const card = createElement('article', 'card');
  card.draggable = true;
  card.tabIndex = 0;
  card.dataset.id = todo.id;
  card.setAttribute('aria-label', `${todo.title} — ${COLUMN_LABEL[todo.status]}`);
  card.addEventListener('dragstart', (event) => handleDragStart(event, card, todo));
  card.addEventListener('dragend', clearDrag);
  card.addEventListener('keydown', (event) => {
    if (event.target === card) handleCardKeydown(event, todo);
  });
  rememberControlPress(card);

  const title = createElement('p', 'card-title');
  title.textContent = todo.title;

  const status = createElement('button', 'icon-button status-button');
  status.type = 'button';
  status.draggable = false;
  status.textContent = STATUS_GLYPH[todo.status];
  status.setAttribute('aria-label', STATUS_LABEL[todo.status]);
  status.addEventListener('click', () => {
    send({
      type: 'updateTodo',
      id: todo.id,
      patch: { status: NEXT_STATUS[todo.status] },
    });
  });

  card.append(title, status, createDeleteButton(todo));
  return card;
}

function createRow(todo: Todo): HTMLElement {
  const row = createElement('div', 'list-row');
  const label = createElement('label', 'row-label');

  const checkbox = createElement('input', 'row-checkbox');
  checkbox.type = 'checkbox';
  checkbox.checked = todo.status === 'done';
  checkbox.addEventListener('change', () => {
    send({
      type: 'updateTodo',
      id: todo.id,
      patch: { status: checkbox.checked ? 'done' : 'todo' },
    });
  });

  const title = createElement('span', 'row-title');
  title.textContent = todo.title;

  label.append(checkbox, title);
  row.append(label, createDeleteButton(todo));
  return row;
}

function createDeleteButton(todo: Todo): HTMLButtonElement {
  const button = createElement('button', 'icon-button delete-button');
  button.type = 'button';
  button.draggable = false;
  button.textContent = '×';
  button.setAttribute('aria-label', `Delete ${todo.title}`);
  button.addEventListener('click', () => {
    send({ type: 'deleteTodo', id: todo.id });
  });
  return button;
}

function handleDragStart(event: DragEvent, card: HTMLElement, todo: Todo): void {
  draggedId = todo.id;
  draggedCard = card;
  card.classList.add('dragging');
  if (!event.dataTransfer) return;
  event.dataTransfer.setData('text/plain', todo.id);
  event.dataTransfer.effectAllowed = 'move';
}

/** Buttons inside a draggable card must never start a card drag. */
function rememberControlPress(card: HTMLElement): void {
  card.addEventListener('pointerdown', (event) => {
    releasePress();
    pressedCard = card;
    const control = event.target instanceof Element ? event.target.closest('button') : null;
    card.draggable = control === null;
  });
}

function releasePress(): void {
  if (!pressedCard) return;
  pressedCard.draggable = true;
  pressedCard = null;
}

function handleDragOver(event: DragEvent, section: HTMLElement, body: HTMLElement): void {
  if (!draggedId) return;

  const card = event.target instanceof Element ? event.target.closest('.card') : null;
  if (card === draggedCard) {
    clearDropTarget();
    return;
  }

  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';

  const before = card instanceof HTMLElement && body.contains(card) ? card : null;
  dropTarget = { body, beforeId: before ? (before.dataset.id ?? null) : null };
  highlight(section);
  showDropLine(body, before);
}

function handleDrop(event: DragEvent, body: HTMLElement, status: Status): void {
  const id = draggedId;
  const target = dropTarget;
  const dragged = draggedCard;
  const card = event.target instanceof Element ? event.target.closest('.card') : null;
  clearDrag();

  if (!id || !target || target.body !== body || card === dragged) return;
  event.preventDefault();
  send({ type: 'moveTodo', id, status, beforeId: target.beforeId });
}

function handleCardKeydown(event: KeyboardEvent, todo: Todo): void {
  const { key } = event;
  if (!event.altKey) return;
  if (key !== 'ArrowUp' && key !== 'ArrowDown' && key !== 'ArrowLeft' && key !== 'ArrowRight') {
    return;
  }
  event.preventDefault();
  if (!current) return;

  const siblings = current.todos.filter((item) => item.status === todo.status);
  const index = siblings.findIndex((item) => item.id === todo.id);
  if (index === -1) return;

  if (key === 'ArrowUp') {
    const before = siblings[index - 1];
    if (before) moveByKeyboard(todo, todo.status, before.id);
    return;
  }

  if (key === 'ArrowDown') {
    if (!siblings[index + 1]) return;
    const after = siblings[index + 2];
    moveByKeyboard(todo, todo.status, after ? after.id : null);
    return;
  }

  const columnIndex = ORDER.indexOf(todo.status);
  const next = ORDER[columnIndex + (key === 'ArrowRight' ? 1 : -1)];
  if (next) moveByKeyboard(todo, next, null);
}

function moveByKeyboard(todo: Todo, status: Status, beforeId: string | null): void {
  pendingFocusId = todo.id;
  send({ type: 'moveTodo', id: todo.id, status, beforeId });
}

function highlight(section: HTMLElement): void {
  if (highlighted === section) return;
  highlighted?.classList.remove('drop-target');
  highlighted = section;
  section.classList.add('drop-target');
}

function showDropLine(body: HTMLElement, before: HTMLElement | null): void {
  const line = dropLine ?? createElement('div', 'drop-line');
  dropLine = line;
  if (line.parentElement !== body) body.append(line);

  const cards = body.querySelectorAll<HTMLElement>('.card');
  const last = cards[cards.length - 1];
  let top = 4;
  if (before) top = Math.max(0, before.offsetTop - 4);
  else if (last) top = last.offsetTop + last.offsetHeight + 4;

  line.style.top = `${top}px`;
}

function clearDrag(): void {
  draggedCard?.classList.remove('dragging');
  draggedId = null;
  draggedCard = null;
  clearDropTarget();
}

function clearDropTarget(): void {
  dropTarget = null;
  highlighted?.classList.remove('drop-target');
  highlighted = undefined;
  dropLine?.remove();
  dropLine = undefined;
}

function restoreFocus(todos: readonly Todo[]): void {
  if (!pendingFocusId) return;

  const id = pendingFocusId;
  pendingFocusId = null;
  const card = Array.from(content.querySelectorAll<HTMLElement>('.card')).find(
    (element) => element.dataset.id === id,
  );
  if (!card) return;

  card.focus();
  const todo = todos.find((item) => item.id === id);
  if (todo) live.textContent = `Moved ${todo.title} to ${COLUMN_LABEL[todo.status]}.`;
}

function createAddButton(): HTMLButtonElement {
  const button = createElement('button', 'add-button');
  button.type = 'button';
  button.textContent = '+ Add task';
  button.addEventListener('click', () => {
    adding = true;
    rerender();
  });
  return button;
}

function createAddInput(): HTMLTextAreaElement {
  const input = createElement('textarea', 'add-input');
  input.rows = 1;
  input.placeholder = 'Task title — paste a list for multiple';
  input.setAttribute('aria-label', 'New task title');
  input.setAttribute('aria-describedby', 'add-hint');

  let cancelled = false;

  const resize = (): void => {
    input.style.height = 'auto';
    const border = input.offsetHeight - input.clientHeight;
    input.style.height = `${input.scrollHeight + border}px`;
  };

  input.addEventListener('input', resize);

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      const buffer = input.value;

      if (!hasLineBreak(buffer)) {
        const title = buffer.trim();
        if (!title) return;
        input.value = '';
        send({ type: 'addTodo', title });
        return;
      }

      const titles = cleanBatch(buffer);
      if (titles.length === 0) return;
      if (titles.length > MAX_BATCH_SIZE) {
        live.textContent = tooManyMessage(titles.length);
        return;
      }

      input.value = '';
      send({ type: 'addTodos', titles });
      live.textContent = addedMessage(titles.length);
      resize();
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      cancelled = true;
      adding = false;
      rerender();
      content.querySelector<HTMLButtonElement>('.add-button')?.focus();
    }
  });

  input.addEventListener('blur', (event) => {
    if (cancelled) return;

    if (event.relatedTarget === dateInput || event.relatedTarget === viewSelect) {
      adding = false;
      setTimeout(rerender, 0);
      return;
    }

    const buffer = input.value;

    if (!hasLineBreak(buffer)) {
      const title = buffer.trim();
      adding = false;
      if (title) {
        send({ type: 'addTodo', title });
        return;
      }
      setTimeout(rerender, 0);
      return;
    }

    const titles = cleanBatch(buffer);
    if (titles.length === 0) return;
    if (titles.length > MAX_BATCH_SIZE) {
      live.textContent = tooManyMessage(titles.length);
      return;
    }

    adding = false;
    send({ type: 'addTodos', titles });
    live.textContent = addedMessage(titles.length);
  });

  queueMicrotask(() => {
    input.focus();
    resize();
  });
  return input;
}

const LIST_MARKER = /^(?:[-*+•◦‣]|\d{1,3}[.)]|\[[ xX]\]|[☐☑])(?:\s+|$)/;

function hasLineBreak(buffer: string): boolean {
  return buffer.includes('\n') || buffer.includes('\r');
}

function stripListMarkers(line: string): string {
  let rest = line.replace(/^\s+/, '');
  for (;;) {
    const match = LIST_MARKER.exec(rest);
    if (!match) return rest;
    rest = rest.slice(match[0].length);
  }
}

function cleanBatch(buffer: string): string[] {
  const seen = new Set<string>();
  const titles: string[] = [];

  for (const line of buffer.replace(/\r\n?/g, '\n').split('\n')) {
    const title = stripListMarkers(line).replace(/\s+/g, ' ').trim();
    if (!title) continue;

    const key = title.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    titles.push(title);
  }

  return titles;
}

function addedMessage(count: number): string {
  return `Added ${count} task${count === 1 ? '' : 's'}.`;
}

function tooManyMessage(count: number): string {
  return `Too many tasks: ${count} found, maximum ${MAX_BATCH_SIZE}. Nothing added.`;
}

function send(message: WebviewMessage): void {
  vscode.postMessage(message);
}

function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.className = className;
  return element;
}

function requireElement<T extends HTMLElement>(id: string, type: new () => T): T {
  const element = document.getElementById(id);
  if (!(element instanceof type)) {
    throw new Error(`Todo webview markup is incomplete: #${id}`);
  }
  return element;
}

function isHostMessage(value: unknown): value is HostMessage {
  if (!isRecord(value) || value.type !== 'state') return false;
  if (typeof value.date !== 'string') return false;
  if (!isViewMode(value.view)) return false;
  if (!Array.isArray(value.todos)) return false;
  return value.todos.every(isTodo);
}

send({ type: 'ready' });
