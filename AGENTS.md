# Repository Guidelines

Contributor guide for **CardTree Bookmarks**, a Chrome Manifest V3 extension that replaces the new tab page with a card-tree bookmark manager. UI language is Chinese (zh-CN).

## Project Structure & Module Organization

All source lives in a flat `src/` directory; there is no separate test or asset folder.

- `src/newtab.tsx` — root component holding state, drag, keyboard nav, and bookmark-event listeners.
- `src/bookmarks.ts` — loads the Chrome bookmark tree and converts it into `CardTreeNode<BookmarkItem[]>[]`.
- `src/bookmarkActions.ts` — thin wrappers over the `chrome.bookmarks` API (CRUD + move).
- `src/bookmarkTreeHelpers.ts` — pure functions for selection, range select, filtering, and tree mutation.
- `src/bookmarkDragDom.ts` / `src/bookmarkDragUI.tsx` — custom pointer-event drag: hit testing, drop index, ghost element, rubber-band select.
- `src/BookmarkDropZone.tsx`, `src/BookmarkDialog.tsx`, `ContextMenu.tsx`, `NavRail.tsx`, `SearchBar.tsx` — UI components.
- `src/trashStore.ts`, `src/visitTracker.ts`, `src/folderDisplaySettings.ts` — `chrome.storage.local` persistence modules.
- `manifest.json`, `newtab.html`, `icons/` — extension shell and assets.
- `docs/privacy.html` — privacy policy.

## Build, Test, and Development Commands

```bash
npm run dev      # Start the Vite dev server
npm run build    # tsc type-check + Vite build -> dist/
```

After `build`, a custom Vite plugin rewrites `type="module"` to `defer`, then copies `manifest.json` and `icons/` into `dist/`. Load `dist/` as an unpacked extension at `chrome://extensions` (developer mode) to test. There is no test framework or linter configured.

## Coding Style & Naming Conventions

- TypeScript `strict` mode, target ES2020, `react-jsx`; `noUnusedLocals`, `noUnusedParameters`, `noUncheckedIndexedAccess`, and `verbatimModuleSyntax` are all on.
- React components use `PascalCase` filenames and named exports; non-component modules use `camelCase`.
- Code comments and user-facing strings stay in Chinese to match the existing codebase.
- No formatter is wired up; keep indentation consistent with surrounding files (2 spaces).

## Testing Guidelines

No automated tests exist. Verify changes by loading `dist/` into Chrome and exercising the affected feature (drag, search, CRUD, trash restore). Favicons depend on the `chrome://favicon` API and only resolve inside a real extension context.

## Commit & Pull Request Guidelines

Commit history is sparse with short, lowercase summaries (e.g. `init`, `install`). Prefer concise imperative messages such as `add folder collapse animation` or `fix drag scroll on edge`. Keep PRs focused, describe the change and how it was manually verified, and link any related issue.

## Architecture Notes

Chrome Bookmarks API is the single source of truth. Writes go through `chrome.bookmarks`, followed by optimistic local state updates; bookmark change events (`onCreated`/`onRemoved`/`onChanged`/`onMoved`) trigger a debounced reload as fallback sync. State is managed with React hooks in `newtab.tsx` and shared via `MenuContext` (see `menuContextTypes.ts`). RxJS backs search debounce and drag-session coordination.
