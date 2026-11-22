import Link from "next/link";
import {
  ArrowRight,
  BookMarked,
  Compass,
  FileText,
  Lightbulb,
  Network,
  WifiOff,
} from "lucide-react";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import styles from "./page.module.css";

export default async function LandingPage() {
  const user = await getAuthenticatedUser();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <img
            src="/icon.svg"
            alt="Cerebro mark"
            width={32}
            height={32}
            className={styles.logo}
          />
          <div>
            <span className={styles.brandName}>Cerebro</span>
            <span className={styles.brandTag}>Illuminate Your Knowledge</span>
          </div>
        </div>
        <nav className={styles.navActions}>
          {user ? (
            <Link href="/workspace" className="btn btn-primary">
              Open Workspace <ArrowRight size={15} />
            </Link>
          ) : (
            <>
              <Link href="/login" className="btn btn-ghost">
                Sign In
              </Link>
              <Link href="/login?mode=register" className="btn btn-primary">
                Get Started <ArrowRight size={15} />
              </Link>
            </>
          )}
        </nav>
      </header>

      <main className={styles.main}>
        <section className={styles.hero}>
          <p className={styles.kicker}>
            Progressive Web Workspace for Researchers & Builders
          </p>
          <h1 className={styles.headline}>
            Turn scattered reading, notes, and sparks into a living knowledge
            graph.
          </h1>
          <p className={styles.lead}>
            Cerebro unifies rich wikilinked notes, distraction-free Read Later
            annotations, OpenAlex &amp; arXiv Topic Mind Maps, and AI-assisted
            Idea Incubation—synced across devices and ready offline.
          </p>
          <div className={styles.ctaRow}>
            <Link
              href={user ? "/workspace" : "/login"}
              className="btn btn-primary"
            >
              {user
                ? "Continue to Workspace"
                : "Sign In with Supabase"}
              <ArrowRight size={16} />
            </Link>
            <a href="#modules" className="btn">
              Explore Modules
            </a>
          </div>
        </section>

        <section id="modules" className={styles.modules}>
          <article className={styles.moduleCard}>
            <div className={styles.iconWrap} data-tone="amber">
              <FileText size={20} />
            </div>
            <h2>Core Notes &amp; Hybrid Search</h2>
            <p>
              Write structured Markdown notes with <code>[[wikilinks]]</code>,
              customizable tags, and instant keyword + vector similarity search.
            </p>
          </article>

          <article className={styles.moduleCard}>
            <div className={styles.iconWrap} data-tone="teal">
              <BookMarked size={20} />
            </div>
            <h2>Read Later &amp; Annotations</h2>
            <p>
              Clip web articles and arXiv preprints into a clean offline reader
              with colored highlights, margin notes, and AI takeaways.
            </p>
          </article>

          <article className={styles.moduleCard}>
            <div className={styles.iconWrap} data-tone="amber">
              <Compass size={20} />
            </div>
            <h2>Topic Explorer Mind Maps</h2>
            <p>
              Enter any research topic to synthesize OpenAlex works, arXiv
              papers, conceptual branches, and your own notes on an interactive
              canvas.
            </p>
          </article>

          <article className={styles.moduleCard}>
            <div className={styles.iconWrap} data-tone="sage">
              <Network size={20} />
            </div>
            <h2>Visual Knowledge Graph</h2>
            <p>
              Explore interconnected notes, papers, topics, and ideas in a live
              force-directed graph to uncover cross-domain patterns.
            </p>
          </article>

          <article className={styles.moduleCard}>
            <div className={styles.iconWrap} data-tone="terra">
              <Lightbulb size={20} />
            </div>
            <h2>Idea Incubator</h2>
            <p>
              Capture sparks, prioritize with ICE scoring, and partner with an
              AI co-thinker (Gemini / OpenAI / Anthropic) to stress-test angles.
            </p>
          </article>

          <article className={styles.moduleCard}>
            <div className={styles.iconWrap} data-tone="teal">
              <WifiOff size={20} />
            </div>
            <h2>Offline-First PWA Sync</h2>
            <p>
              Every edit and highlight persists locally in IndexedDB with an
              automatic delta sync queue whenever connectivity returns.
            </p>
          </article>
        </section>
      </main>

      <footer className={styles.footer}>
        <span>Cerebro · Built for Academic Directors, Researchers &amp; CTOs</span>
        <span>Phase 1 MVP · Next.js + PostgreSQL + Auth.js + Gemini AI</span>
      </footer>
    </div>
  );
}
