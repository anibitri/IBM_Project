declare module '@ar-viewer/shared' {
  // ── API ──────────────────────────────────────────────────────────────────
  export const backend: {
    uploadFile: (file: any) => Promise<any>;
    analyzeVision: (storedName: string, task?: string) => Promise<any>;
    generateAR: (storedName: string, useVision?: boolean, hints?: string[]) => Promise<any>;
    askQuestion: (query: string, context: any, history?: any[]) => Promise<any>;
    chat: (query: string, context: any, history?: any[]) => Promise<any>;
    processDocument: (storedName: string, extractAR?: boolean, generateAISummary?: boolean) => Promise<any>;
    health: () => Promise<any>;
    setBaseURL: (url: string) => void;
  };

  // ── Context ───────────────────────────────────────────────────────────────
  export const DocumentProvider: React.FC<{ children: React.ReactNode }>;
  export function useDocumentContext(): any;

  // ── Utils: contextBuilder ─────────────────────────────────────────────────
  export function buildChatContext(document: any, pageIndex: number): any;
  export function buildComponentQuestion(component: any, connections: any[]): string;

  // ── Utils: sessionUtils ───────────────────────────────────────────────────
  export function makeSessionId(): string;
  export function deriveSessionName(document: any): string;

  // ── Utils: summaryUtils ───────────────────────────────────────────────────
  export function cleanSummary(raw: string): string;

  // ── Utils: dateUtils ──────────────────────────────────────────────────────
  export function timeAgo(ts: number): string;

  // ── Utils: urlResolver ────────────────────────────────────────────────────
  export function resolveBaseURL(): string;

  // ── Utils: constants ──────────────────────────────────────────────────────
  export const API_CONFIG: {
    MAX_FILE_SIZE: number;
    ALLOWED_EXTENSIONS: string[];
    DEFAULT_BACKEND_URL: string;
  };
  export const CHAT_CONFIG: {
    MAX_HISTORY_LENGTH: number;
    TYPING_INDICATOR_DELAY: number;
  };
  export const AR_CONFIG: {
    DEFAULT_BOX_COLOR: string;
    SELECTED_BOX_COLOR: string;
    BOX_STROKE_WIDTH: number;
  };
}
