import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import {
  MAX_BATCH_SIZE,
  isCopyFilter,
  isRecord,
  isStatus,
  isViewMode,
} from './types';
import type { CopyFilter, HostMessage, Status, Todo } from './types';
import type { TodoStore } from './store';

const COPY_SECTIONS: ReadonlyArray<{ status: Status; label: string }> = [
  { status: 'todo', label: 'Todo' },
  { status: 'in-progress', label: 'In progress' },
  { status: 'done', label: 'Done' },
];

export class TodoPanel {
  private static current: TodoPanel | undefined;
  private readonly disposables: vscode.Disposable[] = [];

  static show(extensionUri: vscode.Uri, store: TodoStore): void {
    const existing = TodoPanel.current;
    if (existing) {
      existing.reveal();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'todo',
      'Daily Todo',
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist', 'webview')],
      },
    );
    TodoPanel.current = new TodoPanel(panel, extensionUri, store);
  }

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly extensionUri: vscode.Uri,
    private readonly store: TodoStore,
  ) {
    this.panel.webview.onDidReceiveMessage(
      (message: unknown) => {
        void this.handleMessage(message);
      },
      null,
      this.disposables,
    );
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    void this.loadHtml().catch((error: unknown) => {
      console.error('Could not load the Daily Todo panel.', error);
    });
  }

  private reveal(): void {
    this.panel.reveal(undefined, false);
  }

  private dispose(): void {
    TodoPanel.current = undefined;
    while (this.disposables.length > 0) {
      this.disposables.pop()?.dispose();
    }
  }

  private async handleMessage(raw: unknown): Promise<void> {
    if (!isRecord(raw) || typeof raw.type !== 'string') return;

    switch (raw.type) {
      case 'ready':
        break;
      case 'setDate':
        if (typeof raw.date === 'string') {
          this.store.setLastDate(raw.date);
        }
        break;
      case 'setView':
        if (isViewMode(raw.view)) {
          this.store.setView(raw.view);
        }
        break;
      case 'addTodo':
        if (typeof raw.title === 'string') {
          this.store.addTodo(this.store.getLastDate(), raw.title);
        }
        break;
      case 'addTodos': {
        if (
          !Array.isArray(raw.titles) ||
          raw.titles.length === 0 ||
          raw.titles.length > MAX_BATCH_SIZE
        ) {
          return;
        }
        const titles: string[] = [];
        for (const title of raw.titles) {
          if (typeof title !== 'string') return;
          titles.push(title);
        }
        this.store.addTodos(this.store.getLastDate(), titles);
        break;
      }
      case 'updateTodo': {
        if (typeof raw.id !== 'string' || !isRecord(raw.patch)) return;
        const patch: { title?: string; status?: Status } = {};
        if (typeof raw.patch.title === 'string') patch.title = raw.patch.title;
        if (isStatus(raw.patch.status)) patch.status = raw.patch.status;
        this.store.updateTodo(this.store.getLastDate(), raw.id, patch);
        break;
      }
      case 'deleteTodo':
        if (typeof raw.id === 'string') {
          this.store.deleteTodo(this.store.getLastDate(), raw.id);
        }
        break;
      case 'moveTodo': {
        if (typeof raw.id !== 'string' || !isStatus(raw.status)) return;
        const beforeId = raw.beforeId;
        if (beforeId !== null && typeof beforeId !== 'string') return;
        this.store.moveTodo(this.store.getLastDate(), raw.id, raw.status, beforeId);
        break;
      }
      case 'copyTodos':
        if (isCopyFilter(raw.filter)) {
          await this.copyTodos(raw.filter);
        }
        break;
      default:
        return;
    }

    this.postState();
  }

  private async copyTodos(filter: CopyFilter): Promise<void> {
    const date = this.store.getLastDate();
    const text = buildCopyText(date, this.store.getTodos(date), filter);
    try {
      await vscode.env.clipboard.writeText(text);
    } catch (error) {
      console.error('Could not copy todos.', error);
      void vscode.window.showErrorMessage('Could not copy todos.');
      return;
    }
    void vscode.window.showInformationMessage('Copied to clipboard.');
  }

  private postState(): void {
    const date = this.store.getLastDate();
    const message: HostMessage = {
      type: 'state',
      date,
      view: this.store.getView(),
      todos: this.store.getTodos(date),
    };
    void this.panel.webview.postMessage(message);
  }

  private async loadHtml(): Promise<void> {
    const root = vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview');
    const source = await vscode.workspace.fs.readFile(
      vscode.Uri.joinPath(root, 'index.html'),
    );
    const webview = this.panel.webview;
    const nonce = randomBytes(16).toString('hex');
    const assetUri = (file: string) =>
      webview.asWebviewUri(vscode.Uri.joinPath(root, file)).toString();

    webview.html = new TextDecoder()
      .decode(source)
      .replaceAll('{{cspSource}}', webview.cspSource)
      .replaceAll('{{nonce}}', nonce)
      .replaceAll('{{styleUri}}', assetUri('style.css'))
      .replaceAll('{{scriptUri}}', assetUri('main.js'));
  }
}

function buildCopyText(date: string, todos: readonly Todo[], filter: CopyFilter): string {
  const selected = todos.filter((todo) => matchesFilter(todo, filter));
  const blocks = [`## ${date}`];

  if (selected.length === 0) {
    blocks.push('No tasks.');
    return blocks.join('\n\n');
  }

  for (const section of COPY_SECTIONS) {
    const items = selected.filter((todo) => todo.status === section.status);
    if (items.length === 0) continue;
    const lines = items.map((todo) => {
      const box = todo.status === 'done' ? 'x' : ' ';
      return `- [${box}] ${sanitizeTitle(todo.title)}`;
    });
    blocks.push(`### ${section.label}\n${lines.join('\n')}`);
  }

  return blocks.join('\n\n');
}

function matchesFilter(todo: Todo, filter: CopyFilter): boolean {
  if (filter === 'done') return todo.status === 'done';
  if (filter === 'undone') return todo.status !== 'done';
  return true;
}

function sanitizeTitle(title: string): string {
  return title.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, ' ').trim();
}
