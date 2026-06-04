export interface Env {
  DB: D1Database;
  UPLOADS: R2Bucket;
  ASSETS: Fetcher;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
}

export interface Subject {
  id: string;
  name: string;
  emoji: string;
  color: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  noteCount: number;
  flashcardCount: number;
  quizCount: number;
  mastery: number;
}

export interface Note {
  id: string;
  subjectId: string;
  title: string;
  body: string;
  summary: string;
  createdAt: string;
  updatedAt: string;
  uploadCount: number;
}

export interface UploadRecord {
  id: string;
  subjectId: string | null;
  noteId: string | null;
  filename: string;
  mimeType: string;
  size: number;
  r2Key: string;
  createdAt: string;
}

export interface Flashcard {
  id: string;
  noteId: string | null;
  subjectId: string;
  front: string;
  back: string;
  status: "new" | "learning" | "known";
  dueAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface QuizListItem {
  id: string;
  noteId: string | null;
  subjectId: string;
  title: string;
  questionCount: number;
  createdAt: string;
}

export interface QuizQuestion {
  id: string;
  quizId: string;
  prompt: string;
  options: string[];
  answerIndex: number;
  explanation: string;
  createdAt: string;
}

export interface QuizDetail extends QuizListItem {
  questions: QuizQuestion[];
}

export type GenerateMode = "tutor" | "summary" | "flashcards" | "quiz";

export interface GenerateRequest {
  mode: GenerateMode;
  subjectId?: string;
  noteId?: string;
  uploadId?: string;
  prompt?: string;
  noteBody?: string;
}

export interface SavedGeneration {
  mode: GenerateMode;
  summary?: string;
  flashcards?: Flashcard[];
  quiz?: QuizDetail;
}

