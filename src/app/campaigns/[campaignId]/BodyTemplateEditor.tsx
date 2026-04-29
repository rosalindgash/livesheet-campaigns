"use client";

import {
  Bold,
  Italic,
  Link,
  List,
  ListOrdered,
  Redo2,
  Undo2,
  Unlink,
} from "lucide-react";
import { useMemo, useRef, type ClipboardEvent, type KeyboardEvent } from "react";

import { sanitizeBasicEmailHtml } from "@/lib/html-sanitizer";

type BodyTemplateEditorProps = {
  initialHtml: string;
  inputName: string;
};

export function BodyTemplateEditor({ initialHtml, inputName }: BodyTemplateEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const hiddenInputRef = useRef<HTMLInputElement>(null);
  const initialSanitizedHtml = useMemo(() => sanitizeBasicEmailHtml(initialHtml), [initialHtml]);

  function runCommand(command: string, value?: string) {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    normalizeEditorHtml();
    syncHtml();
  }

  function syncHtml() {
    if (!hiddenInputRef.current) {
      return;
    }

    hiddenInputRef.current.value = sanitizeBasicEmailHtml(editorRef.current?.innerHTML ?? "");
  }

  function addOrEditLink() {
    const href = window.prompt("Link URL");

    if (!href) {
      return;
    }

    runCommand("createLink", href);
    normalizeEditorHtml();
    syncHtml();
  }

  function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    event.preventDefault();

    const htmlData = event.clipboardData.getData("text/html");
    const textData = event.clipboardData.getData("text/plain");
    const content = htmlData || convertPlainTextToHtml(textData);

    document.execCommand("insertHTML", false, sanitizeBasicEmailHtml(content));
    normalizeEditorHtml();
    syncHtml();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      document.execCommand("defaultParagraphSeparator", false, "p");
    }
  }

  function normalizeEditorHtml() {
    editorRef.current?.querySelectorAll("a").forEach((link) => {
      link.setAttribute("target", "_blank");
      link.setAttribute("rel", "noopener noreferrer");
    });

    editorRef.current?.querySelectorAll("div").forEach((block) => {
      const paragraph = document.createElement("p");

      paragraph.innerHTML = block.innerHTML || "<br>";
      block.replaceWith(paragraph);
    });
  }

  return (
    <div className="body-editor-shell">
      <input
        defaultValue={initialSanitizedHtml}
        name={inputName}
        ref={hiddenInputRef}
        type="hidden"
      />
      <div className="editor-toolbar" aria-label="Body template toolbar">
        <button aria-label="Bold" title="Bold" type="button" onClick={() => runCommand("bold")}>
          <Bold aria-hidden="true" size={16} />
        </button>
        <button aria-label="Italic" title="Italic" type="button" onClick={() => runCommand("italic")}>
          <Italic aria-hidden="true" size={16} />
        </button>
        <button
          aria-label="Bulleted list"
          title="Bulleted list"
          type="button"
          onClick={() => runCommand("insertUnorderedList")}
        >
          <List aria-hidden="true" size={16} />
        </button>
        <button
          aria-label="Numbered list"
          title="Numbered list"
          type="button"
          onClick={() => runCommand("insertOrderedList")}
        >
          <ListOrdered aria-hidden="true" size={16} />
        </button>
        <button aria-label="Add or edit link" title="Add or edit link" type="button" onClick={addOrEditLink}>
          <Link aria-hidden="true" size={16} />
        </button>
        <button aria-label="Remove link" title="Remove link" type="button" onClick={() => runCommand("unlink")}>
          <Unlink aria-hidden="true" size={16} />
        </button>
        <button aria-label="Undo" title="Undo" type="button" onClick={() => runCommand("undo")}>
          <Undo2 aria-hidden="true" size={16} />
        </button>
        <button aria-label="Redo" title="Redo" type="button" onClick={() => runCommand("redo")}>
          <Redo2 aria-hidden="true" size={16} />
        </button>
      </div>
      <div
        className="body-editor"
        contentEditable
        dangerouslySetInnerHTML={{ __html: initialSanitizedHtml }}
        onBlur={syncHtml}
        onInput={syncHtml}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        ref={editorRef}
        role="textbox"
        suppressContentEditableWarning
      />
      <p className="muted editor-note">
        Use {"{{unsubscribe_url}}"} where you want the unsubscribe link to appear. If omitted,
        the app will append an unsubscribe footer during sending.
      </p>
    </div>
  );
}

function convertPlainTextToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
