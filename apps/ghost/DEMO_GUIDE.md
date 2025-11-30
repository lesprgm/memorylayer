# Ghost Hackathon Demo Guide

This guide explains how to stage and demo Ghost + MemoryLayer for a short hackathon video, using ~10 synthetic documents.

## 1. Generate the Demo Documents

Ask your AI to generate 10 documents using a prompt like:

> You are helping me prepare a demo for an AI operating system called “Ghost” that can index my local files and summarize them using a memory layer.  
>  
> Please create 10 realistic but fictional documents, each with 2–5 pages worth of content (short is fine; I will save them as PDF/DOCX/TXT locally). For each document, output:  
> 1) A suggested filename (no spaces, safe for macOS paths).  
> 2) A short “file header” line describing the document.  
> 3) The full body text to paste into the file.  
>  
> The documents should cover these themes and be clearly date‑stamped in the text so I can show a timeline:  
>  
> 1. `Project_Alpha_API_Redesign_v1.docx` – early API redesign proposal (REST, versioned endpoints).  
> 2. `Project_Alpha_API_Redesign_v3.docx` – later proposal moving toward a hybrid REST + GraphQL design, with a clear list of final decisions.  
> 3. `API_Redesign_Meeting_Notes_2024-03-10.txt` – meeting notes where the team initially picks REST + versioning.  
> 4. `API_Redesign_Meeting_Notes_2024-03-15.txt` – meeting notes where “Sarah” raises concerns about flexibility and client complexity.  
> 5. `API_Redesign_Meeting_Notes_2024-03-20.txt` – meeting where the team adopts the hybrid approach; explicitly mention “final decision” and summarize trade‑offs.  
> 6. `API_Comparison_Matrix.xlsx.txt` – textual representation of a comparison matrix (REST vs GraphQL vs gRPC) with clear pros/cons bullets.  
> 7. `Toolsmith_Roadmap_Q2_2024.pdf` – product roadmap for a fictional internal tool called “Toolsmith”, including milestones and dependencies on the API redesign.  
> 8. `Engineering_AllHands_Notes_2024-04-01.txt` – all‑hands notes referencing the API redesign, Toolsmith, and risk mitigation.  
> 9. `Customer_Feedback_Summary_API_2024-04-05.docx` – synthesized customer feedback about the API; include 3–5 concrete complaints and 3–5 requested improvements.  
> 10. `Experiment_Notes_Performance_Tuning_2024-04-12.txt` – notes from load/performance experiments before and after the redesign, with metrics and conclusions.  
>  
> For each document, keep the style business‑casual and realistic (like internal engineering / product docs). Use explicit dates (YYYY‑MM‑DD) in the text so an AI assistant can build a timeline later.  
>  
> IMPORTANT: Output as structured Markdown with clear headings so I can easily copy each document into its own file.

Save the generated content into your local filesystem (e.g., `~/Documents/GhostDemo/…`) using the suggested filenames.

## 2. Pre‑Demo Setup

1. **Start backend**  
   ```bash
   cd apps/ghost/backend
   npm run dev
   ```
   Note the URL/port printed in the logs (for local dev this is typically `http://localhost:3000`); the daemon config should point at this.

2. **Start dashboard** (Vite dev server)  
   ```bash
   cd apps/ghost/dashboard
   npm run dev
   ```
   Open the printed URL (typically `http://localhost:5173`) in a browser.

3. **Start daemon (Electron app)**  
   ```bash
   cd apps/ghost/daemon
   npm run dev
   ```
   In `apps/ghost/daemon/config.json`:
   - Ensure `"backend.url"` matches the backend URL from step 1 and `"backend.apiKey"` matches the backend `API_KEY` from `apps/ghost/backend/.env`.
   - Set `"voice.sttProvider"` to `"gemini"` (cloud STT) or `"local-whisper"` if you have the `whisper` CLI installed.
   - Set `"voice.ttsProvider"` to `"system"` or `"elevenlabs"` based on your TTS setup.
   - Control screenshots: set `"vision.captureMode": "always"` (default) or `"on-demand"` to only capture when you say things like “what’s on my screen?”. You can also disable with `"vision.enabled": false` if you don’t want screenshots at all during the demo.

4. **Confirm DB + embeddings**  
   - Backend should be using `apps/ghost/backend/ghost.db` (see `.env` there).  
   - Embeddings for existing memories should already be backfilled.

## 3. Index the Demo Files

1. Place the 10 generated documents in a dedicated demo folder, e.g. `~/Documents/GhostDemo`.  
2. Ensure `apps/ghost/daemon/config.json` includes that directory under `"files.scanDirectories"` (for the hackathon, keep it to that single folder so the demo stays predictable).  
3. Trigger indexing (e.g., via a voice command like “index my files” or by using the file indexing flow you already have).  
4. Watch the backend logs for `/api/files/index` and confirm it returns `200` and counts the files.  
5. File content ingestion: Ghost now reads supported text files (`.txt`, `.md`, <512KB) and creates memories from their contents, so summaries have real text to draw from (not just filenames). Keep the API redesign docs in text/markdown for best results.

## 4. Core Demo Flow (Suggested Script)

1. **Show the dashboard before any commands**  
   - Explain: “This is the Ghost dashboard. It shows recent commands, actions, and the memories used by the assistant.”

2. **Screen context: “What’s on my screen?”**  
   - Make sure you have something readable on screen (for example, one of the demo documents, an email, or a code file).  
   - Say: “Hey Ghost, what’s on my screen?”  
   - Expected:  
     - The daemon captures a screenshot and extracts text via macOS Vision.  
     - The backend stores a visual memory that includes the screenshot path and extracted text.  
     - The assistant responds by describing what it sees on your screen.  
     - The dashboard shows a new command; when you inspect its memories you can see an entry tied to that screenshot.  

3. **Open a doc by name**  
   - Say: “Hey Ghost, open the Project Alpha API redesign document.”  
   - Expected:  
     - Backend selects a `file.open` action pointing at the appropriate file.  
     - Daemon opens it.  
     - Dashboard shows a new command with:  
       - `entity.file` memories used.  
       - A `file.open` action.

4. **Open a doc by context (Downloads / recent)**  
   - Say: “Open the latest API comparison file from my Downloads.”  
   - Expected:  
     - Fallback heuristics pick the `API_Comparison_Matrix…` file in Downloads.  
     - Command appears with a `file.open` action and associated file memories.

5. **Summarize a topic across files + decisions**  
   - Say: “Summarize everything about the API redesign.”  
   - Expected:  
     - Context engine fetches relevant memories (meeting notes, design docs, roadmap).  
     - If your API redesign docs are `.txt/.md` and were indexed, their contents are ingested and should appear as source memories.  
     - Backend produces an `info.summarize` action with:  
       - `topic: "API redesign"`  
       - `sources: [memory IDs]`  
       - `format: "timeline"`  
     - `assistant_text` sounds like a short timeline summary.  
     - Dashboard shows:  
       - The `info.summarize` action with topic/format/source count.  
       - The list of `memories_used` underneath (files + fact/decision memories).

6. **Recall a specific detail**  
   - Say: “What did Sarah complain about in the API redesign?”  
   - Expected:  
     - Search retrieves the March 15 meeting notes.  
     - Assistant responds with a short recall.  
     - Dashboard shows `info.recall` and the underlying memory for that decision.

## 5. Optional Extra Beats

- **Show the full voice loop**  
  - On camera, hit the Ghost hotkey (e.g. Option+Space).  
  - Narrate what’s happening:  
    - The configured STT provider (e.g. Gemini STT or local Whisper) records audio → transcribes to text.  
    - The backend receives the text and builds context via MemoryLayer (semantic search + embeddings).  
    - The configured LLM generates a JSON response with `assistant_text` + actions.  
    - The daemon plays TTS audio back to you while the dashboard updates.  
  - You don’t need to show every log line; just briefly point to the backend logs and say “this is the STT → search → LLM → TTS pipeline.”

- **File indexing + semantic recall**  
  - After indexing, ask things like:  
    - “Open the latest Toolsmith roadmap document.”  
    - “Open a random API redesign document from my Downloads.”  
  - Point out: Ghost is not scanning the whole filesystem at query time; it’s hitting the pre‑indexed MemoryLayer memories plus local embeddings.

- **Summarization as a MemoryLayer use case**  
  - Emphasize that the `info.summarize` action is driven by the same memories that power `file.open` and `info.recall`.  
  - Mention that in a fuller implementation, you could add doc‑level summary memories (LLM‑generated) and embed those too.

- **Memory inspection / storage view**  
  - Briefly switch to a SQLite viewer or CLI and show:  
    - `memories` table with `content`, `metadata`, `embedding`.  
    - `relationships` linking e.g. collection → file memories or summary → source memories.  
    - `commands`, `actions`, and `command_memories` linking a spoken command to the memories it used.  
  - Key line for the demo: “All of this lives locally in `ghost.db` using the MemoryLayer schema; we can swap out the UI or LLM without changing the storage model.”

- **Confidence scores and embeddings**  
  - Show that most file memories have `confidence = 1.0` (from bulk indexing) or `0.82` (from file actions), and that the `embedding` column is populated.  
  - Mention that ranking in practice comes from vector search + recall heuristics, with `confidence` as an extra weight.

## 6. Recording Tips

- Start recording with the dashboard visible and backend logs in a small terminal window.  
- Speak commands clearly and give a brief pause after each so the dashboard updates are visible.  
- For the summary demo, scroll the memories list to highlight which files/decisions were used as sources.

If you’re short on time, focus on this sequence:  
1) Voice command to open a doc by name.  
2) Voice command to open a “latest” doc by context.  
3) Voice command to “summarize everything about the API redesign” and show the `info.summarize` action + memories.  
4) Quick peek at `ghost.db` to prove everything is local and MemoryLayer‑backed.
