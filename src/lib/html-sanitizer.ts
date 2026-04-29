import sanitizeHtml from "sanitize-html";

export const BASIC_EMAIL_HTML_TAGS = [
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "ul",
  "ol",
  "li",
  "a",
] as const;

export function sanitizeBasicEmailHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [...BASIC_EMAIL_HTML_TAGS],
    allowedAttributes: {
      a: ["href", "target", "rel"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    disallowedTagsMode: "discard",
    transformTags: {
      a: (_tagName, attribs) => ({
        tagName: "a",
        attribs: {
          href: attribs.href ?? "",
          target: "_blank",
          rel: "noopener noreferrer",
        },
      }),
    },
  });
}
