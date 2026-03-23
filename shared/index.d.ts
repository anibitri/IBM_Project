declare module '@ar-viewer/shared' {
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
  export const DocumentProvider: React.FC<{ children: React.ReactNode }>;
  export function useDocumentContext(): any;
}
