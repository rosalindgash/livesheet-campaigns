import { sanitizeBasicEmailHtml } from "@/lib/html-sanitizer";

export type TemplateContext = {
  values: Record<string, string>;
  availableColumns: string[];
};

export type TemplateRenderResult = {
  output: string;
  missingColumns: string[];
  referencedColumns: string[];
};

const VARIABLE_PATTERN = /{{\s*(?!#if\b|else\b|\/if\b)([a-zA-Z_][\w.-]*)\s*}}/g;
const IF_BLOCK_PATTERN =
  /{{#if\s+([a-zA-Z_][\w.-]*)\s*}}([\s\S]*?)(?:{{else}}([\s\S]*?))?{{\/if}}/g;
const IF_VARIABLE_PATTERN = /{{#if\s+([a-zA-Z_][\w.-]*)\s*}}/g;
const UNSUBSCRIBE_PLACEHOLDER = "{{unsubscribe_url}}";

export function buildTemplateContext(headers: string[], row: string[]): TemplateContext {
  const values: Record<string, string> = {};

  headers.forEach((header, index) => {
    const value = row[index] ?? "";
    const trimmedHeader = header.trim();

    if (!trimmedHeader) {
      return;
    }

    values[trimmedHeader] = value;
    values[normalizeTemplateName(trimmedHeader)] = value;
  });

  return {
    values,
    availableColumns: headers.map(normalizeTemplateName),
  };
}

export function renderTemplate(template: string, context: TemplateContext): TemplateRenderResult {
  const normalizedTemplate = unwrapConditionalControlParagraphs(template);
  const referencedColumns = getReferencedColumns(normalizedTemplate);
  const missingColumns = referencedColumns.filter((column) => !hasColumn(column, context));
  const withConditionals = renderConditionals(normalizedTemplate, context);
  const output = withConditionals.replace(VARIABLE_PATTERN, (_, rawName: string) => {
    return resolveValue(rawName, context) ?? "";
  });

  return {
    output,
    missingColumns,
    referencedColumns,
  };
}

export function renderTemplateBodyWithUnsubscribe({
  bodyTemplate,
  context,
  unsubscribeUrl,
}: {
  bodyTemplate: string;
  context: TemplateContext;
  unsubscribeUrl: string;
}): TemplateRenderResult {
  const contextWithUnsubscribe = {
    ...context,
    values: {
      ...context.values,
      unsubscribe_url: unsubscribeUrl,
    },
    availableColumns: [...new Set([...context.availableColumns, "unsubscribe_url"])],
  };
  const rendered = renderTemplate(bodyTemplate, contextWithUnsubscribe);
  const output = templateContainsUnsubscribePlaceholder(bodyTemplate)
    ? rendered.output
    : `${rendered.output}${buildUnsubscribeFooter(unsubscribeUrl)}`;

  return {
    ...rendered,
    output: sanitizeBasicEmailHtml(output),
  };
}

export function normalizeTemplateName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function renderConditionals(template: string, context: TemplateContext): string {
  let rendered = template;

  for (let index = 0; index < 20; index += 1) {
    const next = rendered.replace(
      IF_BLOCK_PATTERN,
      (_match, rawName: string, truthyBlock: string, falseyBlock = "") => {
        const value = resolveValue(rawName, context);

        return isTruthy(value) ? truthyBlock : falseyBlock;
      },
    );

    if (next === rendered) {
      return rendered;
    }

    rendered = next;
  }

  return rendered;
}

function getReferencedColumns(template: string): string[] {
  const references = new Set<string>();

  for (const match of template.matchAll(VARIABLE_PATTERN)) {
    references.add(match[1]);
  }

  for (const match of template.matchAll(IF_VARIABLE_PATTERN)) {
    references.add(match[1]);
  }

  return Array.from(references);
}

function resolveValue(rawName: string, context: TemplateContext): string | null {
  const exactValue = context.values[rawName];

  if (typeof exactValue === "string") {
    return exactValue;
  }

  const normalizedValue = context.values[normalizeTemplateName(rawName)];

  return typeof normalizedValue === "string" ? normalizedValue : null;
}

function hasColumn(rawName: string, context: TemplateContext): boolean {
  return resolveValue(rawName, context) !== null;
}

function isTruthy(value: string | null): boolean {
  if (value === null) {
    return false;
  }

  const normalized = value.trim().toLowerCase();

  return normalized.length > 0 && normalized !== "false" && normalized !== "0" && normalized !== "no";
}

function unwrapConditionalControlParagraphs(template: string): string {
  return template
    .replace(/<p>\s*({{#if\s+[a-zA-Z_][\w.-]*\s*}})\s*<\/p>/g, "$1")
    .replace(/<p>\s*({{else}})\s*<\/p>/g, "$1")
    .replace(/<p>\s*({{\/if}})\s*<\/p>/g, "$1");
}

function buildUnsubscribeFooter(unsubscribeUrl: string): string {
  return `<p><a href="${escapeAttribute(unsubscribeUrl)}" target="_blank" rel="noopener noreferrer">Unsubscribe</a></p>`;
}

function templateContainsUnsubscribePlaceholder(template: string): boolean {
  return template.includes(UNSUBSCRIBE_PLACEHOLDER);
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
