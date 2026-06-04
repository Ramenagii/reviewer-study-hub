# Reviewer

Reviewer is a local-first beta study hub with a Cloudflare Worker API, D1 data, R2-style uploads, and a React dashboard for notes, flashcards, quizzes, progress, and streaming AI study help.

## Local Beta

1. Install dependencies:

   ```bash
   npm install
   ```

2. Optional AI setup:

   ```bash
   cp .dev.vars.example .dev.vars
   ```

   Add `OPENAI_API_KEY` to `.dev.vars`. Without a key, Reviewer uses deterministic local fallback generation so the beta flow still works.

3. Run the Cloudflare-local app:

   ```bash
   npm run dev
   ```

4. Open `http://127.0.0.1:8787`.

## Beta Scope

- Preset and custom subjects
- Note creation and editing
- PDF/image uploads up to 10 MB
- Streaming AI tutor/generator endpoint
- AI summary, flashcard, and quiz saving
- Flashcard review and quiz attempt tracking
- Local-only no-login beta

