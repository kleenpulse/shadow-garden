# FileExplorer

A persistent, three-pane file manager for React. Uploads — images, video, any
blob — are written to a **real client-side file system** and survive reloads,
because `localStorage` can only hold strings.

Nested folders, grid + list views, search, sort, drag-and-drop upload, move
(drag-onto-folder or cut/paste), inline rename, delete with undo, a right-click
menu, keyboard navigation, and a live preview panel (image / video / audio /
text) — all in a self-contained folder with no imports outside it.

## Install

```bash
npm i react-resizable-panels lucide-react motion
```

Persistence uses the platform's OPFS and IndexedDB directly — no storage
dependency to install.

## Usage

```tsx
import FileExplorer from "@/components/file-explorer/FileExplorer";

export default function Page() {
  return (
    <div className="h-[600px]">
      <FileExplorer />
    </div>
  );
}
```

That's it. With no `store` prop it auto-selects the best backend available and
persists under the default `namespace`. Give it a definite height — it fills its
container.

## How persistence works

The component never talks to a storage API directly. Everything goes through a
single `FileStore` interface (`store/types.ts`). `createFileStore(namespace)`
picks the strongest backend the browser offers:

| Backend | When | Notes |
| --- | --- | --- |
| **OPFS** | Chrome 102+, Firefox 111+, Safari 15.2+ | Real sandboxed file system, nested dirs, streamed writes. No prompts. |
| **IndexedDB** | Everywhere else | Blobs stored by id; directory tree kept as flat records, moved atomically. |
| **Memory** | No persistent storage (rare) | Data lives for the tab's lifetime only. |

File metadata (name, size, mtime, mime) comes from the store; **file bytes are
read on demand** and wrapped in an object URL only while previewed, then revoked
(`useObjectUrl.ts`) so images and video never leak memory.

## Swapping the backend (S3, a REST API, a mock)

Implement the `FileStore` interface and pass it as `store`. It accepts a ready
instance **or** a factory:

```tsx
import FileExplorer from "./FileExplorer";
import type { FileStore } from "./store/types";

const myStore: FileStore = {
  backend: "my-api",
  async init() { /* open connection */ },
  async list(dir = "") { /* GET children */ return []; },
  async stat(path) { /* HEAD */ return null; },
  async read(path) { /* GET bytes */ return new Blob(); },
  async write(path, data, mime) { /* PUT */ return /* FileNode */; },
  async mkdir(path) { /* PUT dir */ return /* FileNode */; },
  async remove(path) { /* DELETE */ },
  async move(from, to) { /* MOVE */ return /* FileNode */; },
  async rename(path, next) { /* MOVE within dir */ return /* FileNode */; },
  async estimate() { return { usage: 0, quota: 0 }; },
};

<FileExplorer store={myStore} />;
// or: <FileExplorer store={() => createMyStore()} />
```

Paths are POSIX-ish from the root: `""` is the root, no leading slash, segments
joined by `/`. That's the whole contract.

## Props

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `store` | `FileStore \| () => Promise<FileStore>` | auto | Backend; omit to auto-select. |
| `namespace` | `string` | `"sg-file-explorer"` | Isolates OPFS dir / IndexedDB name. |
| `seed` | `SeedEntry[]` | — | Demo content written once, only if the store is empty. |
| `defaultView` | `"grid" \| "list"` | `"grid"` | Toolbar toggle overrides live. |
| `thumbnailSize` | `number` | `112` | Grid tile edge (px). |
| `density` | `"comfortable" \| "compact"` | `"comfortable"` | List/rail row height. |
| `sortBy` | `"name" \| "date" \| "size" \| "type"` | `"name"` | |
| `sortDir` | `"asc" \| "desc"` | `"asc"` | |
| `showFolderRail` | `boolean` | `true` | |
| `showDetails` | `boolean` | `true` | Detail panel on single-file selection. |
| `showHidden` | `boolean` | `false` | Reveal dotfiles. |
| `allowUpload` | `boolean` | `true` | Drag-drop + Add. |
| `allowDelete` | `boolean` | `true` | Delete / rename / move. |
| `undoWindowMs` | `number` | `5000` | Grace period to undo a delete; `0` = immediate. |
| `accent` | `string` | `"#a855f7"` | Selection / active / focus color. |
| `reducedMotion` | `boolean` | `false` | OR'd into the animation gates. |

## Theming

Surfaces use semantic CSS-variable tokens (`bg-panel`, `text-ink`,
`border-hairline`, `bg-accent`) so they follow light/dark automatically. In a
host app, define those tokens (or remap them) once; the `accent` prop is applied
as a scoped `--color-accent` override for just this component.

## Keyboard

`↵` open · `Backspace` up a folder · `Del` delete · `Esc` clear · `Ctrl/⌘+A`
select all · `Ctrl/⌘+X` cut · `Ctrl/⌘+V` paste · `F2` / double-click rename.
