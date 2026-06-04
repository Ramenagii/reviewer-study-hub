import {
  getNote,
  getSubject,
  getUpload,
  insertFlashcards,
  insertQuiz,
  updateNoteSummary
} from "./db";
import { HttpError, sse } from "./http";
import type { Env, GenerateMode, GenerateRequest, SavedGeneration, UploadRecord } from "./types";
import { arrayBufferToBase64, chunkText, coerceStringArray, extractJsonObject, firstSentences } from "./utils";

interface GenerationContext {
  mode: GenerateMode;
  subjectName: string;
  noteTitle: string;
  noteBody: string;
  prompt: string;
  upload?: UploadRecord;
  uploadData?: { type: "input_file" | "input_image"; filename: string; mimeType: string; dataUrl: string };
}

type GeneratedCard = { front: string; back: string };
type GeneratedQuestion = { prompt: string; options: string[]; answerIndex: number; explanation: string };

export async function streamAiGeneration(env: Env, requestBody: GenerateRequest) {
  const context = await buildContext(env, requestBody);
  const encoder = new TextEncoder();

  return new Response(
    new ReadableStream({
      async start(controller) {
        let fullText = "";
        try {
          controller.enqueue(encoder.encode(sse("status", { message: "started" })));
          const source = env.OPENAI_API_KEY ? openAiDeltas(env, context) : mockDeltas(context);
          for await (const delta of source) {
            fullText += delta;
            controller.enqueue(encoder.encode(sse("delta", { text: delta })));
          }
          const saved = await persistGeneratedOutput(env, requestBody, context, fullText);
          controller.enqueue(encoder.encode(sse("saved", saved)));
          controller.enqueue(encoder.encode(sse("done", { ok: true })));
        } catch (error) {
          const message = error instanceof Error ? error.message : "AI generation failed.";
          controller.enqueue(encoder.encode(sse("error", { message })));
        } finally {
          controller.close();
        }
      }
    }),
    {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive"
      }
    }
  );
}

async function buildContext(env: Env, requestBody: GenerateRequest): Promise<GenerationContext> {
  if (!["tutor", "summary", "flashcards", "quiz"].includes(requestBody.mode)) {
    throw new HttpError(400, "Unknown AI generation mode.");
  }

  const note = requestBody.noteId ? await getNote(env, requestBody.noteId) : null;
  const subjectId = requestBody.subjectId ?? note?.subjectId;
  const subject = subjectId ? await getSubject(env, subjectId) : null;
  const upload = requestBody.uploadId ? await getUpload(env, requestBody.uploadId) : null;

  let uploadData: GenerationContext["uploadData"];
  if (upload) {
    const object = await env.UPLOADS.get(upload.r2Key);
    if (!object) throw new HttpError(404, "Uploaded file not found.");
    const buffer = await object.arrayBuffer();
    const dataUrl = `data:${upload.mimeType};base64,${arrayBufferToBase64(buffer)}`;
    uploadData = {
      type: upload.mimeType.startsWith("image/") ? "input_image" : "input_file",
      filename: upload.filename,
      mimeType: upload.mimeType,
      dataUrl
    };
  }

  return {
    mode: requestBody.mode,
    subjectName: subject?.name ?? "General Study",
    noteTitle: note?.title ?? "Untitled note",
    noteBody: requestBody.noteBody?.trim() || note?.body || "",
    prompt: requestBody.prompt?.trim() || "",
    upload: upload ?? undefined,
    uploadData
  };
}

function promptFor(context: GenerationContext) {
  const sourceText = context.noteBody || context.prompt || "No typed notes were provided.";
  const sourceLabel = context.upload ? `There is also an attached ${context.upload.mimeType} file named ${context.upload.filename}.` : "";
  const base = `Subject: ${context.subjectName}
Note: ${context.noteTitle}
${sourceLabel}
Student prompt: ${context.prompt || "Create useful study material from the available note or upload."}
Typed note content:
${sourceText}`;

  if (context.mode === "summary") {
    return `${base}

Return only JSON in this exact shape:
{"summary":"A clear, student-friendly study summary in 4-7 compact sentences."}`;
  }

  if (context.mode === "flashcards") {
    return `${base}

Return only JSON in this exact shape:
{"flashcards":[{"front":"Question or term","back":"Concise answer"}]}
Create 6 high-yield flashcards.`;
  }

  if (context.mode === "quiz") {
    return `${base}

Return only JSON in this exact shape:
{"title":"Short quiz title","questions":[{"prompt":"Question","options":["A","B","C","D"],"answerIndex":0,"explanation":"Why the answer is correct"}]}
Create 5 multiple-choice questions with exactly 4 options each.`;
  }

  return `${base}

You are Reviewer's live study tutor. Answer warmly, ask one useful follow-up when helpful, and keep the response focused on learning and recall.`;
}

async function* openAiDeltas(env: Env, context: GenerationContext): AsyncGenerator<string> {
  const content: Record<string, unknown>[] = [{ type: "input_text", text: promptFor(context) }];
  if (context.uploadData?.type === "input_file") {
    content.push({
      type: "input_file",
      filename: context.uploadData.filename,
      file_data: context.uploadData.dataUrl
    });
  }
  if (context.uploadData?.type === "input_image") {
    content.push({
      type: "input_image",
      image_url: context.uploadData.dataUrl,
      detail: "auto"
    });
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: env.OPENAI_MODEL || "gpt-5-mini",
      stream: true,
      instructions:
        "You generate study materials for a private student reviewer app. For JSON modes, return valid JSON only and no markdown.",
      input: [
        {
          role: "user",
          content
        }
      ]
    })
  });

  if (!response.ok || !response.body) {
    const message = await response.text();
    throw new Error(message || "OpenAI request failed.");
  }

  for await (const eventText of readServerSentEvents(response.body)) {
    if (eventText === "[DONE]") break;
    try {
      const event = JSON.parse(eventText) as { type?: string; delta?: string; text?: string };
      if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
        yield event.delta;
      } else if (event.type === "response.refusal.delta" && typeof event.delta === "string") {
        yield event.delta;
      } else if (event.type === "response.output_text.done" && typeof event.text === "string") {
        // Some transports only send the final text. Ignore it if deltas already arrived.
      }
    } catch {
      // Ignore non-JSON stream comments.
    }
  }
}

async function* readServerSentEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const dataLines = part
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim());
      if (dataLines.length) yield dataLines.join("\n");
    }
  }
}

async function* mockDeltas(context: GenerationContext): AsyncGenerator<string> {
  const text = createMockText(context);
  for (const chunk of chunkText(text)) {
    yield chunk;
  }
}

export function createMockText(context: Pick<GenerationContext, "mode" | "subjectName" | "noteTitle" | "noteBody" | "prompt">) {
  const source = normalizeStudySource(context.noteBody || context.prompt || `${context.subjectName} review notes`);
  const sentences = firstSentences(source, 6);
  const topic = context.noteTitle === "Untitled note" ? context.subjectName : context.noteTitle;

  if (context.mode === "summary") {
    const summary =
      sentences.length > 0
        ? `This note is centered on ${topic}. ${sentences.slice(0, 3).join(" ")} Review the key terms, explain each idea aloud, and test yourself with examples until the links feel automatic.`
        : `This ${context.subjectName} material should be reviewed by turning the main ideas into questions, checking definitions, and practicing recall without looking at the note.`;
    return JSON.stringify({ summary });
  }

  if (context.mode === "flashcards") {
    return JSON.stringify({
      flashcards: buildFallbackCards(source, context.subjectName).slice(0, 6)
    });
  }

  if (context.mode === "quiz") {
    return JSON.stringify({
      title: `${topic} Checkpoint`,
      questions: buildFallbackQuestions(source, context.subjectName).slice(0, 5)
    });
  }

  return `Let's review ${topic}. Start by naming the main idea without looking, then explain one example and one possible misconception. Based on what you shared, I would turn the most important sentences into flashcards, then use a short quiz to find the weak spots. What part feels least clear right now?`;
}

function buildFallbackCards(source: string, subjectName: string): GeneratedCard[] {
  const mcqs = extractMcqBank(source);
  if (mcqs.length) {
    return mcqs.slice(0, 6).map((question) => ({
      front: question.prompt,
      back: `Correct answer: ${String.fromCharCode(65 + question.answerIndex)}. ${question.options[question.answerIndex]}${
        question.explanation ? `\nWhy: ${question.explanation}` : ""
      }`
    }));
  }

  const sentences = firstSentences(normalizeStudySource(source), 6);
  const cards = sentences.map((sentence, index) => ({
    front: `What is the key idea in point ${index + 1}?`,
    back: sentence
  }));

  while (cards.length < 6) {
    cards.push({
      front: `How should you review ${subjectName} item ${cards.length + 1}?`,
      back: "Recall the idea from memory, explain it in your own words, then check the note for missing details."
    });
  }

  return cards;
}

function buildFallbackQuestions(source: string, subjectName: string): GeneratedQuestion[] {
  const mcqs = extractMcqBank(source);
  if (mcqs.length) {
    return mcqs.slice(0, 5);
  }

  return buildFallbackCards(source, subjectName).map((card, index) => ({
    prompt: card.front,
    options: [
      card.back,
      "Skip the concept and memorize only the title.",
      "Use the opposite definition without checking evidence.",
      "Treat every detail as unrelated to the main topic."
    ],
    answerIndex: 0,
    explanation: "The correct option directly matches the study point from the note."
  })).slice(0, 5);
}

function normalizeStudySource(source: string) {
  return (
    source
      .replace(/^Imported first beta source:[\s\S]*?Extracted PDF text for local beta generation\.[^\n]*\n+/i, "")
      .replace(/^Imported first beta source:[^\n]*\n+/i, "")
      .trim() || source
  );
}

function extractMcqBank(source: string): GeneratedQuestion[] {
  const normalized = normalizeStudySource(source);
  const answerSectionIndex = normalized.indexOf("PART 2");
  const questionSource = answerSectionIndex >= 0 ? normalized.slice(answerSectionIndex) : normalized;
  const matches = questionSource.matchAll(/(?:^|\n)(\d{1,3})\.\s+([\s\S]*?)(?=\n\d{1,3}\.\s+|\nPART\s+\d|$)/g);
  const questions: GeneratedQuestion[] = [];

  for (const match of matches) {
    const block = match[2].trim();
    const optionMatches = [...block.matchAll(/(?:^|\n)([a-d])\.\s+/gi)];
    if (optionMatches.length < 4) continue;

    const prompt = cleanMcqText(block.slice(0, optionMatches[0].index).replace(/^[-–—\s]+/, ""));
    if (!prompt || prompt.length > 500) continue;

    const options = optionMatches.slice(0, 4).map((optionMatch, optionIndex) => {
      const start = (optionMatch.index ?? 0) + optionMatch[0].length;
      const nextOption = optionMatches[optionIndex + 1]?.index ?? block.search(/\nAnswer:/i);
      const end = nextOption >= 0 ? nextOption : block.length;
      return cleanMcqText(block.slice(start, end));
    });

    if (options.some((option) => !option || option.length > 650)) continue;

    const answerLetter = block.match(/\nAnswer:\s*([A-D])/i)?.[1]?.toUpperCase();
    const answerIndex = answerLetter ? answerLetter.charCodeAt(0) - 65 : 0;
    if (answerIndex < 0 || answerIndex > 3) continue;

    const reasoningMatch = block.match(/\nReasoning:\s*([\s\S]*)/i);
    questions.push({
      prompt,
      options,
      answerIndex,
      explanation: reasoningMatch ? cleanMcqText(reasoningMatch[1]).slice(0, 700) : "Based on the source answer key."
    });
  }

  return questions;
}

function cleanMcqText(text: string) {
  return text
    .replace(/\nAnswer:[\s\S]*$/i, "")
    .replace(/\nReasoning:[\s\S]*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function persistGeneratedOutput(
  env: Env,
  requestBody: GenerateRequest,
  context: GenerationContext,
  fullText: string
): Promise<SavedGeneration> {
  if (context.mode === "tutor") {
    return { mode: "tutor" };
  }

  const subjectId = requestBody.subjectId || (requestBody.noteId ? (await getNote(env, requestBody.noteId))?.subjectId : undefined);
  if (!subjectId) {
    throw new HttpError(400, "A subject is required to save generated study material.");
  }

  if (context.mode === "summary") {
    const parsed = parseSummary(fullText, context);
    if (requestBody.noteId) {
      await updateNoteSummary(env, requestBody.noteId, parsed);
    }
    return { mode: "summary", summary: parsed };
  }

  if (context.mode === "flashcards") {
    const cards = parseFlashcards(fullText, context);
    const savedCards = await insertFlashcards(env, { subjectId, noteId: requestBody.noteId ?? null, cards });
    return { mode: "flashcards", flashcards: savedCards };
  }

  const quizData = parseQuiz(fullText, context);
  const quiz = await insertQuiz(env, {
    subjectId,
    noteId: requestBody.noteId ?? null,
    title: quizData.title,
    questions: quizData.questions
  });
  return { mode: "quiz", quiz };
}

function parseSummary(text: string, context: GenerationContext) {
  try {
    const parsed = extractJsonObject(text) as { summary?: unknown };
    if (typeof parsed.summary === "string" && parsed.summary.trim()) {
      return parsed.summary.trim();
    }
  } catch {
    // Fall through to text fallback.
  }
  return createMockText({ ...context, mode: "summary" }).replace(/^\{"summary":"|"\}$/g, "");
}

function parseFlashcards(text: string, context: GenerationContext): GeneratedCard[] {
  try {
    const parsed = extractJsonObject(text) as { flashcards?: Array<{ front?: unknown; back?: unknown }> };
    const cards =
      parsed.flashcards
        ?.map((card) => ({
          front: typeof card.front === "string" ? card.front.trim() : "",
          back: typeof card.back === "string" ? card.back.trim() : ""
        }))
        .filter((card) => card.front && card.back) ?? [];
    if (cards.length) return cards.slice(0, 12);
  } catch {
    // Fall through to deterministic fallback.
  }
  return buildFallbackCards(context.noteBody || context.prompt, context.subjectName);
}

function parseQuiz(text: string, context: GenerationContext): { title: string; questions: GeneratedQuestion[] } {
  try {
    const parsed = extractJsonObject(text) as {
      title?: unknown;
      questions?: Array<{ prompt?: unknown; options?: unknown; answerIndex?: unknown; explanation?: unknown }>;
    };
    const questions =
      parsed.questions
        ?.map((question) => {
          const options = coerceStringArray(question.options).slice(0, 4);
          return {
            prompt: typeof question.prompt === "string" ? question.prompt.trim() : "",
            options,
            answerIndex: typeof question.answerIndex === "number" ? question.answerIndex : 0,
            explanation: typeof question.explanation === "string" ? question.explanation.trim() : ""
          };
        })
        .filter((question) => question.prompt && question.options.length === 4 && question.answerIndex >= 0 && question.answerIndex < 4) ?? [];
    if (questions.length) {
      return {
        title: typeof parsed.title === "string" && parsed.title.trim() ? parsed.title.trim() : `${context.noteTitle} Quiz`,
        questions: questions.slice(0, 10)
      };
    }
  } catch {
    // Fall through to deterministic fallback.
  }

  return {
    title: `${context.noteTitle === "Untitled note" ? context.subjectName : context.noteTitle} Checkpoint`,
    questions: buildFallbackQuestions(context.noteBody || context.prompt, context.subjectName)
  };
}
