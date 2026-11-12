# Agent Guide

This file is the entry point for coding agents contributing to Daily Todo. Read it before touching code.

## Repo Map

```
src/        extension host (Node): activation, panel, store, shared types
webview/    sandboxed UI: index.html, main.ts, style.css
dist/       generated build output — never edit
media/      extension icons and visual assets
```

Daily Todo is a lightweight, zero-dependency VS Code webview todo extension. A title bar button opens a panel with Kanban and List views of per-day tasks.

## Commands

```sh
npm install        # install dependencies
npm run build      # typecheck + bundle extension and webview
npm run watch      # rebuild on change
npm run package    # package extension into .vsix
```

Run and debug the extension via `F5` (Extension Development Host).

---

## Coding Standards

Optimize for a small, readable, correct codebase — not for impressiveness.

### 1. Prime Directive
**Ship the smallest correct change.** Every line is a liability. Prefer deleting code over adding it. Do not build for hypothetical futures. Abstract only after the second real use case exists.

### 2. Architectural Rules & Non-Negotiables
- **Extension host owns all state.** The webview only renders state and sends intents back. Never mutate state locally in the webview.
- **Zero runtime dependencies.** No external UI frameworks (React/Vue), no external state libraries, no CSS frameworks.
- **Secure rendering.** User text must always go through `textContent`, never `innerHTML` or string interpolation.
- **Native VS Code theming.** Style exclusively via `--vscode-*` CSS variables; avoid hardcoded colors.
- **Accessibility.** Every icon button requires an `aria-label`; interactive elements must be keyboard-accessible with visible focus outlines.

### 3. Do Not
- Add runtime dependencies without explicit user approval.
- Introduce unnecessary layers ("managers", "factories", "service wrappers") around simple functions.
- Leave commented-out code, dead exports, unused files, or debug logging.
- Use `any`, `@ts-ignore`, `@ts-expect-error`, or non-null assertions `!` without strong documented invariants.
- Edit generated files in `dist/` or commit `node_modules/`.

### 4. TypeScript Guidelines
- `strict: true`.
- Union types over `enum`.
- Explicit return types on exported functions.
- Use `import type` for type-only imports.
- No floating promises: `await`, `void`, or handle explicitly.
- Validate all incoming webview/external messages at boundaries using explicit type guards.

### 5. Verification Checklist
1. `npm run build` succeeds with zero errors.
2. Extension opens cleanly via command or title bar icon.
3. Adding, reordering, status cycling, and deleting todos works.
4. View toggle (Kanban vs. List) and date navigation work correctly.
5. VS Code reload retains all persisted task data without corruption.
6. Webview DevTools and extension host show zero errors.
