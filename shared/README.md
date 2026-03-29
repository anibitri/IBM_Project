# @ar-viewer/shared

Shared library consumed by both the web (`@ar-viewer/web`) and mobile (`@ar-viewer/mobile`) frontends. It provides the backend API client, the web React document context, and a set of pure utility functions. Neither frontend duplicates any of this logic — they import it from here.

> **Note:** The mobile app has its own `MobileDocumentContext.js` that extends this shape with mobile-specific features (`attachDocumentToSession`, stub sessions, mock backend support, `accessibilitySettings`). The shared `DocumentContext` is used by the web frontend only.

---

## Package structure

```
shared/
├── api/
│   └── backend.js            # Axios HTTP client for all backend endpoints
├── context/
│   └── DocumentContext.jsx   # Web React context (document state, chat, sessions)
├── utils/
│   ├── constants.js          # Shared configuration constants
│   ├── contextBuilder.js     # Builds AI context payloads sent to the backend
│   ├── dateUtils.js          # Relative time formatting (timeAgo)
│   ├── sessionUtils.js       # Session ID generation and name derivation
│   ├── summaryUtils.js       # Strips prompt artefacts from AI summary text
│   └── urlResolver.js        # Resolves the correct backend base URL per runtime
├── index.js                  # Barrel export — everything public is re-exported here
└── index.d.ts                # TypeScript type declarations
```

---

## How consumers import this package

Both frontends declare this package as a workspace dependency:

```json
"@ar-viewer/shared": "*"
```

They then import from the package name — never from deep paths:

```js
import { backend, useDocumentContext, cleanSummary, timeAgo, makeSessionId } from '@ar-viewer/shared';
```

The root `package.json` workspace configuration links the package without any publish step.

---

## Module reference

### `api/backend.js`

Axios instance with a base URL resolved at runtime by `urlResolver`. All requests include a `Authorization: Bearer ibm-project-dev-token` header and an `ngrok-skip-browser-warning` header for tunnel debugging.

An error-normalisation interceptor on responses transforms HTTP error responses and network errors into consistent `Error` objects with human-readable messages before they reach any caller.

**Exposed methods:**

| Method | Endpoint | Description |
|---|---|---|
| `uploadFile(file)` | `POST /api/upload/` | Uploads a file (image or PDF). Handles both browser `File` objects and React Native URI-based file descriptors. Returns `{ file: { stored_name, url, original_name, ... } }` |
| `processDocument(storedName, extractAR, generateAISummary)` | `POST /api/process/document` | Runs vision analysis, AR component extraction, and AI summary generation in a single call |
| `analyzeVision(storedName, task)` | `POST /api/vision/analyze` | Runs vision-only analysis for a stored file; `task` defaults to `'general_analysis'` |
| `generateAR(storedName, useVision, hints)` | `POST /api/ar/generate` | Generates AR component bounding boxes, optionally using vision hints |
| `askQuestion(query, context, history)` | `POST /api/ai/ask` | Sends a chat message with document context; returns `{ answer }` |
| `chat(query, context, history)` | `POST /api/ai/chat` | Alias of `askQuestion` for conversational flow |
| `health()` | `GET /api/health` | Returns `{ status, mode, models }` from the backend health endpoint |
| `setBaseURL(url)` | — | Overrides the base URL at runtime (used in mobile for tunnel/device switching) |

---

### `context/DocumentContext.jsx`

The **web** document state provider. Wrap the app with `<DocumentProvider>` and read state anywhere with `useDocumentContext()`.

**State shape:**

```js
{
  document: {
    storedName,
    file: { original_name, stored_name, type, size, url },
    images: [{ image_filename, url, page_number, ... }],
    ar: { components: [...], connections: [...], relationships: { ... } },
    ai_summary, full_text, text_excerpt,
    vision: { analysis: { ... } },
    sessionId, sessionName,
  },
  loading,           // boolean — true during upload/process/ask
  error,             // string | null — last error message
  chatHistory,       // Array<{ role: 'user'|'assistant', content: string }>
  recentSessions,    // up to 20 sessions, persisted to localStorage
  pendingQuestion,   // string | null — pre-filled when user clicks "Ask about this"
  selectedComponent, // object | null — component clicked in the diagram
  currentImageIndex, // number — active page for PDFs (-1 = whole document scope)
}
```

**Key actions:**

| Action | Description |
|---|---|
| `uploadAndProcess(file)` | Uploads, processes, and sets the active document |
| `askQuestion(query)` | Appends user message, calls backend, appends assistant reply |
| `askAboutComponent(comp)` | Generates a question string and sets `pendingQuestion` |
| `addMessage(role, content)` | Directly appends a message to `chatHistory` |
| `consumePendingQuestion()` | Returns and clears `pendingQuestion` |
| `restoreSession(session)` | Restores a previous session's document and chat history |
| `removeSession(id)` / `renameSession(id, name)` | Session management |
| `clearDocument()` / `clearChat()` / `clearError()` | State reset helpers |
| `startNewChat()` | Saves current session and starts a fresh one |
| `clearAllHistory()` | Removes all saved sessions |

Sessions are serialised to `localStorage` under the key `ar-viewer-history` (max 20 sessions) so they survive page refresh.

---

### `utils/contextBuilder.js`

Pure functions that build the structured payload the backend expects.

- **`buildChatContext(document, pageIndex)`** — returns an object with the AI summary, detected components, connections, and (for PDFs) the current page's specific data scoped by `pageIndex`. Used in both `DocumentContext.jsx` (web) and `MobileDocumentContext.js` (mobile).
- **`buildComponentQuestion(component, connections)`** — generates a natural-language question string for a selected component, including its type, description, and named connections.

---

### `utils/urlResolver.js`

Determines the correct base URL depending on where the code is running:

| Environment | Resolved to |
|---|---|
| Browser (web) | `/api` — relative, proxied by Vite dev server to `localhost:4200` |
| Android emulator | `http://10.0.2.2:4200/api` — loopback bridge to host machine |
| iOS simulator | `http://localhost:4200/api` |
| iOS physical device | `http://{IOS_USB_HOST}:4200/api` — set `PHYSICAL_DEVICE = true` at top of file |
| Tunnel (ngrok/cloudflare) | `${TUNNEL_URL}/api` — takes priority when `TUNNEL_URL` is set |

Edit `TUNNEL_URL` and `PHYSICAL_DEVICE` at the top of the file when testing on a real device.

---

### `utils/summaryUtils.js`

- **`cleanSummary(raw)`** — strips known prompt instruction fragments that occasionally leak into the beginning of AI-generated summaries (e.g. `"Summary:"`, `"Analysis:"`, `"Provide a clear, structured analysis:"`). Returns `'No summary available'` for falsy input.

Used by `web/DiagramPanel.jsx` (summary drawer) and `web/Sidebar.jsx` (session title extraction).

---

### `utils/sessionUtils.js`

- **`makeSessionId()`** — generates a unique session identifier in `timestamp-randomhex` format.
- **`deriveSessionName(document)`** — attempts to extract a meaningful short name (max 50 chars, whole words) from the AI summary; falls back to the original filename.

---

### `utils/dateUtils.js`

- **`timeAgo(ts)`** — converts a Unix timestamp (ms) to a human-readable relative string: `"Just now"`, `"5m ago"`, `"3h ago"`, `"2d ago"`, or a locale date for older entries.

Used by `web/Sidebar.jsx`, `mobile/ChatScreen.js`, and `mobile/HomeScreen.js`.

---

### `utils/constants.js`

Shared configuration values:

```js
API_CONFIG.MAX_FILE_SIZE           // 50 MB
API_CONFIG.ALLOWED_EXTENSIONS      // ['.png', '.jpg', '.jpeg', '.pdf']
API_CONFIG.DEFAULT_BACKEND_URL     // 'http://localhost:4200/api'

CHAT_CONFIG.MAX_HISTORY_LENGTH     // 10 messages sent as context window
CHAT_CONFIG.TYPING_INDICATOR_DELAY // 500 ms

AR_CONFIG.DEFAULT_BOX_COLOR        // '#0080ff'
AR_CONFIG.SELECTED_BOX_COLOR       // '#00ff00'
AR_CONFIG.BOX_STROKE_WIDTH         // 3
```

---

## Data flow

```
User action (upload / ask / click component)
        │
        ▼
  Frontend context
  (DocumentContext / MobileDocumentContext)
        │
        ├── buildChatContext()        ← contextBuilder.js
        ├── buildComponentQuestion()  ← contextBuilder.js
        │
        ▼
  backend.js  ──────────────────────► Flask backend (port 4200)
        │                              POST /api/upload/
        │                              POST /api/process/document
        │                              POST /api/ai/ask
        │                              GET  /api/health
        │
        │  ◄── error normalisation interceptor (all error paths)
        ▼
  Response stored in context state
        │
        ▼
  Components re-render from context
```
