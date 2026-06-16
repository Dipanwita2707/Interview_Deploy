import { create } from 'zustand';

export interface EditorState {
  language: string;
  languageId: number;
  code: string;
  theme: 'vs-dark' | 'light';

  // Actions
  setLanguage: (language: string, languageId: number) => void;
  setCode: (code: string) => void;
  setTheme: (theme: 'vs-dark' | 'light') => void;
  resetEditor: (defaults?: { language?: string; languageId?: number; code?: string }) => void;
}

const DEFAULT_LANGUAGE = 'python';
const DEFAULT_LANGUAGE_ID = 71; // Judge0 Python 3 ID

export const useEditorStore = create<EditorState>((set) => ({
  language: DEFAULT_LANGUAGE,
  languageId: DEFAULT_LANGUAGE_ID,
  code: '',
  theme: 'vs-dark',

  setLanguage: (language, languageId) => set({ language, languageId }),
  setCode: (code) => set({ code }),
  setTheme: (theme) => set({ theme }),
  resetEditor: (defaults) =>
    set({
      language: defaults?.language ?? DEFAULT_LANGUAGE,
      languageId: defaults?.languageId ?? DEFAULT_LANGUAGE_ID,
      code: defaults?.code ?? '',
    }),
}));

// Language map for Monaco ↔ Judge0
export const LANGUAGES = [
  { name: 'Python 3', monacoId: 'python', judge0Id: 71 },
  { name: 'JavaScript', monacoId: 'javascript', judge0Id: 63 },
  { name: 'TypeScript', monacoId: 'typescript', judge0Id: 74 },
  { name: 'Java', monacoId: 'java', judge0Id: 62 },
  { name: 'C++', monacoId: 'cpp', judge0Id: 54 },
  { name: 'C', monacoId: 'c', judge0Id: 50 },
  { name: 'Go', monacoId: 'go', judge0Id: 60 },
  { name: 'Rust', monacoId: 'rust', judge0Id: 73 },
  { name: 'Ruby', monacoId: 'ruby', judge0Id: 72 },
  { name: 'C#', monacoId: 'csharp', judge0Id: 51 },
] as const;
