import { describe, expect, it } from "vitest";
import { createMockText } from "../worker/ai";
import { extractJsonObject, MAX_UPLOAD_BYTES, validateUpload } from "../worker/utils";

describe("AI fallback generation", () => {
  it("creates deterministic flashcards when no OpenAI key is configured", () => {
    const text = createMockText({
      mode: "flashcards",
      subjectName: "Biology",
      noteTitle: "Cell transport",
      noteBody: "Diffusion moves particles from high concentration to low concentration. Osmosis moves water across a membrane.",
      prompt: ""
    });

    const parsed = extractJsonObject(text) as { flashcards: Array<{ front: string; back: string }> };
    expect(parsed.flashcards).toHaveLength(6);
    expect(parsed.flashcards[0].back).toContain("Diffusion");
  });

  it("creates a quiz with four-option questions", () => {
    const text = createMockText({
      mode: "quiz",
      subjectName: "History",
      noteTitle: "Revolutions",
      noteBody: "The French Revolution changed political power in France. Enlightenment ideas influenced demands for rights.",
      prompt: ""
    });

    const parsed = extractJsonObject(text) as { questions: Array<{ options: string[]; answerIndex: number }> };
    expect(parsed.questions.length).toBeGreaterThan(0);
    expect(parsed.questions[0].options).toHaveLength(4);
    expect(parsed.questions[0].answerIndex).toBe(0);
  });

  it("uses answer-key MCQ structure when available", () => {
    const text = createMockText({
      mode: "quiz",
      subjectName: "CMPE 309",
      noteTitle: "Practice Bank",
      noteBody: `PART 2 — Answer Key with Sources
1. What is a Control System?
a. A system that only measures outputs
b. A set of devices that regulates other systems using control loops
c. A machine that works without any external input
d. A network of interconnected plants with no feedback
Answer: B [Source: Long Exam 1, Q1]
Reasoning: A control system regulates another system or process.`,
      prompt: ""
    });

    const parsed = extractJsonObject(text) as { questions: Array<{ prompt: string; options: string[]; answerIndex: number }> };
    expect(parsed.questions[0].prompt).toBe("What is a Control System?");
    expect(parsed.questions[0].options[1]).toContain("regulates other systems");
    expect(parsed.questions[0].answerIndex).toBe(1);
  });
});

describe("upload validation", () => {
  it("accepts PDFs and images under the beta limit", () => {
    const file = new File(["study notes"], "notes.pdf", { type: "application/pdf" });
    expect(() => validateUpload(file)).not.toThrow();
  });

  it("rejects unsupported file types", () => {
    const file = new File(["bad"], "notes.exe", { type: "application/x-msdownload" });
    expect(() => validateUpload(file)).toThrow("Upload must be a PDF or image file.");
  });

  it("rejects files above the beta limit", () => {
    const file = new File([new Uint8Array(MAX_UPLOAD_BYTES + 1)], "huge.png", { type: "image/png" });
    expect(() => validateUpload(file)).toThrow("Upload must be 10 MB or smaller.");
  });
});
