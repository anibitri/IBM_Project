# AR Diagram Viewer - Monorepo

AI-powered technical diagram analysis with AR overlays and chat interface.

## Project Structure

- **backend/** - Flask API with AI models
- **shared/** - Shared code for web and mobile
- **web/** - React web application
- **mobile/** - React Native mobile app (Expo)

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Start Backend
```bash
cd backend
pip install -r requirements.txt
python run.py
```

Backend runs on http://localhost:4200

### 3. Start Web Frontend
```bash
cd web
npm start
```

Web runs on http://localhost:3000

### 4. Start Mobile App
```bash
cd mobile
npx expo start
```

Scan QR code with Expo Go app

## Development
```bash
# Install all dependencies
npm run install:all

# Start web + backend
npm run dev:web

# Start mobile + backend
npm run dev:mobile

# Build web for production
npm run build:web

# Run backend tests
npm run test:backend
```

## Tech Stack

- **Backend**: Flask, PyTorch, Transformers, SAM
- **Web**: React 18, Axios
- **Mobile**: React Native (Expo), React Navigation
- **Shared**: React Context API