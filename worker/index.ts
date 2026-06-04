import {
  createNote,
  createSubject,
  createUploadRecord,
  deleteNote,
  ensureDatabase,
  getNote,
  getProgress,
  getQuiz,
  listFlashcards,
  listNotes,
  listQuizzes,
  listSubjects,
  listUploads,
  recordAttempt,
  updateFlashcardStatus,
  updateNote
} from "./db";
import { streamAiGeneration } from "./ai";
import { assertString, HttpError, json, optionalString, problem, readJson } from "./http";
import type { Env, Flashcard, GenerateRequest } from "./types";
import { safeFileName, uid, validateUpload } from "./utils";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204 });
      }
      if (url.pathname.startsWith("/api/")) {
        await ensureDatabase(env);
        return await handleApi(request, env, url);
      }
      return env.ASSETS.fetch(request);
    } catch (error) {
      if (error instanceof HttpError) {
        return problem(error.status, error.message, error.details);
      }
      const message = error instanceof Error ? error.message : "Unexpected server error.";
      return problem(500, message);
    }
  }
};

async function handleApi(request: Request, env: Env, url: URL) {
  const { pathname } = url;
  const method = request.method.toUpperCase();

  if (pathname === "/api/health") {
    return json({ ok: true, time: new Date().toISOString() });
  }

  if (pathname === "/api/subjects" && method === "GET") {
    return json({ subjects: await listSubjects(env) });
  }

  if (pathname === "/api/subjects" && method === "POST") {
    const body = await readJson<Record<string, unknown>>(request);
    const subject = await createSubject(env, {
      name: assertString(body.name, "name", 80),
      emoji: optionalString(body.emoji, 4) || "📚",
      color: optionalString(body.color, 16) || "#3b82f6",
      description: optionalString(body.description, 220)
    });
    return json({ subject }, { status: 201 });
  }

  if (pathname === "/api/notes" && method === "GET") {
    return json({ notes: await listNotes(env, url.searchParams.get("subjectId")) });
  }

  if (pathname === "/api/notes" && method === "POST") {
    const body = await readJson<Record<string, unknown>>(request);
    const note = await createNote(env, {
      subjectId: assertString(body.subjectId, "subjectId", 100),
      title: assertString(body.title, "title", 140),
      body: optionalString(body.body, 60_000)
    });
    return json({ note }, { status: 201 });
  }

  const noteMatch = pathname.match(/^\/api\/notes\/([^/]+)$/);
  if (noteMatch && method === "GET") {
    const note = await getNote(env, noteMatch[1]);
    if (!note) throw new HttpError(404, "Note not found.");
    return json({ note });
  }

  if (noteMatch && method === "PUT") {
    const body = await readJson<Record<string, unknown>>(request);
    const note = await updateNote(env, noteMatch[1], {
      title: assertString(body.title, "title", 140),
      body: optionalString(body.body, 60_000),
      summary: optionalString(body.summary, 20_000)
    });
    return json({ note });
  }

  if (noteMatch && method === "DELETE") {
    await deleteNote(env, noteMatch[1]);
    return json({ ok: true });
  }

  if (pathname === "/api/uploads" && method === "GET") {
    return json({
      uploads: await listUploads(env, {
        subjectId: url.searchParams.get("subjectId"),
        noteId: url.searchParams.get("noteId")
      })
    });
  }

  if (pathname === "/api/uploads" && method === "POST") {
    return handleUpload(request, env);
  }

  if (pathname === "/api/flashcards" && method === "GET") {
    return json({
      flashcards: await listFlashcards(env, {
        subjectId: url.searchParams.get("subjectId"),
        noteId: url.searchParams.get("noteId")
      })
    });
  }

  const cardMatch = pathname.match(/^\/api\/flashcards\/([^/]+)$/);
  if (cardMatch && method === "PUT") {
    const body = await readJson<Record<string, unknown>>(request);
    const status = assertString(body.status, "status", 20) as Flashcard["status"];
    if (!["new", "learning", "known"].includes(status)) throw new HttpError(400, "Invalid flashcard status.");
    await updateFlashcardStatus(env, cardMatch[1], status);
    return json({ ok: true });
  }

  if (pathname === "/api/quizzes" && method === "GET") {
    return json({
      quizzes: await listQuizzes(env, {
        subjectId: url.searchParams.get("subjectId"),
        noteId: url.searchParams.get("noteId")
      })
    });
  }

  const quizMatch = pathname.match(/^\/api\/quizzes\/([^/]+)$/);
  if (quizMatch && method === "GET") {
    const quiz = await getQuiz(env, quizMatch[1]);
    if (!quiz) throw new HttpError(404, "Quiz not found.");
    return json({ quiz });
  }

  if (pathname === "/api/review/attempts" && method === "POST") {
    const body = await readJson<Record<string, unknown>>(request);
    await recordAttempt(env, {
      kind: assertString(body.kind, "kind", 24),
      itemId: assertString(body.itemId, "itemId", 100),
      correct: Boolean(body.correct)
    });
    return json({ ok: true }, { status: 201 });
  }

  if (pathname === "/api/progress" && method === "GET") {
    return json({ progress: await getProgress(env) });
  }

  if (pathname === "/api/ai/generate" && method === "POST") {
    const body = await readJson<GenerateRequest>(request);
    return streamAiGeneration(env, body);
  }

  return problem(404, "API route not found.");
}

async function handleUpload(request: Request, env: Env) {
  const form = await request.formData();
  const fileValue = form.get("file") as unknown;
  if (!isUploadFile(fileValue)) {
    throw new HttpError(400, "file is required.");
  }
  const file = fileValue;
  validateUpload(file);

  const subjectId = stringOrNull(form.get("subjectId"));
  const noteId = stringOrNull(form.get("noteId"));
  const filename = safeFileName(file.name);
  const key = `${subjectId ?? "general"}/${Date.now()}-${uid("file")}-${filename}`;
  await env.UPLOADS.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
    customMetadata: { filename }
  });

  const upload = await createUploadRecord(env, {
    subjectId,
    noteId,
    filename,
    mimeType: file.type,
    size: file.size,
    r2Key: key
  });

  return json({ upload }, { status: 201 });
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isUploadFile(value: unknown): value is {
  name: string;
  type: string;
  size: number;
  stream: () => ReadableStream;
} {
  return (
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    "type" in value &&
    "size" in value &&
    "stream" in value &&
    typeof (value as { name?: unknown }).name === "string" &&
    typeof (value as { type?: unknown }).type === "string" &&
    typeof (value as { size?: unknown }).size === "number" &&
    typeof (value as { stream?: unknown }).stream === "function"
  );
}
