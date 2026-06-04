import {
  BarChart3,
  BookOpen,
  Brain,
  CalendarDays,
  Check,
  ChevronLeft,
  ClipboardCheck,
  FileText,
  Gauge,
  Home,
  Layers3,
  Loader2,
  NotebookPen,
  Plus,
  RefreshCw,
  Rocket,
  Sparkles,
  Target,
  Trash2,
  UploadCloud,
  X
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, NavLink, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { AiPanel } from "./components/AiPanel";
import { UploadPanel } from "./components/UploadPanel";
import { api, streamGenerate } from "./lib/api";
import type { Flashcard, GenerateMode, Note, Progress, QuizDetail, QuizListItem, Subject, UploadRecord } from "./types";

const SUBJECT_COLORS = ["#10b981", "#6366f1", "#f97316", "#ef4444", "#0ea5e9", "#eab308"];

export default function App() {
  return (
    <div className="appShell">
      <aside className="sidebar" aria-label="Main navigation">
        <Link to="/" className="brand">
          <span className="brandMark">R</span>
          <span>
            <strong>Reviewer</strong>
            <small>Local beta</small>
          </span>
        </Link>
        <nav>
          <NavLink to="/" end>
            <Home size={18} />
            Dashboard
          </NavLink>
          <NavLink to="/review/subj-cmpe309">
            <Brain size={18} />
            Review
          </NavLink>
        </nav>
        <div className="sidebarNote">
          <span className="sidebarPulse" aria-hidden="true" />
          <span>
            <strong>CMPE 309</strong>
            <small>Answer-key deck ready</small>
          </span>
        </div>
      </aside>
      <main className="mainSurface">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/subjects/:subjectId" element={<SubjectPage />} />
          <Route path="/notes/:noteId" element={<NotePage />} />
          <Route path="/review/:deckId" element={<ReviewPage />} />
          <Route path="/quiz/:quizId" element={<QuizPage />} />
        </Routes>
      </main>
    </div>
  );
}

function Dashboard() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [uploads, setUploads] = useState<UploadRecord[]>([]);
  const [quizzes, setQuizzes] = useState<QuizListItem[]>([]);
  const [quickSubjectId, setQuickSubjectId] = useState("");
  const [subjectName, setSubjectName] = useState("");
  const [subjectEmoji, setSubjectEmoji] = useState("📘");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    const [subjectData, noteData, progressData, uploadData, quizData] = await Promise.all([
      api.listSubjects(),
      api.listNotes(),
      api.progress(),
      api.listUploads(),
      api.listQuizzes()
    ]);
    setSubjects(subjectData.subjects);
    setNotes(noteData.notes);
    setProgress(progressData.progress);
    setUploads(uploadData.uploads);
    setQuizzes(quizData.quizzes);
    setQuickSubjectId((current) => current || subjectData.subjects[0]?.id || "");
    setLoading(false);
  }

  useEffect(() => {
    load().catch((error) => {
      setMessage(error instanceof Error ? error.message : "Could not load dashboard.");
      setLoading(false);
    });
  }, []);

  async function addSubject(event: FormEvent) {
    event.preventDefault();
    if (!subjectName.trim()) return;
    const color = SUBJECT_COLORS[subjects.length % SUBJECT_COLORS.length];
    const { subject } = await api.createSubject({
      name: subjectName,
      emoji: subjectEmoji || "📘",
      color,
      description: "Custom review space"
    });
    setSubjects((value) => [...value, subject]);
    setQuickSubjectId(subject.id);
    setSubjectName("");
    setSubjectEmoji("📘");
  }

  const queueCount = subjects.reduce((total, subject) => total + subject.flashcardCount, 0);
  const focusSubject = subjects[0];
  const focusNote = focusSubject ? notes.find((note) => note.subjectId === focusSubject.id) : undefined;
  const focusQuiz = focusSubject ? quizzes.find((quiz) => quiz.subjectId === focusSubject.id) : undefined;

  return (
    <div className="page">
      <header className="topbar">
        <div>
          <p className="eyebrow">Study workspace</p>
          <h1>Today&apos;s review desk</h1>
        </div>
        <button className="ghostButton" type="button" onClick={() => load()} disabled={loading}>
          {loading ? <Loader2 className="spin" size={17} /> : <RefreshCw size={17} />}
          Refresh
        </button>
      </header>

      {message ? <p className="errorText">{message}</p> : null}
      <FocusBand subject={focusSubject} note={focusNote} quiz={focusQuiz} progress={progress} />

      <section className="statsGrid" aria-label="Study progress">
        <Stat icon={<BookOpen size={18} />} label="Notes" value={progress?.notes ?? 0} detail="source library" />
        <Stat icon={<Brain size={18} />} label="Cards" value={progress?.flashcards ?? 0} detail={`${queueCount} in queue`} />
        <Stat icon={<ClipboardCheck size={18} />} label="Quizzes" value={progress?.quizzes ?? 0} detail="answer-key sets" />
        <Stat icon={<BarChart3 size={18} />} label="Mastery" value={`${progress?.mastery ?? 0}%`} detail={`${progress?.attempts ?? 0} attempts`} />
      </section>

      <section className="dashboardGrid">
        <div className="widePanel">
          <div className="sectionHeader">
            <div>
              <h2>Subjects</h2>
              <p>{subjects.length} spaces ready</p>
            </div>
            <form className="inlineForm" onSubmit={addSubject}>
              <input value={subjectEmoji} onChange={(event) => setSubjectEmoji(event.target.value)} aria-label="Emoji" maxLength={4} />
              <input value={subjectName} onChange={(event) => setSubjectName(event.target.value)} placeholder="New subject" />
              <button className="iconButton" aria-label="Add subject">
                <Plus size={18} />
              </button>
            </form>
          </div>
          <div className="subjectGrid">
            {subjects.map((subject) => (
              <Link to={`/subjects/${subject.id}`} className="subjectTile" key={subject.id} style={{ "--accent": subject.color } as React.CSSProperties}>
                <span className="subjectEmoji">{subject.emoji}</span>
                <strong>{subject.name}</strong>
                <small>{subject.noteCount} notes</small>
                <div className="subjectMeter" aria-label={`${subject.name} mastery ${subject.mastery}%`}>
                  <span style={{ width: `${Math.max(6, subject.mastery)}%` }} />
                </div>
                <div className="tileMeta">
                  <span>{subject.flashcardCount} cards</span>
                  <span>{subject.quizCount} quizzes</span>
                </div>
              </Link>
            ))}
          </div>
        </div>

        <AiPanel subjects={subjects} uploads={uploads} onSaved={() => load()} />
      </section>

      <section className="dashboardGrid bottom">
        <div className="panel">
          <div className="sectionHeader">
            <div>
              <h2>Quick upload</h2>
              <p>Attach source material to a subject</p>
            </div>
            <select value={quickSubjectId} onChange={(event) => setQuickSubjectId(event.target.value)} aria-label="Upload subject">
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name}
                </option>
              ))}
            </select>
          </div>
          <UploadPanel subjectId={quickSubjectId} onUploaded={() => load()} />
        </div>

        <div className="panel">
          <div className="sectionHeader">
            <div>
              <h2>Recent notes</h2>
              <p>{notes.length ? "Latest edits" : "No notes yet"}</p>
            </div>
            <span className="queueBadge">{queueCount} review cards</span>
          </div>
          <div className="noteList">
            {notes.slice(0, 6).map((note) => (
              <Link to={`/notes/${note.id}`} className="noteRow" key={note.id}>
                <FileText size={18} />
                <span>
                  <strong>{note.title}</strong>
                  <small>{formatDate(note.updatedAt)}</small>
                </span>
              </Link>
            ))}
            {!notes.length ? <EmptyState icon={<NotebookPen size={24} />} title="Start with a note" /> : null}
          </div>
        </div>
      </section>
    </div>
  );
}

function SubjectPage() {
  const { subjectId = "" } = useParams();
  const navigate = useNavigate();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [quizzes, setQuizzes] = useState<QuizListItem[]>([]);
  const [uploads, setUploads] = useState<UploadRecord[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    const [subjectData, noteData, cardData, quizData, uploadData] = await Promise.all([
      api.listSubjects(),
      api.listNotes(subjectId),
      api.listFlashcards({ subjectId }),
      api.listQuizzes({ subjectId }),
      api.listUploads({ subjectId })
    ]);
    setSubjects(subjectData.subjects);
    setNotes(noteData.notes);
    setCards(cardData.flashcards);
    setQuizzes(quizData.quizzes);
    setUploads(uploadData.uploads);
  }

  useEffect(() => {
    load().catch((error) => setMessage(error instanceof Error ? error.message : "Could not load subject."));
  }, [subjectId]);

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    const { note } = await api.createNote({ subjectId, title, body });
    navigate(`/notes/${note.id}`);
  }

  const subject = subjects.find((item) => item.id === subjectId);

  return (
    <div className="page">
      <BackLink to="/" label="Dashboard" />
      <header className="subjectHero" style={{ "--accent": subject?.color ?? "#6366f1" } as React.CSSProperties}>
        <span className="subjectEmoji large">{subject?.emoji ?? "📚"}</span>
        <div>
          <p className="eyebrow">Subject</p>
          <h1>{subject?.name ?? "Subject"}</h1>
          <p>{subject?.description ?? "Review space"}</p>
        </div>
        <div className="heroStats" aria-label="Subject resources">
          <span>{notes.length} notes</span>
          <span>{cards.length} cards</span>
          <span>{quizzes.length} quizzes</span>
          <span>{uploads.length} files</span>
        </div>
        <Link className="primaryButton heroAction" to={`/review/${subjectId}`}>
          <Brain size={18} />
          Review cards
        </Link>
      </header>

      {message ? <p className="errorText">{message}</p> : null}

      <section className="dashboardGrid">
        <div className="widePanel">
          <div className="sectionHeader">
            <div>
              <h2>Notes</h2>
              <p>{notes.length} saved</p>
            </div>
          </div>
          <form className="noteComposer" onSubmit={create}>
            <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Note title" />
            <textarea value={body} onChange={(event) => setBody(event.target.value)} rows={5} placeholder="Paste lecture notes, textbook points, or reminders..." />
            <button className="primaryButton">
              <Plus size={18} />
              Create note
            </button>
          </form>
          <div className="noteList gridRows">
            {notes.map((note) => (
              <Link to={`/notes/${note.id}`} className="noteRow" key={note.id}>
                <FileText size={18} />
                <span>
                  <strong>{note.title}</strong>
                  <small>{note.uploadCount} files attached</small>
                </span>
              </Link>
            ))}
            {!notes.length ? <EmptyState icon={<NotebookPen size={24} />} title="No notes in this subject" /> : null}
          </div>
        </div>

        <div className="panel stackPanel">
          <UploadPanel subjectId={subjectId} onUploaded={() => load()} />
          <AiPanel subjects={subjects} activeSubjectId={subjectId} uploads={uploads} onSaved={() => load()} />
        </div>
      </section>

      <section className="dashboardGrid bottom">
        <ResourcePanel
          title="Flashcards"
          count={cards.length}
          empty="Generate cards from a note"
          items={cards.slice(0, 5).map((card) => ({ id: card.id, title: card.front, meta: card.status }))}
        />
        <div className="panel">
          <div className="sectionHeader">
            <div>
              <h2>Quizzes</h2>
              <p>{quizzes.length} sets</p>
            </div>
          </div>
          <div className="noteList">
            {quizzes.map((quiz) => (
              <Link to={`/quiz/${quiz.id}`} className="noteRow" key={quiz.id}>
                <ClipboardCheck size={18} />
                <span>
                  <strong>{quiz.title}</strong>
                  <small>{quiz.questionCount} questions</small>
                </span>
              </Link>
            ))}
            {!quizzes.length ? <EmptyState icon={<ClipboardCheck size={24} />} title="No quizzes yet" /> : null}
          </div>
        </div>
      </section>
    </div>
  );
}

function NotePage() {
  const { noteId = "" } = useParams();
  const navigate = useNavigate();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [note, setNote] = useState<Note | null>(null);
  const [uploads, setUploads] = useState<UploadRecord[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [summary, setSummary] = useState("");
  const [generating, setGenerating] = useState<GenerateMode | null>(null);
  const [generationText, setGenerationText] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    const [subjectData, noteData, uploadData] = await Promise.all([
      api.listSubjects(),
      api.getNote(noteId),
      api.listUploads({ noteId })
    ]);
    setSubjects(subjectData.subjects);
    setNote(noteData.note);
    setTitle(noteData.note.title);
    setBody(noteData.note.body);
    setSummary(noteData.note.summary);
    setUploads(uploadData.uploads);
  }

  useEffect(() => {
    load().catch((error) => setMessage(error instanceof Error ? error.message : "Could not load note."));
  }, [noteId]);

  async function save() {
    const { note: updated } = await api.updateNote(noteId, { title, body, summary });
    setNote(updated);
    setMessage("Saved");
  }

  async function remove() {
    await api.deleteNote(noteId);
    navigate(note ? `/subjects/${note.subjectId}` : "/");
  }

  async function generate(mode: GenerateMode) {
    if (!note) return;
    setGenerating(mode);
    setGenerationText("");
    setMessage("");
    try {
      await streamGenerate(
        { mode, subjectId: note.subjectId, noteId, noteBody: body, prompt: `Use ${title} as the source note.` },
        {
          onDelta: (text) => setGenerationText((value) => value + text),
          onSaved: (saved) => {
            if (saved.summary) setSummary(saved.summary);
            if (saved.flashcards) setMessage(`${saved.flashcards.length} flashcards saved`);
            if (saved.quiz) setMessage(`Quiz saved: ${saved.quiz.title}`);
          },
          onError: setMessage
        }
      );
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Generation failed.");
    } finally {
      setGenerating(null);
    }
  }

  const subject = subjects.find((item) => item.id === note?.subjectId);

  return (
    <div className="page">
      <BackLink to={note ? `/subjects/${note.subjectId}` : "/"} label={subject?.name ?? "Subject"} />
      <header className="topbar">
        <div>
          <p className="eyebrow">Note editor</p>
          <h1>{note?.title ?? "Loading note"}</h1>
        </div>
        <div className="buttonRow">
          <button className="ghostButton danger" type="button" onClick={remove}>
            <Trash2 size={17} />
            Delete
          </button>
          <button className="primaryButton" type="button" onClick={save}>
            <Check size={17} />
            Save
          </button>
        </div>
      </header>

      {message ? <p className={message.includes("failed") || message.includes("required") ? "errorText" : "successText"}>{message}</p> : null}

      <section className="editorGrid">
        <div className="editorPanel">
          <input className="titleInput" value={title} onChange={(event) => setTitle(event.target.value)} />
          <textarea className="bodyInput" value={body} onChange={(event) => setBody(event.target.value)} />
        </div>

        <aside className="panel noteTools">
          <UploadPanel compact subjectId={note?.subjectId} noteId={noteId} onUploaded={() => load()} />
          <div className="toolButtons">
            {(["summary", "flashcards", "quiz"] as GenerateMode[]).map((mode) => (
              <button className="ghostButton" type="button" key={mode} onClick={() => generate(mode)} disabled={Boolean(generating)}>
                {generating === mode ? <Loader2 className="spin" size={17} /> : <Sparkles size={17} />}
                {modeLabel(mode)}
              </button>
            ))}
          </div>
          <div className="summaryBox">
            <h2>Summary</h2>
            <textarea value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="Generated or hand-written summary..." />
          </div>
          <div className="fileStack">
            <h2>Files</h2>
            {uploads.map((upload) => (
              <span className="filePill" key={upload.id}>
                <UploadCloud size={15} />
                {upload.filename}
              </span>
            ))}
            {!uploads.length ? <small>No files attached</small> : null}
          </div>
        </aside>
      </section>

      {generationText ? (
        <section className="panel generationPanel">
          <h2>AI stream</h2>
          <pre>{generationText}</pre>
        </section>
      ) : null}
    </div>
  );
}

function ReviewPage() {
  const { deckId = "" } = useParams();
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    Promise.all([api.listFlashcards({ subjectId: deckId }), api.listSubjects()])
      .then(([cardData, subjectData]) => {
        setCards(cardData.flashcards);
        setSubjects(subjectData.subjects);
      })
      .catch((error) => setMessage(error instanceof Error ? error.message : "Could not load review."));
  }, [deckId]);

  const card = cards[index];
  const subject = subjects.find((item) => item.id === deckId);
  const reviewProgress = cards.length ? Math.min(100, Math.round((index / cards.length) * 100)) : 0;

  async function answer(correct: boolean) {
    if (!card) return;
    await api.recordAttempt({ kind: "flashcard", itemId: card.id, correct });
    await api.updateFlashcardStatus(card.id, correct ? "known" : "learning");
    setRevealed(false);
    setIndex((value) => Math.min(value + 1, cards.length));
  }

  return (
    <div className="page reviewPage">
      <BackLink to={deckId ? `/subjects/${deckId}` : "/"} label={subject?.name ?? "Subject"} />
      <header className="topbar">
        <div>
          <p className="eyebrow">Flashcard review</p>
          <h1>{subject?.name ?? "Review deck"}</h1>
        </div>
        <span className="queueBadge">{Math.min(index + 1, cards.length)} / {cards.length || 0}</span>
      </header>

      {message ? <p className="errorText">{message}</p> : null}
      <div className="reviewProgress" aria-label={`Review progress ${reviewProgress}%`}>
        <span style={{ width: `${reviewProgress}%` }} />
      </div>

      {!card ? (
        <section className="panel centerPanel">
          <EmptyState icon={<Brain size={28} />} title={cards.length ? "Deck complete" : "No cards yet"} />
          <Link className="primaryButton" to={deckId ? `/subjects/${deckId}` : "/"}>
            <Layers3 size={18} />
            Back to subject
          </Link>
        </section>
      ) : (
        <section className={`flashcardStage ${revealed ? "revealed" : ""}`}>
          <button className="flashcard" type="button" onClick={() => setRevealed((value) => !value)}>
            <span>{revealed ? "Answer" : "Prompt"}</span>
            <strong>{revealed ? card.back : card.front}</strong>
          </button>
          <div className="reviewActions">
            <button className="ghostButton danger" type="button" onClick={() => answer(false)}>
              <X size={18} />
              Missed
            </button>
            <button className="primaryButton" type="button" onClick={() => (revealed ? answer(true) : setRevealed(true))}>
              <Check size={18} />
              {revealed ? "Got it" : "Reveal"}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

function QuizPage() {
  const { quizId = "" } = useParams();
  const [quiz, setQuiz] = useState<QuizDetail | null>(null);
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    api.getQuiz(quizId)
      .then((data) => setQuiz(data.quiz))
      .catch((error) => setMessage(error instanceof Error ? error.message : "Could not load quiz."));
  }, [quizId]);

  const score = useMemo(() => {
    if (!quiz) return 0;
    return quiz.questions.reduce((total, question) => total + (selected[question.id] === question.answerIndex ? 1 : 0), 0);
  }, [quiz, selected]);

  async function submit() {
    if (!quiz) return;
    await Promise.all(
      quiz.questions.map((question) =>
        api.recordAttempt({
          kind: "quiz",
          itemId: question.id,
          correct: selected[question.id] === question.answerIndex
        })
      )
    );
    setSubmitted(true);
  }

  return (
    <div className="page">
      <BackLink to={quiz ? `/subjects/${quiz.subjectId}` : "/"} label="Subject" />
      <header className="topbar">
        <div>
          <p className="eyebrow">Quiz room</p>
          <h1>{quiz?.title ?? "Loading quiz"}</h1>
        </div>
        {submitted ? <span className="queueBadge">{score} / {quiz?.questions.length ?? 0}</span> : null}
      </header>

      {message ? <p className="errorText">{message}</p> : null}

      <section className="quizStack">
        {quiz?.questions.map((question, questionIndex) => (
          <article className="quizQuestion" key={question.id}>
            <span className="questionNumber">Q{questionIndex + 1}</span>
            <h2>{question.prompt}</h2>
            <div className="optionGrid">
              {question.options.map((option, optionIndex) => {
                const isSelected = selected[question.id] === optionIndex;
                const isCorrect = submitted && optionIndex === question.answerIndex;
                const isWrong = submitted && isSelected && !isCorrect;
                return (
                  <button
                    className={`optionButton ${isSelected ? "selected" : ""} ${isCorrect ? "correct" : ""} ${isWrong ? "wrong" : ""}`}
                    type="button"
                    key={option}
                    onClick={() => !submitted && setSelected((value) => ({ ...value, [question.id]: optionIndex }))}
                  >
                    <span className="optionLetter">{String.fromCharCode(65 + optionIndex)}</span>
                    <span>{option}</span>
                  </button>
                );
              })}
            </div>
            {submitted ? <p className="explanation">{question.explanation}</p> : null}
          </article>
        ))}
      </section>

      {quiz && !submitted ? (
        <button className="primaryButton floatingSubmit" type="button" onClick={submit}>
          <ClipboardCheck size={18} />
          Submit quiz
        </button>
      ) : null}
    </div>
  );
}

function FocusBand({
  subject,
  note,
  quiz,
  progress
}: {
  subject?: Subject;
  note?: Note;
  quiz?: QuizListItem;
  progress: Progress | null;
}) {
  return (
    <section className="focusBand" aria-label="Active study focus">
      <div className="focusIdentity">
        <span className="focusIcon">
          <Target size={24} />
        </span>
        <div>
          <p className="eyebrow">First beta focus</p>
          <h2>{subject?.name ?? "Reviewer beta"}</h2>
          <p>{subject?.description ?? "Load a subject to begin."}</p>
        </div>
      </div>
      <div className="focusMeta">
        <span>
          <CalendarDays size={16} />
          {progress?.uploads ?? 0} files
        </span>
        <span>
          <Gauge size={16} />
          {progress?.mastery ?? 0}% mastery
        </span>
      </div>
      <div className="focusActions">
        {note ? (
          <Link className="ghostButton" to={`/notes/${note.id}`}>
            <FileText size={17} />
            Open note
          </Link>
        ) : null}
        {quiz ? (
          <Link className="ghostButton" to={`/quiz/${quiz.id}`}>
            <ClipboardCheck size={17} />
            Start quiz
          </Link>
        ) : null}
        {subject ? (
          <Link className="primaryButton" to={`/review/${subject.id}`}>
            <Rocket size={17} />
            Review
          </Link>
        ) : null}
      </div>
    </section>
  );
}

function Stat({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string | number; detail: string }) {
  return (
    <div className="stat">
      <span>{icon}</span>
      <small>{label}</small>
      <strong>{value}</strong>
      <em>{detail}</em>
    </div>
  );
}

function ResourcePanel({ title, count, empty, items }: { title: string; count: number; empty: string; items: Array<{ id: string; title: string; meta: string }> }) {
  return (
    <div className="panel">
      <div className="sectionHeader">
        <div>
          <h2>{title}</h2>
          <p>{count} saved</p>
        </div>
      </div>
      <div className="noteList">
        {items.map((item) => (
          <div className="noteRow" key={item.id}>
            <Brain size={18} />
            <span>
              <strong>{item.title}</strong>
              <small>{item.meta}</small>
            </span>
          </div>
        ))}
        {!items.length ? <EmptyState icon={<Brain size={24} />} title={empty} /> : null}
      </div>
    </div>
  );
}

function EmptyState({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="emptyState">
      {icon}
      <strong>{title}</strong>
    </div>
  );
}

function BackLink({ to, label }: { to: string; label: string }) {
  return (
    <Link className="backLink" to={to}>
      <ChevronLeft size={17} />
      {label}
    </Link>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function modeLabel(mode: GenerateMode) {
  if (mode === "summary") return "Summary";
  if (mode === "flashcards") return "Flashcards";
  if (mode === "quiz") return "Quiz";
  return "Tutor";
}
