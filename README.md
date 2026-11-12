# Daily Todo

<p align="center">
  <img src="media/icon.png" width="128" height="128" alt="Daily Todo Icon" />
</p>

<p align="center">
  A lightweight daily task manager with Kanban and List views inside VS Code.
</p>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=neerajkumarc.vscode-daily-todo"><img src="https://img.shields.io/badge/VS%20Code%20Marketplace-v1.0.0-blue?style=flat-square" alt="VS Code Marketplace"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="License: MIT"></a>
</p>

---

Daily Todo keeps your tasks organized day by day directly in your editor. It provides both a 3-column Kanban board and a simple checklist for the same set of tasks, persisted across restarts using VS Code's native global state.

## Getting Started

1. Open the panel by clicking the checklist icon in the editor title bar, or run `Daily Todo` from the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`).
2. Type a title in the input field and press `Enter` to create a task.
3. Advance a task's status by clicking its status button (`→` Todo, `✓` In progress, `↺` Done), or drag cards between columns.
4. Switch between Kanban and List views using the dropdown in the header.

## Features

### Kanban and List views
Toggle between views depending on how you prefer to visualize work:
- **Kanban**: Three columns (`Todo`, `In progress`, `Done`) with quick-action status buttons on each card.
- **List**: A clean vertical checklist where toggling a checkbox marks an item complete.

### Date navigation
Tasks are scoped to individual calendar days (`YYYY-MM-DD`). Use the date input in the header to jump between days, review what you finished earlier in the week, or set up tasks for tomorrow.

### Drag and drop & keyboard reordering
- Drag cards across columns or reorder them within a column. A drop guideline shows where the card will land.
- If you prefer the keyboard, focus any card and use `Alt + Arrow` keys to move tasks across columns or up and down in the list.

### Batch pasting
Pasting multiple lines into the input field splits them into separate tasks automatically. Daily Todo strips markdown bullets and checkbox syntax (`-`, `*`, `+`, `1.`, `[ ]`, `[x]`, `☐`, `☑`), removes duplicates, and adds the batch in one step (up to 200 tasks).

### Copy as Markdown
Use the **Copy** dropdown in the header to format and copy the day's tasks to your clipboard:
- **Copy all**: Copies all tasks grouped under status headings.
- **Copy done**: Copies completed tasks only (useful for daily standups).
- **Copy undone**: Copies remaining tasks.

Example output:
```markdown
## 2026-11-12

### In progress
- [ ] Refactor API client

### Done
- [x] Publish extension to Marketplace
- [x] Update documentation
```

### Native theming
The UI styles strictly with VS Code CSS variables (`--vscode-*`), adapting automatically to light, dark, and high-contrast themes. No external runtime frameworks or webview dependencies are used.

## Keyboard Shortcuts

| Shortcut | Context | Action |
| :--- | :--- | :--- |
| `Enter` | Task input | Add task or batch of tasks |
| `Shift + Enter` | Task input | Insert a newline |
| `Esc` | Task input | Cancel adding |
| `Alt + ArrowLeft` | Focused card | Move task to previous column |
| `Alt + ArrowRight` | Focused card | Move task to next column |
| `Alt + ArrowUp` | Focused card | Move task up in current column |
| `Alt + ArrowDown` | Focused card | Move task down in current column |
| `Esc` | Dragging card | Cancel drag |
| `Esc` | Copy menu | Close menu |

## Development

```sh
# Install dependencies
npm install

# Typecheck and bundle with esbuild
npm run build

# Rebuild automatically on file changes
npm run watch

# Package extension into a .vsix
npm run package
```

Press `F5` in VS Code to open an Extension Development Host with the extension loaded for testing.

## License

[MIT](LICENSE) © [neerajkumarc](https://github.com/neerajkumarc)
