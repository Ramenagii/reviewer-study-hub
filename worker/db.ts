import { HttpError } from "./http";
import { INIT_STATEMENTS } from "./schema";
import type { Env, Flashcard, Note, QuizDetail, QuizListItem, QuizQuestion, Subject, UploadRecord } from "./types";
import { nowIso, uid } from "./utils";

let schemaReady: Promise<void> | undefined;

type SubjectRow = {
  id: string;
  name: string;
  emoji: string;
  color: string;
  description: string;
  created_at: string;
  updated_at: string;
  note_count: number;
  flashcard_count: number;
  quiz_count: number;
  mastery: number | null;
};

type NoteRow = {
  id: string;
  subject_id: string;
  title: string;
  body: string;
  summary: string;
  created_at: string;
  updated_at: string;
  upload_count: number;
};

type UploadRow = {
  id: string;
  subject_id: string | null;
  note_id: string | null;
  filename: string;
  mime_type: string;
  size: number;
  r2_key: string;
  created_at: string;
};

type FlashcardRow = {
  id: string;
  note_id: string | null;
  subject_id: string;
  front: string;
  back: string;
  status: "new" | "learning" | "known";
  due_at: string;
  created_at: string;
  updated_at: string;
};

type QuizRow = {
  id: string;
  note_id: string | null;
  subject_id: string;
  title: string;
  question_count: number;
  created_at: string;
};

type QuizQuestionRow = {
  id: string;
  quiz_id: string;
  prompt: string;
  options_json: string;
  answer_index: number;
  explanation: string;
  created_at: string;
};

export async function ensureDatabase(env: Env) {
  if (!schemaReady) {
    schemaReady = (async () => {
      for (const statement of INIT_STATEMENTS) {
        await env.DB.prepare(statement).run();
      }
    })();
  }
  try {
    await schemaReady;
  } catch (error) {
    schemaReady = undefined;
    throw error;
  }
}

function subjectFromRow(row: SubjectRow): Subject {
  return {
    id: row.id,
    name: row.name,
    emoji: row.emoji,
    color: row.color,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    noteCount: Number(row.note_count ?? 0),
    flashcardCount: Number(row.flashcard_count ?? 0),
    quizCount: Number(row.quiz_count ?? 0),
    mastery: Number(row.mastery ?? 0)
  };
}

function noteFromRow(row: NoteRow): Note {
  return {
    id: row.id,
    subjectId: row.subject_id,
    title: row.title,
    body: row.body,
    summary: row.summary,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    uploadCount: Number(row.upload_count ?? 0)
  };
}

function uploadFromRow(row: UploadRow): UploadRecord {
  return {
    id: row.id,
    subjectId: row.subject_id,
    noteId: row.note_id,
    filename: row.filename,
    mimeType: row.mime_type,
    size: Number(row.size),
    r2Key: row.r2_key,
    createdAt: row.created_at
  };
}

function flashcardFromRow(row: FlashcardRow): Flashcard {
  return {
    id: row.id,
    noteId: row.note_id,
    subjectId: row.subject_id,
    front: row.front,
    back: row.back,
    status: row.status,
    dueAt: row.due_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function quizFromRow(row: QuizRow): QuizListItem {
  return {
    id: row.id,
    noteId: row.note_id,
    subjectId: row.subject_id,
    title: row.title,
    questionCount: Number(row.question_count ?? 0),
    createdAt: row.created_at
  };
}

function quizQuestionFromRow(row: QuizQuestionRow): QuizQuestion {
  return {
    id: row.id,
    quizId: row.quiz_id,
    prompt: row.prompt,
    options: JSON.parse(row.options_json) as string[],
    answerIndex: Number(row.answer_index),
    explanation: row.explanation,
    createdAt: row.created_at
  };
}

export async function listSubjects(env: Env) {
  const result = await env.DB.prepare(
    `SELECT
      s.*,
      (SELECT COUNT(*) FROM notes n WHERE n.subject_id = s.id) AS note_count,
      (SELECT COUNT(*) FROM flashcards f WHERE f.subject_id = s.id) AS flashcard_count,
      (SELECT COUNT(*) FROM quizzes q WHERE q.subject_id = s.id) AS quiz_count,
      (SELECT ROUND(100.0 * AVG(correct)) FROM review_attempts ra
        WHERE ra.item_id IN (
          SELECT id FROM flashcards WHERE subject_id = s.id
          UNION
          SELECT qq.id FROM quiz_questions qq
          JOIN quizzes q2 ON q2.id = qq.quiz_id
          WHERE q2.subject_id = s.id
        )
      ) AS mastery
    FROM subjects s
    ORDER BY CASE WHEN s.id = 'subj-cmpe309' THEN 0 ELSE 1 END, s.created_at ASC`
  ).all<SubjectRow>();
  return result.results.map(subjectFromRow);
}

export async function createSubject(env: Env, input: { name: string; emoji: string; color: string; description: string }) {
  const id = uid("subj");
  const timestamp = nowIso();
  await env.DB.prepare(
    `INSERT INTO subjects (id, name, emoji, color, description, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(id, input.name, input.emoji, input.color, input.description, timestamp, timestamp)
    .run();
  const subject = await getSubject(env, id);
  if (!subject) throw new HttpError(500, "Subject was not created.");
  return subject;
}

export async function getSubject(env: Env, id: string) {
  const row = await env.DB.prepare(
    `SELECT s.*, 0 AS note_count, 0 AS flashcard_count, 0 AS quiz_count, 0 AS mastery FROM subjects s WHERE id = ?`
  )
    .bind(id)
    .first<SubjectRow>();
  return row ? subjectFromRow(row) : null;
}

export async function listNotes(env: Env, subjectId?: string | null) {
  const sql = `SELECT n.*, (SELECT COUNT(*) FROM uploads u WHERE u.note_id = n.id) AS upload_count
    FROM notes n ${subjectId ? "WHERE n.subject_id = ?" : ""}
    ORDER BY n.updated_at DESC`;
  const statement = env.DB.prepare(sql);
  const result = subjectId ? await statement.bind(subjectId).all<NoteRow>() : await statement.all<NoteRow>();
  return result.results.map(noteFromRow);
}

export async function getNote(env: Env, id: string) {
  const row = await env.DB.prepare(
    `SELECT n.*, (SELECT COUNT(*) FROM uploads u WHERE u.note_id = n.id) AS upload_count
     FROM notes n WHERE n.id = ?`
  )
    .bind(id)
    .first<NoteRow>();
  return row ? noteFromRow(row) : null;
}

export async function createNote(env: Env, input: { subjectId: string; title: string; body: string }) {
  const subject = await getSubject(env, input.subjectId);
  if (!subject) throw new HttpError(404, "Subject not found.");
  const id = uid("note");
  const timestamp = nowIso();
  await env.DB.prepare(
    `INSERT INTO notes (id, subject_id, title, body, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(id, input.subjectId, input.title, input.body, timestamp, timestamp)
    .run();
  const note = await getNote(env, id);
  if (!note) throw new HttpError(500, "Note was not created.");
  return note;
}

export async function updateNote(env: Env, id: string, input: { title: string; body: string; summary?: string }) {
  const existing = await getNote(env, id);
  if (!existing) throw new HttpError(404, "Note not found.");
  await env.DB.prepare(
    `UPDATE notes SET title = ?, body = ?, summary = ?, updated_at = ? WHERE id = ?`
  )
    .bind(input.title, input.body, input.summary ?? existing.summary, nowIso(), id)
    .run();
  return getNote(env, id);
}

export async function updateNoteSummary(env: Env, id: string, summary: string) {
  await env.DB.prepare(`UPDATE notes SET summary = ?, updated_at = ? WHERE id = ?`)
    .bind(summary, nowIso(), id)
    .run();
}

export async function deleteNote(env: Env, id: string) {
  await env.DB.prepare(`DELETE FROM notes WHERE id = ?`).bind(id).run();
}

export async function createUploadRecord(
  env: Env,
  input: { subjectId: string | null; noteId: string | null; filename: string; mimeType: string; size: number; r2Key: string }
) {
  const id = uid("upl");
  const timestamp = nowIso();
  await env.DB.prepare(
    `INSERT INTO uploads (id, subject_id, note_id, filename, mime_type, size, r2_key, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(id, input.subjectId, input.noteId, input.filename, input.mimeType, input.size, input.r2Key, timestamp)
    .run();
  const upload = await getUpload(env, id);
  if (!upload) throw new HttpError(500, "Upload was not recorded.");
  return upload;
}

export async function listUploads(env: Env, params: { subjectId?: string | null; noteId?: string | null }) {
  const filters: string[] = [];
  const values: string[] = [];
  if (params.subjectId) {
    filters.push("subject_id = ?");
    values.push(params.subjectId);
  }
  if (params.noteId) {
    filters.push("note_id = ?");
    values.push(params.noteId);
  }
  const sql = `SELECT * FROM uploads ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""} ORDER BY created_at DESC`;
  const result = await env.DB.prepare(sql).bind(...values).all<UploadRow>();
  return result.results.map(uploadFromRow);
}

export async function getUpload(env: Env, id: string) {
  const row = await env.DB.prepare(`SELECT * FROM uploads WHERE id = ?`).bind(id).first<UploadRow>();
  return row ? uploadFromRow(row) : null;
}

export async function insertFlashcards(
  env: Env,
  input: { subjectId: string; noteId?: string | null; cards: Array<{ front: string; back: string }> }
) {
  const timestamp = nowIso();
  const cards: Flashcard[] = [];
  for (const card of input.cards) {
    const id = uid("card");
    await env.DB.prepare(
      `INSERT INTO flashcards (id, note_id, subject_id, front, back, status, due_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'new', ?, ?, ?)`
    )
      .bind(id, input.noteId ?? null, input.subjectId, card.front, card.back, timestamp, timestamp, timestamp)
      .run();
    const row = await env.DB.prepare(`SELECT * FROM flashcards WHERE id = ?`).bind(id).first<FlashcardRow>();
    if (row) cards.push(flashcardFromRow(row));
  }
  return cards;
}

export async function listFlashcards(env: Env, params: { subjectId?: string | null; noteId?: string | null }) {
  const filters: string[] = [];
  const values: string[] = [];
  if (params.subjectId) {
    filters.push("subject_id = ?");
    values.push(params.subjectId);
  }
  if (params.noteId) {
    filters.push("note_id = ?");
    values.push(params.noteId);
  }
  const sql = `SELECT * FROM flashcards ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""} ORDER BY created_at DESC`;
  const result = await env.DB.prepare(sql).bind(...values).all<FlashcardRow>();
  return result.results.map(flashcardFromRow);
}

export async function updateFlashcardStatus(env: Env, id: string, status: Flashcard["status"]) {
  await env.DB.prepare(`UPDATE flashcards SET status = ?, updated_at = ? WHERE id = ?`)
    .bind(status, nowIso(), id)
    .run();
}

export async function insertQuiz(
  env: Env,
  input: {
    subjectId: string;
    noteId?: string | null;
    title: string;
    questions: Array<{ prompt: string; options: string[]; answerIndex: number; explanation: string }>;
  }
) {
  const quizId = uid("quiz");
  const timestamp = nowIso();
  await env.DB.prepare(`INSERT INTO quizzes (id, note_id, subject_id, title, created_at) VALUES (?, ?, ?, ?, ?)`)
    .bind(quizId, input.noteId ?? null, input.subjectId, input.title, timestamp)
    .run();
  for (const question of input.questions) {
    await env.DB.prepare(
      `INSERT INTO quiz_questions (id, quiz_id, prompt, options_json, answer_index, explanation, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(uid("qq"), quizId, question.prompt, JSON.stringify(question.options), question.answerIndex, question.explanation, timestamp)
      .run();
  }
  const quiz = await getQuiz(env, quizId);
  if (!quiz) throw new HttpError(500, "Quiz was not created.");
  return quiz;
}

export async function listQuizzes(env: Env, params: { subjectId?: string | null; noteId?: string | null }) {
  const filters: string[] = [];
  const values: string[] = [];
  if (params.subjectId) {
    filters.push("q.subject_id = ?");
    values.push(params.subjectId);
  }
  if (params.noteId) {
    filters.push("q.note_id = ?");
    values.push(params.noteId);
  }
  const result = await env.DB.prepare(
    `SELECT q.*, COUNT(qq.id) AS question_count
     FROM quizzes q
     LEFT JOIN quiz_questions qq ON qq.quiz_id = q.id
     ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}
     GROUP BY q.id
     ORDER BY q.created_at DESC`
  )
    .bind(...values)
    .all<QuizRow>();
  return result.results.map(quizFromRow);
}

export async function getQuiz(env: Env, id: string): Promise<QuizDetail | null> {
  const row = await env.DB.prepare(
    `SELECT q.*, COUNT(qq.id) AS question_count
     FROM quizzes q
     LEFT JOIN quiz_questions qq ON qq.quiz_id = q.id
     WHERE q.id = ?
     GROUP BY q.id`
  )
    .bind(id)
    .first<QuizRow>();
  if (!row) return null;
  const questions = await env.DB.prepare(`SELECT * FROM quiz_questions WHERE quiz_id = ? ORDER BY created_at ASC`)
    .bind(id)
    .all<QuizQuestionRow>();
  return { ...quizFromRow(row), questions: questions.results.map(quizQuestionFromRow) };
}

export async function recordAttempt(env: Env, input: { kind: string; itemId: string; correct: boolean }) {
  await env.DB.prepare(`INSERT INTO review_attempts (id, kind, item_id, correct, created_at) VALUES (?, ?, ?, ?, ?)`)
    .bind(uid("att"), input.kind, input.itemId, input.correct ? 1 : 0, nowIso())
    .run();
}

export async function getProgress(env: Env) {
  const row = await env.DB.prepare(
    `SELECT
      (SELECT COUNT(*) FROM subjects) AS subjects,
      (SELECT COUNT(*) FROM notes) AS notes,
      (SELECT COUNT(*) FROM uploads) AS uploads,
      (SELECT COUNT(*) FROM flashcards) AS flashcards,
      (SELECT COUNT(*) FROM quizzes) AS quizzes,
      (SELECT COUNT(*) FROM review_attempts) AS attempts,
      (SELECT COALESCE(ROUND(100.0 * AVG(correct)), 0) FROM review_attempts) AS mastery`
  ).first<{
    subjects: number;
    notes: number;
    uploads: number;
    flashcards: number;
    quizzes: number;
    attempts: number;
    mastery: number;
  }>();
  return {
    subjects: Number(row?.subjects ?? 0),
    notes: Number(row?.notes ?? 0),
    uploads: Number(row?.uploads ?? 0),
    flashcards: Number(row?.flashcards ?? 0),
    quizzes: Number(row?.quizzes ?? 0),
    attempts: Number(row?.attempts ?? 0),
    mastery: Number(row?.mastery ?? 0)
  };
}
