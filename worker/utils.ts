import { HttpError } from "./http";

const ALLOWED_UPLOADS = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif"
]);

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export function uid(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 18)}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export function validateUpload(file: { type: string; size: number }) {
  if (!ALLOWED_UPLOADS.has(file.type)) {
    throw new HttpError(400, "Upload must be a PDF or image file.");
  }
  if (file.size <= 0) {
    throw new HttpError(400, "Upload cannot be empty.");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new HttpError(400, "Upload must be 10 MB or smaller.");
  }
}

export function safeFileName(name: string) {
  const cleaned = name.replace(/[^\w.\- ()]/g, "_").trim();
  return cleaned || "study-upload";
}

export function extractJsonObject(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  if (!candidate.trim()) {
    throw new Error("No JSON object found.");
  }
  return JSON.parse(candidate);
}

export function coerceStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
}

export function chunkText(text: string, size = 42) {
  const chunks: string[] = [];
  for (let index = 0; index < text.length; index += size) {
    chunks.push(text.slice(index, index + size));
  }
  return chunks;
}

export function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const sliceSize = 0x8000;
  for (let index = 0; index < bytes.length; index += sliceSize) {
    binary += String.fromCharCode(...bytes.slice(index, index + sliceSize));
  }
  return btoa(binary);
}

export function firstSentences(text: string, count = 6) {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 18)
    .slice(0, count);
}
