import { generateText, embed } from "ai";
import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";

export type AIProviderName = "google" | "openai" | "anthropic" | "local";

export interface IdeaAssistResult {
  provider: AIProviderName;
  suggestions: Array<{
    id: string;
    kind: "angle" | "critique" | "question" | "connection";
    text: string;
  }>;
  suggestedTags: string[];
}

export interface TopicConceptBranch {
  id: string;
  label: string;
  summary: string;
  subtopics: string[];
}

export interface TopicExpansionResult {
  provider: AIProviderName;
  branches: TopicConceptBranch[];
}

export interface ArticleSummaryResult {
  provider: AIProviderName;
  summary: string;
  keyTakeaways: string[];
  suggestedTags: string[];
}

const EMBEDDING_DIM = 768;

export function getActiveAIProvider(): AIProviderName {
  const preferred = (process.env.AI_PROVIDER ?? "google").toLowerCase();
  if (preferred === "google" && process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return "google";
  }
  if (preferred === "openai" && process.env.OPENAI_API_KEY) {
    return "openai";
  }
  if (preferred === "anthropic" && process.env.ANTHROPIC_API_KEY) {
    return "anthropic";
  }
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) return "google";
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return "local";
}

function getLanguageModel(provider: AIProviderName) {
  switch (provider) {
    case "google":
      return google("gemini-2.5-flash");
    case "openai":
      return openai("gpt-4o-mini");
    case "anthropic":
      return anthropic("claude-3-5-haiku-latest");
    default:
      return null;
  }
}

/**
 * Deterministic 768-dim feature hashing embedding for offline/local semantic search.
 */
export function deterministicEmbedding(text: string): number[] {
  const vec = new Array<number>(EMBEDDING_DIM).fill(0);
  const normalized = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .trim();

  if (!normalized) return vec;

  const words = normalized.split(/\s+/).filter((w) => w.length > 1);
  for (const word of words) {
    // Word unigram hash
    let h1 = 2166136261;
    for (let i = 0; i < word.length; i++) {
      h1 ^= word.charCodeAt(i);
      h1 = Math.imul(h1, 16777619);
    }
    const idx = Math.abs(h1) % EMBEDDING_DIM;
    vec[idx] += 1;

    // Character trigram hashes for morphological overlap
    for (let i = 0; i <= word.length - 3; i++) {
      const tri = word.slice(i, i + 3);
      let h2 = 2166136261;
      for (let j = 0; j < tri.length; j++) {
        h2 ^= tri.charCodeAt(j);
        h2 = Math.imul(h2, 16777619);
      }
      vec[Math.abs(h2) % EMBEDDING_DIM] += 0.35;
    }
  }

  let norm = 0;
  for (let i = 0; i < EMBEDDING_DIM; i++) {
    norm += vec[i] * vec[i];
  }
  const mag = Math.sqrt(norm) || 1;
  for (let i = 0; i < EMBEDDING_DIM; i++) {
    vec[i] = Number((vec[i] / mag).toFixed(6));
  }
  return vec;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const provider = getActiveAIProvider();
  const trimmed = text.slice(0, 6000).trim();
  if (!trimmed) return deterministicEmbedding("");

  try {
    if (provider === "google") {
      const { embedding } = await embed({
        model: google.textEmbeddingModel("text-embedding-004"),
        value: trimmed,
      });
      if (embedding.length === EMBEDDING_DIM) return embedding;
    } else if (provider === "openai") {
      const { embedding } = await embed({
        model: openai.textEmbeddingModel("text-embedding-3-small"),
        value: trimmed,
        providerOptions: {
          openai: { dimensions: EMBEDDING_DIM },
        },
      });
      if (embedding.length === EMBEDDING_DIM) return embedding;
    }
  } catch (err) {
    console.warn("Embedding API fallback to deterministic vector:", err);
  }

  return deterministicEmbedding(trimmed);
}

function parseJsonBlock<T>(raw: string): T | null {
  try {
    const cleaned = raw
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    return JSON.parse(cleaned) as T;
  } catch {
    return null;
  }
}

export async function expandIdeaWithAI(params: {
  title: string;
  content: string;
  mode?: "expand" | "critique" | "connect";
  relatedTitles?: string[];
}): Promise<IdeaAssistResult> {
  const provider = getActiveAIProvider();
  const model = getLanguageModel(provider);

  if (model) {
    try {
      const { text } = await generateText({
        model,
        prompt: `You are Cerebro's Idea Incubator co-thinker. Analyze the user's idea and respond ONLY with valid JSON matching:
{
  "suggestions": [
    { "kind": "angle" | "critique" | "question" | "connection", "text": "string" }
  ],
  "suggestedTags": ["tag1", "tag2"]
}

Mode focus: ${params.mode ?? "expand"}
Idea Title: ${params.title}
Idea Notes: ${params.content}
Existing Workspace Notes: ${(params.relatedTitles ?? []).slice(0, 8).join("; ") || "None"}

Provide 3 concise, high-signal suggestions and up to 3 tags.`,
      });

      const parsed = parseJsonBlock<{
        suggestions?: Array<{
          kind: "angle" | "critique" | "question" | "connection";
          text: string;
        }>;
        suggestedTags?: string[];
      }>(text);

      if (parsed?.suggestions?.length) {
        return {
          provider,
          suggestions: parsed.suggestions.map((s) => ({
            id: crypto.randomUUID(),
            kind: s.kind,
            text: s.text,
          })),
          suggestedTags: parsed.suggestedTags ?? [],
        };
      }
    } catch (err) {
      console.warn("Idea AI fallback:", err);
    }
  }

  const keywords = extractKeywords(
    `${params.title} ${params.content}`,
    3
  );
  const related = params.relatedTitles?.[0];

  const suggestions: IdeaAssistResult["suggestions"] = [
    {
      id: crypto.randomUUID(),
      kind: "angle",
      text: `Frame "${params.title}" around a measurable 2-week pilot with a single core persona before expanding scope.`,
    },
    {
      id: crypto.randomUUID(),
      kind: "critique",
      text: `Stress-test the strongest assumption in "${params.title}": what existing workflow would a user abandon to adopt this?`,
    },
    {
      id: crypto.randomUUID(),
      kind: related ? "connection" : "question",
      text: related
        ? `Synthesize this idea directly with your existing note "${related}" to uncover shared evidence and open gaps.`
        : `Which primary research paper or empirical benchmark in ${keywords[0] ?? "this domain"} would validate or falsify this hypothesis?`,
    },
  ];

  return {
    provider: "local",
    suggestions,
    suggestedTags: keywords.map((k) => capitalize(k)),
  };
}

export async function expandTopicConceptsWithAI(
  topic: string,
  relatedNoteTitles: string[]
): Promise<TopicExpansionResult> {
  const provider = getActiveAIProvider();
  const model = getLanguageModel(provider);

  if (model) {
    try {
      const { text } = await generateText({
        model,
        prompt: `You are Cerebro's Topic Explorer mind-map synthesizer. Given a topic, break it into 4 distinct conceptual branches with 2 subtopics each. Respond ONLY with valid JSON:
{
  "branches": [
    {
      "label": "Branch Name",
      "summary": "One sentence explanation",
      "subtopics": ["Subtopic A", "Subtopic B"]
    }
  ]
}
Topic: ${topic}
User's related notes: ${relatedNoteTitles.slice(0, 5).join(", ") || "None"}`,
      });

      const parsed = parseJsonBlock<{
        branches?: Array<{
          label: string;
          summary: string;
          subtopics: string[];
        }>;
      }>(text);

      if (parsed?.branches?.length) {
        return {
          provider,
          branches: parsed.branches.slice(0, 5).map((b, idx) => ({
            id: `branch-${idx + 1}`,
            label: b.label,
            summary: b.summary,
            subtopics: (b.subtopics ?? []).slice(0, 3),
          })),
        };
      }
    } catch (err) {
      console.warn("Topic AI fallback:", err);
    }
  }

  return {
    provider: "local",
    branches: [
      {
        id: "branch-1",
        label: "Core Foundations",
        summary: `Fundamental definitions, mental models, and theoretical pillars behind ${topic}.`,
        subtopics: [`${topic} taxonomy`, "Historical evolution"],
      },
      {
        id: "branch-2",
        label: "Methods & Architectures",
        summary: `Practical systems, technical patterns, and implementation tradeoffs in ${topic}.`,
        subtopics: ["System design patterns", "Benchmarks & evaluation"],
      },
      {
        id: "branch-3",
        label: "Empirical Evidence",
        summary: `Recent peer-reviewed studies, datasets, and reproducible findings on ${topic}.`,
        subtopics: ["Key metrics & studies", "Replication gaps"],
      },
      {
        id: "branch-4",
        label: "Open Problems & Applications",
        summary: `Unresolved research questions and applied opportunities for ${topic}.`,
        subtopics: ["Failure modes & risks", "Next-generation workflows"],
      },
    ],
  };
}

export async function summarizeArticleWithAI(
  title: string,
  content: string
): Promise<ArticleSummaryResult> {
  const provider = getActiveAIProvider();
  const model = getLanguageModel(provider);

  if (model && content.trim().length > 80) {
    try {
      const { text } = await generateText({
        model,
        prompt: `Summarize the following article concisely for a researcher's Read Later queue. Respond ONLY with valid JSON:
{
  "summary": "2-sentence executive summary",
  "keyTakeaways": ["takeaway 1", "takeaway 2", "takeaway 3"],
  "suggestedTags": ["Tag1", "Tag2"]
}
Title: ${title}
Content: ${content.slice(0, 6000)}`,
      });
      const parsed = parseJsonBlock<{
        summary?: string;
        keyTakeaways?: string[];
        suggestedTags?: string[];
      }>(text);

      if (parsed?.summary) {
        return {
          provider,
          summary: parsed.summary,
          keyTakeaways: parsed.keyTakeaways ?? [],
          suggestedTags: parsed.suggestedTags ?? [],
        };
      }
    } catch (err) {
      console.warn("Summary AI fallback:", err);
    }
  }

  const sentences = content
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .filter((s) => s.trim().length > 24);

  const summary =
    sentences.slice(0, 2).join(" ") ||
    `Saved article: ${title}. Ready for offline reading and annotation.`;

  return {
    provider: "local",
    summary: summary.slice(0, 320),
    keyTakeaways: sentences.slice(0, 3).map((s) => s.slice(0, 140)),
    suggestedTags: extractKeywords(`${title} ${content}`, 3).map(capitalize),
  };
}

const STOP_WORDS = new Set([
  "about",
  "after",
  "also",
  "among",
  "an",
  "and",
  "are",
  "article",
  "based",
  "because",
  "been",
  "between",
  "both",
  "could",
  "each",
  "from",
  "have",
  "into",
  "more",
  "most",
  "other",
  "over",
  "paper",
  "research",
  "should",
  "some",
  "such",
  "system",
  "systems",
  "than",
  "that",
  "their",
  "them",
  "then",
  "there",
  "these",
  "they",
  "this",
  "through",
  "using",
  "what",
  "when",
  "where",
  "which",
  "while",
  "with",
  "would",
]);

export function extractKeywords(text: string, limit = 5): string[] {
  const counts = new Map<string, number>();
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOP_WORDS.has(w));

  for (const token of tokens) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word]) => word);
}

function capitalize(str: string): string {
  return str ? str[0].toUpperCase() + str.slice(1) : str;
}
