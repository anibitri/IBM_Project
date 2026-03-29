# @ar-viewer/mobile

React Native mobile app for the AR Diagram Viewer. Upload or photograph a technical diagram, view AI-detected components with AR overlays, navigate multi-page documents, and ask questions through a conversational AI interface — all on device.

---

## Running the app

**Prerequisites:** Node.js 18+, the backend running and reachable from your device/emulator (see [Backend URL](#backend-url) below).

```bash
# From the repo root (installs all workspaces including shared)
npm install

# Start the Metro bundler
cd mobile
npm start

# In a separate terminal — run on a connected device or emulator
npm run android    # Android device / emulator
npm run ios        # iOS device / simulator (macOS only)
```

### Android setup

- Install [Android Studio](https://developer.android.com/studio) and create an emulator (API 31+).
- Or connect a physical device with USB debugging enabled.
- Run `npm run android` — Metro and the app install automatically.

### iOS setup (macOS only)

- Install Xcode 15+ from the App Store.
- Install CocoaPods: `sudo gem install cocoapods`
- Install native dependencies: `cd mobile/ios && pod install`
- Run `npm run ios` or open `mobile/ios/ARViewer.xcworkspace` in Xcode.

### Backend URL

Edit `shared/utils/urlResolver.js` to point to your backend:

| Scenario | What to change |
|---|---|
| Android emulator → host machine | Default `10.0.2.2:4200` works out of the box |
| iOS simulator → host machine | Default `localhost:4200` works out of the box |
| Physical device (USB) | Set `IOS_USB_HOST` and `PHYSICAL_DEVICE = true` in `urlResolver.js` |
| Physical device (remote) | Set `TUNNEL_URL` to your ngrok/cloudflare URL in `urlResolver.js` |

---

## Package structure

```
mobile/src/
├── navigation/
│   └── AppNavigator.js           # Bottom tab navigator + nested stack navigators
│
├── context/
│   └── MobileDocumentContext.js  # All document/chat/session state for the app
│
├── screens/
│   ├── HomeScreen.js             # Landing page — recent sessions, upload & demo CTAs
│   ├── UploadScreen.js           # File picker (gallery / camera / file browser)
│   ├── DiagramScreen.js          # Main diagram viewer — document/diagram/AR modes
│   ├── ComponentScreen.js        # Searchable, sortable component list
│   ├── ChatScreen.js             # AI chat with session history drawer
│   └── SettingsScreen.js         # Dark mode toggle, backend health check, app info
│
├── components/
│   ├── AROverlay.js              # SVG bounding boxes + labels drawn over a diagram image
│   ├── CameraARView.js           # Live camera feed with real-time AR overlay tracking
│   ├── DiagramAskSheet.js        # Animated bottom sheet — scoped AI question presets
│   ├── ComponentCard.js          # Single component list item (label, confidence, description)
│   ├── FlowAnimation.js          # SVG animated particles for connection visualisation
│   ├── ChatMessage.js            # Single chat message bubble with TTS listen button
│   └── LoadingSpinner.js         # Reusable loading indicator
│
├── hooks/
│   ├── useHealthCheck.js         # Backend /api/health fetch with loading/error state
│   ├── useSessionDrawer.js       # Animated slide-in session history drawer
│   └── useTTS.js                 # Text-to-speech lifecycle (speak / stop)
│
├── styles/
│   └── theme.js                  # getPalette(darkMode) — all colour and spacing tokens
│
└── mocks/
    ├── mockBackend.js            # Local mock responses (used when backend is unreachable)
    └── ARMockScreen.js           # Dev-only AR preview screen (accessible via "ARMock" route)
```

---

## Navigation structure

```
Tab Navigator
├── Home  (HomeStack)
│   ├── HomeMain      → HomeScreen
│   ├── Upload        → UploadScreen   (also accepts attachMode param from ChatStack)
│   ├── Diagram       → DiagramScreen
│   ├── Components    → ComponentScreen
│   ├── AR            → ARScreen (Viro, loaded with try/catch — fails gracefully)
│   └── ARMock        → ARMockScreen (dev preview)
│
├── Chat  (ChatStack)
│   └── ChatMain      → ChatScreen
│
└── Settings (SettingsStack)
    └── SettingsMain  → SettingsScreen
```

`AppNavigator.js` reads `accessibilitySettings.darkMode` from context to apply a matching React Navigation theme (`DarkTheme` / `DefaultTheme`).

**Cross-stack navigation:** ChatScreen navigates to the Upload screen (which lives in HomeStack) using `navigation.getParent()?.navigate('Home', { screen: 'Upload', params: { attachMode: true } })`.

---

## Screen responsibilities

### `HomeScreen.js`

Landing screen. Shows recent sessions as restore-able cards with timestamps formatted by `timeAgo` from shared. Provides entry points for uploading a new diagram, loading a built-in demo (served from `mockBackend` — no network call required), and starting the live AR camera mode.

### `UploadScreen.js`

Uses `react-native-document-picker` and `react-native-image-picker` to let the user pick a file from the gallery, take a photo with the camera, or browse the file system (images and PDFs).

Supports two modes controlled by the `attachMode` route param:

| Mode | Triggered by | Behaviour |
|---|---|---|
| Normal upload | HomeScreen → Upload | Calls `uploadAndProcess()`, navigates to DiagramScreen |
| Attach to session | ChatScreen → Upload (attachMode: true) | Calls `attachDocumentToSession()`, returns to ChatScreen preserving session |

If processing fails, an `Alert.alert()` is shown and the preview is cleared. The error banner is never shown inline on this screen.

### `DiagramScreen.js`

The core screen. Three view modes toggled by a tab bar:

- **Document** — vertically scrollable card list, one card per page, each with a "View Diagram" button.
- **Diagram** — the selected page image rendered with `AROverlay` SVG bounding boxes. Supports pinch-to-zoom and drag-to-pan via `react-native-gesture-handler`.
- **AR Camera** — opens `CameraARView` with live tracking.

**Fullscreen mode:** tapping the expand icon enters a fullscreen `Modal` where the diagram fills the screen. Inside fullscreen, `react-native-reanimated` and `react-native-gesture-handler` (`Gesture.Pinch`, `Gesture.Pan`, `Gesture.Simultaneous`) handle pinch-to-zoom and pan gestures. The fullscreen toolbar provides:
- Zoom percentage display and reset
- Zoom In / Zoom Out buttons
- Labels toggle
- Ask AI — opens `DiagramAskSheet`; submitting a question closes the fullscreen modal and navigates directly to ChatScreen.

**Camera stability:** `CameraARView` is rendered as an absolute overlay outside the `ScrollView`, so the native Camera component is never moved in the React tree (which would cause an AVFoundation session interruption on iOS).

For single-image documents the Document tab is hidden and the Diagram view is shown directly.

### `ComponentScreen.js`

Lists all AR-detected components for the current document. Supports text search and sorting by label, confidence, or position. Tapping a component navigates back to `DiagramScreen` with that component selected and highlighted.

### `ChatScreen.js`

Full-screen chat interface.

- **Message bubbles** — user messages right-aligned, assistant messages left-aligned with an avatar.
- **TTS** — each assistant message has a Listen/Stop button powered by `useTTS`.
- **Session history drawer** — animated slide-in panel (`useSessionDrawer`, `DRAWER_WIDTH = 78%`) shows all recent sessions with restore, rename (long-press → modal), and delete actions.
- **Page-scope chips** — appear for multi-page PDFs so the user can scope questions to a specific page.
- **No-document chat** — a session can be started without any uploaded file. The empty state shows "Ask me anything" and an "Attach Diagram" button. Asking a question in this state auto-creates a stub session in history.
- **Attach diagram mid-session** — if a session has no document, the `+` button and the top-right header button both navigate to UploadScreen in attach mode, which uploads a document and returns to the same session with chat history preserved.
- **Error handling** — if a question fails, an inline `⚠️ Failed to get a response` message is appended to the chat instead of showing an error banner.
- **Keyboard** — `keyboardDismissMode="on-drag"` on the message list; tapping the empty state dismisses the keyboard.

### `SettingsScreen.js`

- Dark mode toggle stored in `accessibilitySettings` in context; all screens re-render with the new palette immediately.
- Backend health check via `useHealthCheck` — renders a status badge, mode badge, and per-model load rows.

---

## State management

All state lives in `MobileDocumentContext` — screens read it via `useMobileDocumentContext()`. There is no prop drilling.

```
MobileDocumentProvider  (context/MobileDocumentContext.js)
  │
  ├── document              loaded document — file info, AR data, AI summary, images[]
  ├── loading               boolean — true during upload/process/ask
  ├── error                 string | null — last error message
  ├── chatHistory           array of { role, content }
  ├── recentSessions        up to 30 sessions (in-memory, cleared on app restart)
  ├── pendingQuestion       string | null — pre-filled from DiagramAskSheet
  ├── selectedComponent     component tapped in DiagramScreen
  ├── currentImageIndex     active page for PDFs (-1 = whole document scope)
  ├── isMultiPage           computed — true when document.images.length > 1
  └── accessibilitySettings { darkMode: boolean }
```

### Stub sessions (no-document chat)

A session where `document.file === null` and `document.storedName === null` is a stub session. It lets the user chat with the AI without uploading anything. The history drawer shows "No diagram" for these sessions, and the attach diagram flow upgrades a stub session to a full one via `attachDocumentToSession`.

### Key context actions

| Action | Description |
|---|---|
| `uploadAndProcess(file)` | Uploads and processes a new document, resets session |
| `attachDocumentToSession(file)` | Uploads and processes a document while preserving the current session ID, name, and chat history |
| `askQuestion(query)` | Appends user message, calls backend, appends assistant reply; auto-creates a stub session if none exists |
| `startNewChat()` | Saves current session, creates a new stub session with an auto-incremented name ("New Chat", "New Chat 2", …) |
| `addMessage(role, content)` | Directly appends a message to `chatHistory` (used for inline error messages) |
| `askAboutComponent(comp)` | Generates a question string and sets `pendingQuestion` |
| `restoreSession(session)` | Restores a previous session's document snapshot and chat history |
| `removeSession(id)` / `renameSession(id, name)` | Session management |
| `clearDocument()` / `clearChat()` / `clearError()` | State reset helpers |
| `setDarkMode(value)` | Updates `accessibilitySettings.darkMode` |
| `clearAllHistory()` | Removes all saved sessions |

### Mock backend

Set `USE_MOCK_BACKEND = true` at the top of `MobileDocumentContext.js` to route all API calls to `mockBackend.js` locally. Useful for UI development without a running server.

---

## Components

### `AROverlay.js`

Pure SVG component that draws bounding boxes and labels over the diagram image. Accepts the component list, image dimensions, and the currently selected component ID. Scales box coordinates from the original image size to the rendered display size.

### `CameraARView.js`

Wraps `react-native-vision-camera` with a live AR overlay. Renders as a flat view (no Modal wrapper) so it can be positioned as an absolute overlay in `DiagramScreen` without being moved in the React tree. Includes real-time component tracking and an AR overlay drawn on top of the camera feed.

### `DiagramAskSheet.js`

Animated bottom sheet for asking AI questions in context. Features:

- **Three scope tabs:** Component, Diagram, Document — controls which context is sent with the question.
- **Preset questions** — 3 presets per scope (9 total), e.g. "What does this component do?", "Summarise the diagram architecture", "What technologies are used?".
- **Context display** — shows the current component label, page number, or "Entire document" depending on active scope.
- **Text input** — free-text input with 400-character limit alongside the presets.
- **Animation** — spring slide-in (damping: 22, stiffness: 220) with keyboard avoidance.
- **Component tab disabled** when no component is selected.
- When a question is submitted from within the fullscreen diagram modal, the sheet close callback also closes the fullscreen and resets zoom before navigating to ChatScreen.

### `ChatMessage.js`

Single chat bubble with role-based alignment. Assistant messages include a Listen/Stop button wired to `useTTS`.

### `FlowAnimation.js`

SVG animated particles that travel along connection lines between components, visualising data flow in the diagram view.

---

## Custom hooks

| Hook | What it manages |
|---|---|
| `useSessionDrawer` | `Animated.Value`, spring open, timing close; exports `DRAWER_WIDTH` constant (78% of screen width) |
| `useTTS` | `react-native-tts` init, `tts-finish`/`tts-cancel` event listeners, speak/stop with `speakingIndex` tracking; gracefully no-ops if TTS is unavailable |
| `useHealthCheck` | `backend.health()` call, loading/error/data states; handles missing backend module gracefully |

---

## Theming

`styles/theme.js` exports `getPalette(darkMode: boolean)` which returns a full colour token object:

```js
{
  bg, cardAbs, cardSoftAbs,   // backgrounds
  text, subtext, muted,        // text colours
  primary, primaryGlass,       // accent
  border, borderTop,           // borders
  error,                       // error red
}
```

Every screen and component calls `getPalette` at the top and passes `p.*` values to inline styles. Switching dark mode in Settings updates the context and causes all active screens to re-render with the new palette immediately.

---

## Data flow

```
User action (upload / attach / ask / tap component)
        │
        ▼
  MobileDocumentContext
        │
        ├─ uploadAndProcess / attachDocumentToSession
        │       │
        │       ├── backend.uploadFile()           POST /api/upload/
        │       └── backend.processDocument()      POST /api/process/document
        │
        ├─ askQuestion
        │       │
        │       ├── buildChatContext()  ← shared/utils/contextBuilder.js
        │       └── backend.askQuestion()           POST /api/ai/ask
        │
        └─ (error) → Alert.alert() for upload failures
                   → addMessage('assistant', '⚠️ …') for chat failures
        │
        ▼
  State updated → screens re-render via useMobileDocumentContext()
```

---

## Key dependencies

| Package | Purpose |
|---|---|
| `react-native` | Core mobile framework |
| `@react-navigation/native`, `@react-navigation/bottom-tabs`, `@react-navigation/native-stack` | Navigation |
| `react-native-gesture-handler` | Pinch/pan gesture detection (fullscreen diagram) |
| `react-native-reanimated` (v3) | Animated gestures and transitions |
| `react-native-vision-camera` (v3) | Live camera feed for AR mode |
| `react-native-document-picker` | File browser for PDF/image selection |
| `react-native-image-picker` | Gallery and camera photo picker |
| `react-native-tts` | Text-to-speech for chat messages |
| `react-native-pdf` | PDF page rendering |
| `react-native-vector-icons` | Ionicons throughout the UI |
| `react-native-safe-area-context` | Safe area insets for notches and home indicators |
| `@reactvision/react-viro` | 3D/AR scene rendering (ARScreen) |
| `@react-native-async-storage/async-storage` | Persistent storage |

---

## Required permissions

### Android (`android/app/src/main/AndroidManifest.xml`)
- `READ_EXTERNAL_STORAGE` / `READ_MEDIA_IMAGES` — file picker
- `CAMERA` — live AR camera mode
- `INTERNET` — backend API calls

### iOS (`ios/ARViewer/Info.plist`)
- `NSCameraUsageDescription` — live AR camera mode
- `NSPhotoLibraryUsageDescription` — image picker from gallery
