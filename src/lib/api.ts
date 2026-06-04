import type {
  Flashcard,
  GenerateMode,
  Note,
  Progress,
  QuizDetail,
  QuizListItem,
  SavedGeneration,
  Subject,
  UploadRecord
} from "../types";

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: init?.body instanceof FormData ? init.headers : { "content-type": "application/json", ...init?.headers }
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
  }
  return data as T;
}

export const api = {
  async listSubjects() {
    return apiJson<{ subjects: Subject[] }>("/api/subjects");
  },
  async createSubject(input: { name: string; emoji: string; color: string; description: string }) {
    return apiJson<{ subject: Subject }>("/api/subjects", { method: "POST", body: JSON.stringify(input) });
  },
  async listNotes(subjectId?: string) {
    return apiJson<{ notes: Note[] }>(`/api/notes${subjectId ? `?subjectId=${encodeURIComponent(subjectId)}` : ""}`);
  },
  async getNote(id: string) {
    return apiJson<{ note: Note }>(`/api/notes/${id}`);
  },
  async createNote(input: { subjectId: string; title: string; body: string }) {
    return apiJson<{ note: Note }>("/api/notes", { method: "POST", body: JSON.stringify(input) });
  },
  async updateNote(id: string, input: { title: string; body: string; summary?: string }) {
    return apiJson<{ note: Note }>(`/api/notes/${id}`, { method: "PUT", body: JSON.stringify(input) });
  },
  async deleteNote(id: string) {
    return apiJson<{ ok: boolean }>(`/api/notes/${id}`, { method: "DELETE" });
  },
  async listUploads(params: { subjectId?: string; noteId?: string } = {}) {
    const search = new URLSearchParams();
    if (params.subjectId) search.set("subjectId", params.subjectId);
    if (params.noteId) search.set("noteId", params.noteId);
    return apiJson<{ uploads: UploadRecord[] }>(`/api/uploads${search.size ? `?${search}` : ""}`);
  },
  async uploadFile(file: File, params: { subjectId?: string; noteId?: string } = {}) {
    const form = new FormData();
    form.set("file", file);
    if (params.subjectId) form.set("subjectId", params.subjectId);
    if (params.noteId) form.set("noteId", params.noteId);
    return apiJson<{ upload: UploadRecord }>("/api/uploads", { method: "POST", body: form });
  },
  async listFlashcards(params: { subjectId?: string; noteId?: string } = {}) {
    const search = new URLSearchParams();
    if (params.subjectId) search.set("subjectId", params.subjectId);
    if (params.noteId) search.set("noteId", params.noteId);
    return apiJson<{ flashcards: Flashcard[] }>(`/api/flashcards${search.size ? `?${search}` : ""}`);
  },
  async updateFlashcardStatus(id: string, status: Flashcard["status"]) {
    return apiJson<{ ok: boolean }>(`/api/flashcards/${id}`, { method: "PUT", body: JSON.stringify({ status }) });
  },
  async listQuizzes(params: { subjectId?: string; noteId?: string } = {}) {
    const search = new URLSearchParams();
    if (params.subjectId) search.set("subjectId", params.subjectId);
    if (params.noteId) search.set("noteId", params.noteId);
    return apiJson<{ quizzes: QuizListItem[] }>(`/api/quizzes${search.size ? `?${search}` : ""}`);
  },
  async getQuiz(id: string) {
    return apiJson<{ quiz: QuizDetail }>(`/api/quizzes/${id}`);
  },
  async progress() {
    return apiJson<{ progress: Progress }>("/api/progress");
  },
  async recordAttempt(input: { kind: string; itemId: string; correct: boolean }) {
    return apiJson<{ ok: boolean }>("/api/review/attempts", { method: "POST", body: JSON.stringify(input) });
  }
};

export interface GenerateHandlers {
  onDelta?: (text: string) => void;
  onSaved?: (data: SavedGeneration) => void;
  onError?: (message: string) => void;
  onDone?: () => void;
}

export async function streamGenerate(
  payload: {
    mode: GenerateMode;
    subjectId?: string;
    noteId?: string;
    uploadId?: string;
    prompt?: string;
    noteBody?: string;
  },
  handlers: GenerateHandlers
) {
  const response = await fetch("/api/ai/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok || !response.body) {
    const data = await response.json().catch(() => ({ error: "AI request failed." }));
    throw new Error(data.error || "AI request failed.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const eventText of events) {
      const event = parseEvent(eventText);
      if (!event) continue;
      if (event.event === "delta") handlers.onDelta?.(event.data.text ?? "");
      if (event.event === "saved") handlers.onSaved?.(event.data as SavedGeneration);
      if (event.event === "error") handlers.onError?.(event.data.message ?? "AI generation failed.");
      if (event.event === "done") handlers.onDone?.();
    }
  }
}

function parseEvent(eventText: string) {
  const lines = eventText.split("\n");
  const event = lines.find((line) => line.startsWith("event:"))?.slice(6).trim();
  const data = lines.find((line) => line.startsWith("data:"))?.slice(5).trim();
  if (!event || !data) return null;
  return { event, data: JSON.parse(data) as Record<string, any> };
}

