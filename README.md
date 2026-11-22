# Cerebro

**Illuminate Your Knowledge** — an offline-capable Progressive Web App (PWA) for managing personal knowledge, academic/industry research, reading highlights, and ideas across devices.

## Phase 1 MVP Modules

- **Core Workspace**: Supabase Auth (`@supabase/ssr` with Email/Password, Magic Link, and Google/GitHub OAuth), TipTap rich note-taking with `[[wikilinks]]`, tags/categories, `⌘K` hybrid keyword + vector search, and offline-first IndexedDB (`Dexie.js`) + delta sync (`/api/sync`).
- **Read Later**: URL & arXiv paper clipping via `@mozilla/readability`, distraction-free reader view, colored text highlights, margin annotations, and one-click promotion to Notes or Ideas.
- **Topic Explorer**: Interactive mind map (`@xyflow/react` + `@dagrejs/dagre`) synthesizing OpenAlex concepts & works, arXiv preprints, AI conceptual branches, and matching personal notes.
- **Knowledge Graph**: Interactive force-directed entity graph (`d3-force` + Canvas) connecting notes, papers, bookmarks, topics, and ideas with typed relationships.
- **Idea Incubator**: Pipeline stages (`spark` → `exploring` → `validated` → `actionable` → `archived`), ICE prioritization scoring, and AI Co-Thinker assistance (Google Gemini default with OpenAI/Anthropic/local fallback).

## Connecting Your Supabase Account & Database

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure `.env.local`** using your existing Supabase project credentials (Dashboard → Project Settings → API & Database):
   ```bash
   cp .env.example .env.local
   # NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
   # NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
   # DATABASE_URL=postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres
   # AI_PROVIDER=google
   # GOOGLE_GENERATIVE_AI_API_KEY=<your-gemini-key>
   ```
   *(In your Supabase Auth settings, add `http://localhost:3000/auth/callback` and your production domain `/auth/callback` to Redirect URLs.)*

3. **Initialize Supabase tables** (optional—the app also auto-creates tables on first request):
   Run [supabase/setup.sql](supabase/setup.sql) in the Supabase SQL Editor, or run `npm run db:push`.

4. **Run development server**:
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) and sign in with your existing Supabase account (Email/Password, Magic Link, or OAuth). Without Supabase env vars, Cerebro runs in local preview mode backed by embedded PGlite.

## Verification Scripts

```bash
npm run typecheck
npm run lint
npm test
npm run build
```