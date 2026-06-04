CREATE TABLE IF NOT EXISTS subjects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '📚',
  color TEXT NOT NULL DEFAULT '#3b82f6',
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS uploads (
  id TEXT PRIMARY KEY,
  subject_id TEXT,
  note_id TEXT,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  r2_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE SET NULL,
  FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS flashcards (
  id TEXT PRIMARY KEY,
  note_id TEXT,
  subject_id TEXT NOT NULL,
  front TEXT NOT NULL,
  back TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  due_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE SET NULL,
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS quizzes (
  id TEXT PRIMARY KEY,
  note_id TEXT,
  subject_id TEXT NOT NULL,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE SET NULL,
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS quiz_questions (
  id TEXT PRIMARY KEY,
  quiz_id TEXT NOT NULL,
  prompt TEXT NOT NULL,
  options_json TEXT NOT NULL,
  answer_index INTEGER NOT NULL,
  explanation TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS review_attempts (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  item_id TEXT NOT NULL,
  correct INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notes_subject_id ON notes(subject_id);
CREATE INDEX IF NOT EXISTS idx_uploads_subject_id ON uploads(subject_id);
CREATE INDEX IF NOT EXISTS idx_uploads_note_id ON uploads(note_id);
CREATE INDEX IF NOT EXISTS idx_flashcards_subject_id ON flashcards(subject_id);
CREATE INDEX IF NOT EXISTS idx_quizzes_subject_id ON quizzes(subject_id);
CREATE INDEX IF NOT EXISTS idx_quiz_questions_quiz_id ON quiz_questions(quiz_id);
CREATE INDEX IF NOT EXISTS idx_review_attempts_item_id ON review_attempts(item_id);

INSERT OR IGNORE INTO subjects (id, name, emoji, color, description) VALUES
  ('subj-cmpe309', 'CMPE 309', '💻', '#0ea5e9', 'Midterm practice questions and computer engineering review.'),
  ('subj-biology', 'Biology', '🧬', '#10b981', 'Cells, systems, genetics, ecology, and lab review.'),
  ('subj-chemistry', 'Chemistry', '⚗️', '#f97316', 'Equations, reactions, structures, and problem drills.'),
  ('subj-math', 'Mathematics', '∑', '#6366f1', 'Formulas, proofs, practice sets, and recall checks.'),
  ('subj-history', 'History', '🏛️', '#eab308', 'Timelines, causes, effects, people, and source notes.'),
  ('subj-english', 'English', '✍️', '#ef4444', 'Literature, writing, vocabulary, and essay prep.');
