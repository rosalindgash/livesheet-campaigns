"use client";

import { useMemo, useState } from "react";

import { buildTemplateContext, renderTemplate } from "@/lib/templates";

type TemplatePreviewProps = {
  headers: string[];
  rows: string[][];
};

const DEFAULT_SUBJECT_TEMPLATE = "Quick note for {{first_name}}";
const DEFAULT_BODY_TEMPLATE = `Hi {{first_name}},

{{#if e_transcript}}I saw your E-Transcript option and wanted to follow up.{{else}}I wanted to follow up with a quick note.{{/if}}

Best,`;

export function TemplatePreview({ headers, rows }: TemplatePreviewProps) {
  const [selectedRowIndex, setSelectedRowIndex] = useState(0);
  const [subjectTemplate, setSubjectTemplate] = useState(DEFAULT_SUBJECT_TEMPLATE);
  const [bodyTemplate, setBodyTemplate] = useState(DEFAULT_BODY_TEMPLATE);
  const selectedRow = useMemo(() => rows[selectedRowIndex] ?? [], [rows, selectedRowIndex]);
  const context = useMemo(
    () => buildTemplateContext(headers, selectedRow),
    [headers, selectedRow],
  );
  const subject = useMemo(
    () => renderTemplate(subjectTemplate, context),
    [context, subjectTemplate],
  );
  const body = useMemo(() => renderTemplate(bodyTemplate, context), [bodyTemplate, context]);
  const missingColumns = Array.from(new Set([...subject.missingColumns, ...body.missingColumns]));

  if (headers.length === 0 || rows.length === 0) {
    return <p className="muted">Validate the sheet to load preview rows.</p>;
  }

  return (
    <div className="template-preview-grid">
      <div className="template-editor">
        <label className="field">
          <span>Preview row</span>
          <select
            value={selectedRowIndex}
            onChange={(event) => setSelectedRowIndex(Number.parseInt(event.target.value, 10))}
          >
            {rows.map((row, index) => (
              <option key={index} value={index}>
                Row {index + 2}: {getRowLabel(headers, row)}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Subject template</span>
          <input
            value={subjectTemplate}
            onChange={(event) => setSubjectTemplate(event.target.value)}
          />
        </label>

        <label className="field">
          <span>Body template</span>
          <textarea
            rows={9}
            value={bodyTemplate}
            onChange={(event) => setBodyTemplate(event.target.value)}
          />
        </label>
      </div>

      <div className="template-rendered">
        {missingColumns.length > 0 ? (
          <div className="notice error">
            Missing columns: {missingColumns.join(", ")}
          </div>
        ) : null}

        <div className="render-card">
          <p className="eyebrow">Rendered subject</p>
          <strong>{subject.output}</strong>
        </div>

        <div className="render-card">
          <p className="eyebrow">Rendered body</p>
          <pre>{body.output}</pre>
        </div>
      </div>
    </div>
  );
}

function getRowLabel(headers: string[], row: string[]): string {
  const emailIndex = headers.findIndex((header) => header.trim().toLowerCase() === "email");
  const firstNameIndex = headers.findIndex((header) =>
    ["first_name", "first name", "firstname"].includes(header.trim().toLowerCase()),
  );
  const labelParts = [row[firstNameIndex], row[emailIndex]].filter(Boolean);

  return labelParts.length > 0 ? labelParts.join(" / ") : "Preview data";
}
