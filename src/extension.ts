import * as vscode from 'vscode';
import { TodoPanel } from './panel';
import { TodoStore } from './store';

export function activate(context: vscode.ExtensionContext): void {
  const store = new TodoStore(context.globalState, {
    onCorruptData: () => {
      void vscode.window.showWarningMessage(
        'Todo data could not be read and was reset.',
      );
    },
    onSaveError: () => {
      void vscode.window.showErrorMessage('Could not save todos.');
    },
  });

  context.subscriptions.push(
    vscode.commands.registerCommand('todo.open', () => {
      TodoPanel.show(context.extensionUri, store);
    }),
  );
}
