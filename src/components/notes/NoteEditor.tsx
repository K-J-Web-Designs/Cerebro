"use client";

import { useEffect } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import LinkExt from "@tiptap/extension-link";
import {
  Bold,
  CheckSquare,
  Code,
  Heading2,
  Italic,
  Link2,
  List,
  Quote,
} from "lucide-react";

function markdownToSimpleHtml(md: string): string {
  if (!md.trim()) return "<p></p>";
  if (md.trim().startsWith("<")) return md;
  return md
    .split(/\n{2,}/)
    .map((block) => {
      const trimmed = block.trim();
      if (trimmed.startsWith("### ")) return `<h3>${trimmed.slice(4)}</h3>`;
      if (trimmed.startsWith("## ")) return `<h2>${trimmed.slice(3)}</h2>`;
      if (trimmed.startsWith("# ")) return `<h1>${trimmed.slice(2)}</h1>`;
      if (trimmed.startsWith("> "))
        return `<blockquote><p>${trimmed.slice(2)}</p></blockquote>`;
      if (trimmed.startsWith("- ")) {
        const items = trimmed
          .split("\n")
          .map((line) => `<li>${line.replace(/^- /, "")}</li>`)
          .join("");
        return `<ul>${items}</ul>`;
      }
      return `<p>${trimmed.replace(/\n/g, "<br/>")}</p>`;
    })
    .join("");
}

export function NoteEditor({
  noteId,
  initialContent,
  linkableTitles,
  onChange,
}: {
  noteId: string;
  initialContent: string;
  linkableTitles: string[];
  onChange: (textContent: string, htmlContent: string) => void;
}) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder:
          "Capture your synthesis, cite papers, or insert [[wikilinks]] to connect the knowledge graph...",
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      LinkExt.configure({ openOnClick: false }),
    ],
    content: markdownToSimpleHtml(initialContent),
    onUpdate({ editor: ed }) {
      onChange(ed.getText({ blockSeparator: "\n\n" }), ed.getHTML());
    },
  });

  useEffect(() => {
    if (!editor) return;
    const nextHtml = markdownToSimpleHtml(initialContent);
    if (editor.getHTML() !== nextHtml) {
      editor.commands.setContent(nextHtml, { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId]);

  if (!editor) {
    return <div style={{ minHeight: 360 }}>Loading editor...</div>;
  }

  function insertWikilink(title: string) {
    if (!editor) return;
    editor.chain().focus().insertContent(`[[${title}]] `).run();
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "0.35rem",
          paddingBottom: "0.65rem",
          marginBottom: "0.85rem",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => editor.chain().focus().toggleBold().run()}
          aria-label="Bold"
        >
          <Bold size={15} />
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          aria-label="Italic"
        >
          <Italic size={15} />
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 2 }).run()
          }
          aria-label="Heading"
        >
          <Heading2 size={15} />
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          aria-label="Bullet list"
        >
          <List size={15} />
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => editor.chain().focus().toggleTaskList().run()}
          aria-label="Checklist"
        >
          <CheckSquare size={15} />
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          aria-label="Quote"
        >
          <Quote size={15} />
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          aria-label="Code block"
        >
          <Code size={15} />
        </button>

        {linkableTitles.length > 0 && (
          <div
            style={{
              marginLeft: "auto",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.35rem",
            }}
          >
            <Link2 size={14} />
            <select
              aria-label="Insert wikilink"
              className="select"
              style={{ width: "auto", padding: "0.25rem 0.5rem", fontSize: "0.8rem" }}
              value=""
              onChange={(e) => {
                if (e.target.value) {
                  insertWikilink(e.target.value);
                }
              }}
            >
              <option value="">+ Link item [[...]]</option>
              {linkableTitles.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="cerebro-prose">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
