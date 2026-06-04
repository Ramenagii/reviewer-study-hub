import { Bot, Loader2, Send, Sparkles } from "lucide-react";
import { FormEvent, useState } from "react";
import { streamGenerate } from "../lib/api";
import type { GenerateMode, SavedGeneration, Subject, UploadRecord } from "../types";

interface AiPanelProps {
  subjects: Subject[];
  activeSubjectId?: string;
  noteId?: string;
  noteBody?: string;
  uploadId?: string;
  uploads?: UploadRecord[];
  mode?: GenerateMode;
  onSaved?: (data: SavedGeneration) => void;
}

export function AiPanel({ subjects, activeSubjectId, noteId, noteBody, uploadId, uploads = [], mode = "tutor", onSaved }: AiPanelProps) {
  const [subjectId, setSubjectId] = useState(activeSubjectId || subjects[0]?.id || "");
  const [selectedUploadId, setSelectedUploadId] = useState(uploadId || "");
  const [prompt, setPrompt] = useState("");
  const [output, setOutput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setOutput("");
    try {
      await streamGenerate(
        {
          mode,
          subjectId: activeSubjectId || subjectId,
          noteId,
          noteBody,
          uploadId: selectedUploadId || undefined,
          prompt: prompt || defaultPrompt(mode)
        },
        {
          onDelta: (text) => setOutput((value) => value + text),
          onSaved,
          onError: setError
        }
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI generation failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="aiPanel">
      <div className="panelHeader">
        <span className="panelIcon">
          <Bot size={20} />
        </span>
        <div>
          <h2>Study Tutor</h2>
          <p>{mode === "tutor" ? "Live help" : `Generate ${mode}`}</p>
        </div>
      </div>

      <form onSubmit={submit} className="aiForm">
        {!activeSubjectId ? (
          <select value={subjectId} onChange={(event) => setSubjectId(event.target.value)} aria-label="Subject">
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </select>
        ) : null}

        {uploads.length ? (
          <select value={selectedUploadId} onChange={(event) => setSelectedUploadId(event.target.value)} aria-label="Attached upload">
            <option value="">Typed notes only</option>
            {uploads.map((upload) => (
              <option key={upload.id} value={upload.id}>
                {upload.filename}
              </option>
            ))}
          </select>
        ) : null}

        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder={mode === "tutor" ? "Ask for an explanation, quiz, or recall drill..." : "Add a focus area..."}
          rows={4}
        />
        <button className="primaryButton" type="submit" disabled={busy || (!subjectId && !activeSubjectId)}>
          {busy ? <Loader2 className="spin" size={18} /> : mode === "tutor" ? <Send size={18} /> : <Sparkles size={18} />}
          {mode === "tutor" ? "Ask Tutor" : "Generate"}
        </button>
      </form>

      <div className="aiOutput" aria-live="polite">
        {output ? <pre>{output}</pre> : <span>{busy ? "Thinking..." : "Ready"}</span>}
      </div>
      {error ? <p className="errorText">{error}</p> : null}
    </section>
  );
}

function defaultPrompt(mode: GenerateMode) {
  if (mode === "summary") return "Summarize this material for active recall.";
  if (mode === "flashcards") return "Create high-yield flashcards from this material.";
  if (mode === "quiz") return "Create a short multiple-choice quiz from this material.";
  return "Help me understand and review this subject.";
}
