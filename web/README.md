# @ar-viewer/web

React web frontend for the AR Diagram Viewer. Upload a technical diagram (image or PDF), get AI-powered component detection, browse components with AR overlays, and ask questions through an AI chat interface.

---

## Running the app

**Prerequisites:** Node.js 18+, the backend running on port 4200.

```bash
# From the repo root (installs all workspaces including shared)
npm install

# Start the Vite dev server
cd web
npm run dev
```

The app is available at **http://localhost:5173**.

Other commands:

```bash
npm run build    # Production build → dist/
npm run preview  # Serve the production build locally
```

---

## Package structure

```
web/src/
├── main.jsx                      # Entry point — mounts DocumentProvider + App, ErrorBoundary
├── App.jsx                       # Root layout: Sidebar (left) + MainView (right)
├── styles/App.css                # Global styles
│
├── components/
│   ├── MainView.jsx              # Switches between WelcomeScreen and WorkspaceView
│   ├── WelcomeScreen.jsx         # Drag-and-drop / click-to-upload UI
│   ├── WorkspaceView.jsx         # Multi-panel workspace (Diagram | Chat | Document | Info)
│   ├── Sidebar.jsx               # Session history, component list, session rename
│   ├── DiagramPanel.jsx          # 2D/3D diagram view with AR component overlays
│   ├── ChatPanel.jsx             # AI chat interface with markdown rendering
│   ├── DocumentBrowserPanel.jsx  # Raw document viewer (PDF iframe or image)
│   ├── DocumentInfoPanel.jsx     # File metadata and analysis statistics
│   ├── ARDiagramViewer.jsx       # 3D AR visualisation (React Three Fiber / Three.js)
│   └── markdownUtils.jsx         # Markdown → JSX renderer for chat messages
│
├── hooks/
│   ├── useDiagramControls.js     # Zoom, pan, 2D/3D mode, label toggle state
│   ├── useSummaryDrawer.js       # Collapsible/resizable AI summary drawer
│   ├── useAutoScroll.js          # Scrolls chat to bottom on new messages
│   └── usePanelManager.js        # Panel visibility — enforces ≥1 open, auto-opens chat
│
└── mocks/
    └── ARMockPage.jsx            # Standalone AR preview page (dev tool, hash #mock-ar)
```

---

## Architecture overview

`main.jsx` boots the app, wraps it in `DocumentProvider` (from `@ar-viewer/shared`), and includes a top-level `ErrorBoundary` that catches render errors and shows a red error screen with a stack trace. It also routes the hash `#mock-ar` or path `/mock-ar` to the `ARMockPage` dev tool.

`App.jsx` renders `Sidebar` (left, collapsible) and `MainView` (right), with `isSidebarOpen` state kept at the root.

`MainView.jsx` shows `WelcomeScreen` when no document is loaded and `WorkspaceView` once a document is active.

---

## Component responsibilities

### `WelcomeScreen.jsx`

Accepts drag-and-drop or click-to-browse file uploads (PNG, JPG, JPEG, PDF, max 50 MB). Calls `uploadAndProcess()` from context and shows an animated progress indicator while the backend processes the file.

### `WorkspaceView.jsx`

Orchestrates up to four panels side by side: **Diagram**, **Chat**, **Document**, **Info**. A `PANELS` array defines each panel's `id`, label, and icon — adding a new panel only requires adding an entry here and a matching `case` in the render switch. Uses `usePanelManager` to:
- Enforce at least one panel always open.
- Auto-open the Chat panel when a `pendingQuestion` arrives.

### `DiagramPanel.jsx`

The primary view once a document is loaded.

- Renders the uploaded image with an SVG overlay of detected component bounding boxes.
- Uses `useDiagramControls` for zoom (0.25–3.0×, mouse wheel), pan (click-drag), 2D/3D toggle, and label visibility.
- Switches to `ARDiagramViewer` (React Three Fiber) for 3D mode.
- For multi-page PDFs, shows page navigation controls and scopes the overlay to the current page.
- Collapsible AI summary drawer at the bottom with a drag handle for resizing (60–500 px), managed by `useSummaryDrawer`.

### `ChatPanel.jsx`

AI chat interface.

- Renders `chatHistory` as user/assistant message bubbles with full markdown support via `markdownUtils.jsx`.
- Auto-submits `pendingQuestion` (set when user clicks "Ask about this component" in the sidebar).
- Chat failures show an inline error message in the chat rather than a banner.
- Uses `useAutoScroll` to keep the latest message visible.

### `DocumentBrowserPanel.jsx`

Displays the original uploaded file. PDFs are rendered in an `<iframe>` using the file URL; images use an `<img>` tag. Falls back to the stored filename if the display name is not available.

### `DocumentInfoPanel.jsx`

Shows file metadata and analysis statistics in a structured view:
- **File details** — name, type, size, page count.
- **Analysis stats** — component count, connection count, average detection confidence.
- **Component list** — scrollable cards with individual confidence percentages.

### `Sidebar.jsx`

Persistent left panel.

- **Current session** — document title (derived from AI summary via `cleanSummary`), component count, page info.
- **Component list** — clickable cards with confidence scores and an "Ask about this" button that triggers `askAboutComponent()`, setting `pendingQuestion` and auto-opening chat.
- **Recent sessions** — restore, rename (inline edit), or delete. Timestamps use `timeAgo` from shared. Sessions persist to `localStorage` under `ar-viewer-history` (max 20).

### `ARDiagramViewer.jsx`

3D AR visualisation built with React Three Fiber and `@react-three/drei`. Renders the diagram as a texture on a 3D plane with component bounding boxes extruded into 3D boxes. Activated from `DiagramPanel` when the user toggles 3D mode.

### `markdownUtils.jsx`

Converts raw markdown strings from the AI assistant into React JSX elements. Handles headings, bold/italic, inline code, code blocks, lists, and paragraphs without a runtime markdown parser dependency.

---

## Custom hooks

| Hook | What it isolates |
|---|---|
| `useDiagramControls` | Zoom state (0.25–3.0×), pan offset, mouse-wheel handler, drag-to-pan handler, `wasClick()` guard that distinguishes a click from a drag, 2D/3D mode toggle, label visibility |
| `useSummaryDrawer` | Drawer open/close toggle, height state (60–500 px), drag handle mouse-down resize handler with document-level event listeners |
| `useAutoScroll` | Single `useEffect` that scrolls a ref into view whenever its dependency array changes |
| `usePanelManager` | Active panel array, `togglePanel` (enforces ≥1 open), auto-open effect when `pendingQuestion` is set |

---

## State management

All document-related state lives in `DocumentContext` (from `@ar-viewer/shared`). Components read it via `useDocumentContext()`. No prop drilling — any component can read or trigger actions directly.

```
DocumentProvider  (shared/context/DocumentContext.jsx)
  │
  ├── document          current loaded document + AR data + AI summary
  ├── chatHistory       array of { role, content } messages
  ├── recentSessions    up to 20 sessions, persisted to localStorage
  ├── selectedComponent component clicked in the diagram
  ├── currentImageIndex active page for PDFs (-1 = whole document scope)
  └── error             last error string, cleared by clearError()
```

---

## Communication with the backend

All HTTP calls go through `backend` from `@ar-viewer/shared/api/backend.js`. The Vite dev server proxies `/api` → `http://localhost:4200` so there are no CORS issues during development. In production, configure your reverse proxy to forward `/api` to the Flask server.

```
WelcomeScreen → uploadAndProcess()
  → backend.uploadFile()           POST /api/upload/
  → backend.processDocument()      POST /api/process/document

ChatPanel → askQuestion()
  → backend.askQuestion()          POST /api/ai/ask

(no SettingsScreen in web — backend health is mobile-only)
  → backend.health()               GET  /api/health
```

The context builds the payload for `/api/ai/ask` using `buildChatContext()` from `@ar-viewer/shared/utils/contextBuilder`, which scopes the context to the current page for multi-page PDFs.

---

## Key dependencies

| Package | Purpose |
|---|---|
| `react`, `react-dom` | UI framework |
| `vite` | Dev server and production bundler |
| `@react-three/fiber`, `@react-three/drei`, `three` | 3D/AR diagram visualisation |
| `@use-gesture/react` | Gesture handling for 3D view |
| `zustand` | Lightweight state (used internally by drei) |

---

## Adding a new panel

1. Create `web/src/components/MyPanel.jsx`.
2. Add an entry to the `PANELS` array in `WorkspaceView.jsx` with an `id`, `label`, and icon SVG.
3. Add a `case 'my-panel': return <MyPanel />;` in the `PanelContent` switch.

No changes needed in `usePanelManager` — it works with any panel IDs dynamically.
