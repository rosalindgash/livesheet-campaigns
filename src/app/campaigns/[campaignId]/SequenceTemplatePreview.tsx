"use client";

import { useMemo, useState } from "react";

import { sanitizeBasicEmailHtml } from "@/lib/html-sanitizer";
import { buildTemplateContext, renderTemplate } from "@/lib/templates";

type SequenceTemplatePreviewProps = {
  bodyTemplate: string;
  headers: string[];
  rows: string[][];
  subjectTemplate: string;
};

export function SequenceTemplatePreview({
  bodyTemplate,
  headers,
  rows,
  subjectTemplate,
}: SequenceTemplatePreviewProps) {
  const [selectedRowIndex, setSelectedRowIndex] = useState(0);
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
  const renderedBodyHtml = useMemo(() => sanitizeBasicEmailHtml(body.output), [body.output]);
  const missingColumns = Array.from(new Set([...subject.missingColumns, ...body.missingColumns]));

  if (headers.length === 0 || rows.length === 0) {
    return <p className="muted">Validate the sheet to preview this template.</p>;
  }

  return (
    <div className="template-rendered">
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

      {missingColumns.length > 0 ? (
        <div className="notice error">Missing columns: {missingColumns.join(", ")}</div>
      ) : null}

      <div className="render-card">
        <p className="eyebrow">Rendered subject</p>
        <strong>{subject.output || "No subject template saved yet."}</strong>
      </div>

      <div className="render-card">
        <p className="eyebrow">Rendered body</p>
        {renderedBodyHtml ? (
          <div
            className="rendered-html"
            dangerouslySetInnerHTML={{ __html: renderedBodyHtml }}
          />
        ) : (
          <p className="muted">No body template saved yet.</p>
        )}
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
