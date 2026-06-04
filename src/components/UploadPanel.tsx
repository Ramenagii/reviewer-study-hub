import { FileText, Image, Loader2, UploadCloud } from "lucide-react";
import { useRef, useState } from "react";
import { api } from "../lib/api";
import type { UploadRecord } from "../types";

interface UploadPanelProps {
  subjectId?: string;
  noteId?: string;
  compact?: boolean;
  onUploaded?: (upload: UploadRecord) => void;
}

export function UploadPanel({ subjectId, noteId, compact, onUploaded }: UploadPanelProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setBusy(true);
    setMessage("");
    try {
      const { upload } = await api.uploadFile(file, { subjectId, noteId });
      setMessage(`${upload.filename} saved`);
      onUploaded?.(upload);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <section className={compact ? "upload compact" : "upload"}>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/png,image/jpeg,image/webp,image/gif"
        onChange={(event) => handleFiles(event.currentTarget.files)}
      />
      <button className="uploadTarget" type="button" onClick={() => inputRef.current?.click()} disabled={busy}>
        <span className="uploadIcon">{busy ? <Loader2 className="spin" size={22} /> : <UploadCloud size={22} />}</span>
        <span>
          <strong>{compact ? "Attach file" : "Upload study material"}</strong>
          <small>PDF, screenshot, or photo under 10 MB</small>
        </span>
      </button>
      <div className="uploadTypes" aria-hidden="true">
        <FileText size={16} />
        <Image size={16} />
      </div>
      {message ? <p className="formMessage">{message}</p> : null}
    </section>
  );
}

