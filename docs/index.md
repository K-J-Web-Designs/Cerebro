# Cerebro

**Illuminate Your Knowledge** — an offline-capable Progressive Web App (PWA) for managing personal knowledge, academic/industry research, reading highlights, and ideas across devices.

## Phase 1 MVP Modules

- **Core Workspace:** Supabase Auth (`@supabase/ssr` with Email/Password, Magic Link, and Google/GitHub OAuth), TipTap rich note-taking with `[[wikilinks]]`, tags/categories, `Cmd+K` hybrid keyword + vector search, and offline-first IndexedDB (`Dexie.js`) + delta sync (`/api/sync`).
- **Read Later:** URL & arXiv paper clipping via `@mozilla/readability`, distraction-free reader view, colored text highlights, margin annotations, and one-click promotion to Notes or Ideas.
- **Topic Explorer:** Interactive mind map (`@xyflow/react` + `@dagrejs/dagre`) synthesizing OpenAlex concepts & works, arXiv preprints, AI conceptual branches, and matching personal notes.
- **Knowledge Graph:** Interactive force-directed entity graph (`d3-force` + Canvas) connecting notes, papers, bookmarks, topics, and ideas with typed relationships.
- **Idea Incubator:** Pipeline stages (`spark` -> `exploring` -> `validated` -> `actionable` -> `archived`), ICE prioritization scoring, and AI Co-Thinker assistance (Google Gemini default with OpenAI/Anthropic/local fallback).

## Deployment
- **Local:** `npm install && npm run dev`
- **Cybertron (Docker Compose + Cloudflare):** `docker compose up -d --build` (health check at `/api/health`)
