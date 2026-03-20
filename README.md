# IBM AR Diagram Viewer

AI-powered technical diagram analysis with augmented reality overlays, component detection, and an AI chat interface. Built around IBM's **granite-vision-3.3-2b** model and integrated with the **IBM OpenTelemetry → Instana** observability pipeline.

---

## Architecture

```
Web / Mobile Frontend
        │
        ▼
shared/api/backend.js  (Axios client, bearer-token auth)
        │
        ▼
Flask Backend  (port 4200)
   ├── /api/upload        → preprocess_service  (PDF → images, resize)
   ├── /api/vision        → granite_vision_service  (image analysis)
   ├── /api/ar            → ar_service  (MobileSAM component detection)
   ├── /api/ai            → granite_ai_service  (chat / Q&A)
   └── /api/process       → orchestrates vision + AR + AI together
        │
        ▼
AI Models
   ├── granite-vision-3.3-2b  (vision analysis + text chat)
   └── MobileSAM  (component segmentation for AR overlays)
        │
        ▼ (OpenTelemetry traces)
OTel Collector (port 4317/4318)
        │
        ├── Jaeger  (local trace UI — http://localhost:16686)
        └── Instana Agent  (production observability)
```

---

## Project Structure

```
IBM_Project/
├── backend/                    # Flask API server
│   ├── run.py                  # Entry point — runs on 0.0.0.0:4200
│   └── app/
│       ├── app.py              # Flask factory + OTel instrumentation
│       ├── requirements.txt    # Python dependencies
│       ├── routes/             # API route handlers
│       ├── services/           # AI, vision, AR, preprocessing services
│       └── tests/              # Pytest test suite
├── web/                        # React + Vite web app (port 3000/5173)
├── mobile/                     # React Native (Expo) mobile app
├── shared/                     # Shared API client + context used by web & mobile
│   └── api/backend.js          # Axios client — auto-selects correct base URL
├── otel-collector-config.yaml  # OTel Collector pipeline config
├── docker-compose.otel.yml     # Docker Compose: OTel Collector + Jaeger
└── package.json                # Root npm workspace
```

---

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Python | 3.10+ | Backend |
| Node.js | 18+ | Web + Mobile |
| npm | 9+ | Package manager |
| Docker | any | OTel Collector + Jaeger (optional) |
| Xcode | 14+ | iOS simulator (macOS only) |
| Android Studio | any | Android emulator (optional) |

**Hardware:** The AI models require significant RAM. On Apple Silicon (MPS), the vision model runs on CPU using ~10 GB of system RAM. A GPU with 8+ GB VRAM is recommended for production use.

---

## Quick Start

### 1. Install All Dependencies

```bash
# Root (installs web + mobile + shared via npm workspaces)
npm install

# Backend Python dependencies
cd backend
pip install -r app/requirements.txt
```

### 2. Start the Backend

```bash
cd backend
python run.py
```

Backend starts on `http://localhost:4200`. First run downloads the AI models from Hugging Face (~5 GB). Subsequent starts load from the local cache.

> **No GPU / testing without models:** set `GRANITE_MOCK=1` before starting.
> The backend returns IBM OTel-aware mock responses and skips model loading entirely.
>
> ```bash
> GRANITE_MOCK=1 python run.py
> ```

### 3. Start the Web Frontend

```bash
cd web
npm run dev          # Vite dev server — http://localhost:5173
# or
npm start            # same (alias)
```

All `/api/*` requests are automatically proxied by Vite to `http://localhost:4200`.

### 4. Start the Mobile App

```bash
cd mobile
npx react-native start          # Terminal 3: Metro bundler

# In a separate terminal — builds and opens in simulator:
npx react-native run-ios        # iOS simulator
npx react-native run-android    # Android emulator
```

---

## Running Everything at Once

Open **4 terminals** and keep them all running:

| Terminal | Command | What It Does |
|----------|---------|--------------|
| 1 | `cd backend && python run.py` | Flask API on port 4200 |
| 2 | `cd web && npm run dev` | Vite dev server on port 5173 |
| 3 | `cd mobile && npx react-native start` | Metro JS bundler on port 8081 |
| 4 | `cd mobile && npx react-native run-ios` | Builds + opens iOS simulator (one time) |

**Start Terminal 1 first** — wait for `* Running on http://0.0.0.0:4200` before starting the others.

### Network Routing

```
Browser  ─── localhost:5173 (Vite) ──proxy──► localhost:4200 (Flask)
iOS Sim  ──────────────────────────────────► localhost:4200 (Flask)
Android  ──────────────────────────────────► 10.0.2.2:4200  (Flask)
```

### Physical iPhone / iPad

The device must be on the **same WiFi network** as your Mac.

1. Find your Mac's LAN IP:
   ```bash
   ipconfig getifaddr en0    # e.g. 192.168.1.45
   ```

2. Edit `shared/api/backend.js` — update the iOS fallback URL:
   ```js
   // line 20 — change localhost to your Mac's LAN IP
   return 'http://192.168.1.45:4200/api';
   ```

3. Start Metro with the LAN IP:
   ```bash
   npx react-native start --host 192.168.1.45
   ```

---

## API Reference

All requests require the header:
```
Authorization: Bearer ibm-project-dev-token
```

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/upload/` | Upload a diagram image or PDF |
| `POST` | `/api/vision/analyze` | Run vision analysis on an uploaded file |
| `POST` | `/api/ar/generate` | Generate AR component overlays |
| `POST` | `/api/ai/ask` | Ask a question about a diagram |
| `POST` | `/api/ai/chat` | Conversational AI chat |
| `POST` | `/api/process/document` | Full pipeline: vision + AR + AI summary |
| `GET` | `/api/health` | Health check (no auth required) |
| `GET` | `/api/ai/health` | AI model status |

---

## OpenTelemetry Configuration

The backend emits traces for every request. These can be routed to a local collector, Jaeger, or IBM Instana.

### Option A — Local collector + Jaeger (no Instana needed)

Start the OTel Collector and Jaeger with Docker Compose:

```bash
docker compose -f docker-compose.otel.yml up -d
```

Then open the Jaeger UI at **http://localhost:16686** to view traces.

To enable the Jaeger exporter, edit `otel-collector-config.yaml`:

```yaml
exporters:
  debug:
    verbosity: normal

  otlp/jaeger:            # ← uncomment this block
    endpoint: jaeger:4317
    tls:
      insecure: true

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [batch]
      exporters: [debug, otlp/jaeger]   # ← add otlp/jaeger here
```

Restart the collector after saving:

```bash
docker compose -f docker-compose.otel.yml restart otel-collector
```

### Option B — IBM Instana

1. Install and start the Instana agent on the host (or Kubernetes node).

2. Edit `otel-collector-config.yaml` — add the Instana exporter:

```yaml
exporters:
  debug:
    verbosity: normal

  otlp/instana:           # ← uncomment and set your agent host
    endpoint: http://<instana-agent-host>:4317
    tls:
      insecure: true

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [batch]
      exporters: [debug, otlp/instana]  # ← add otlp/instana here
```

3. Set the collector endpoint when starting the backend:

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317 python run.py
```

The default endpoint is already `http://localhost:4317`, so this is only needed if the collector runs on a different host.

### Option C — Send directly to Instana (no collector)

If your Instana agent exposes OTLP directly on port 4317:

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=http://<instana-agent-host>:4317 python run.py
```

### OTel Collector Ports

| Port | Protocol | Purpose |
|------|----------|---------|
| `4317` | gRPC | OTLP traces from Flask backend |
| `4318` | HTTP | OTLP traces (alternative) |
| `8888` | HTTP | Collector internal metrics |
| `16686` | HTTP | Jaeger UI (if Jaeger is running) |

### What Is Traced

The OTel instrumentation (in `app/app.py`) automatically creates spans for:
- Every HTTP request (method, route, status code, request ID)
- AI/vision model inference calls
- File uploads and preprocessing

If the OTel packages are not installed or the collector is unreachable, the backend continues to operate normally — traces are silently dropped via `BatchSpanProcessor`'s background thread.

---

## Backend Tests

```bash
cd backend

# Run all tests (real models — requires GPU/CPU with ~10 GB RAM)
pytest tests/ -v

# Run without loading models (fast — uses mock responses)
GRANITE_MOCK=1 pytest tests/ -v

# Run a specific test file
GRANITE_MOCK=1 pytest tests/test_health_security.py -v
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend API | Flask 3.0, Python 3.10+ |
| Vision + Chat | IBM `granite-vision-3.3-2b` (LLaVA-Next architecture) |
| AR Segmentation | MobileSAM via Ultralytics |
| ML Runtime | PyTorch, HuggingFace Transformers, Accelerate |
| Web Frontend | React 19, Vite, Three.js, Zustand |
| Mobile Frontend | React Native 0.75, Expo, React Navigation |
| Shared | Axios API client, React Context |
| Observability | OpenTelemetry SDK, OTel Collector, Jaeger, IBM Instana |
| Auth | Static bearer token (`ibm-project-dev-token`) |

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GRANITE_MOCK` | `0` | Set to `1` to skip model loading and use canned responses |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:4317` | OTLP endpoint for trace export |
| `FLASK_ENV` | `development` | Flask environment |
| `HF_HOME` | (system default) | Override Hugging Face model cache directory |
