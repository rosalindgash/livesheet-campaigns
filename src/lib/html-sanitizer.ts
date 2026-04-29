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
      ol: ["style"],
      ul: ["style"],
    },
    allowedStyles: {
      ol: {
        margin: [/^0$/],
        "margin-bottom": [/^\d+px$/],
        "margin-top": [/^\d+px$/],
        "padding-left": [/^\d+px$/],
      },
      ul: {
        margin: [/^0$/],
        "margin-bottom": [/^\d+px$/],
        "margin-top": [/^\d+px$/],
        "padding-left": [/^\d+px$/],
      },
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
      ol: (_tagName, attribs) => ({
        tagName: "ol",
        attribs: {
          ...attribs,
          style: "margin:0;padding-left:24px",
        },
      }),
      ul: (_tagName, attribs) => ({
        tagName: "ul",
        attribs: {
          ...attribs,
          style: "margin:0;padding-left:24px",
        },
      }),
    },
  });
}

export function normalizeBasicEmailHtml(html: string): string {
  return normalizeParagraphSpacing(sanitizeBasicEmailHtml(removeEmptyParagraphs(html)));
}

function removeEmptyParagraphs(html: string): string {
  let normalized = html;

  for (let index = 0; index < 10; index += 1) {
    const next = normalized
      .replace(/<p>(?:\s|&nbsp;|<br\s*\/?>)*<\/p>/gi, "")
      .replace(/(?:<br\s*\/?>\s*){3,}/gi, "<br><br>");

    if (next === normalized) {
      return normalized.trim();
    }

    normalized = next;
  }

  return normalized.trim();
}

type EmailBlock = {
  html: string;
  kind: "list" | "paragraph";
  plainText: string;
};

function normalizeParagraphSpacing(html: string): string {
  const blocks = getEmailBlocks(html);

  if (blocks.length === 0) {
    return html.trim();
  }

  const closeIndex = blocks.findIndex((block) => isComplimentaryClose(block.plainText));

  return blocks
    .map((block, index) => {
      if (index === 0) {
        return block.html;
      }

      return `${getBlockSeparator(blocks[index - 1], block, index - 1, closeIndex)}${block.html}`;
    })
    .join("")
    .trim();
}

function getEmailBlocks(html: string): EmailBlock[] {
  return html
    .split(/(<(?:p|ul|ol)\b[^>]*>[\s\S]*?<\/(?:p|ul|ol)>)/gi)
    .map((part) => parseEmailBlock(part))
    .filter((block): block is EmailBlock => Boolean(block));
}

function parseEmailBlock(part: string): EmailBlock | null {
  const trimmed = part.trim();

  if (!trimmed) {
    return null;
  }

  const listMatch = trimmed.match(/^<(ul|ol)\b[^>]*>[\s\S]*<\/\1>$/i);

  if (listMatch) {
    return {
      html: trimmed,
      kind: "list",
      plainText: getPlainText(trimmed),
    };
  }

  const paragraphMatch = trimmed.match(/^<p\b[^>]*>([\s\S]*?)<\/p>$/i);
  const html = paragraphMatch ? paragraphMatch[1].trim() : trimmed;

  if (!html || isEmptyHtml(html)) {
    return null;
  }

  return {
    html,
    kind: "paragraph",
    plainText: getPlainText(html),
  };
}

function getBlockSeparator(
  previous: EmailBlock,
  current: EmailBlock,
  previousIndex: number,
  closeIndex: number,
): string {
  if (previous.kind === "list" || current.kind === "list") {
    return "<br><br>";
  }

  if (isSignatureContinuation(previous, current, previousIndex, closeIndex)) {
    return "<br>";
  }

  return "<br><br>";
}

function isSignatureContinuation(
  previous: EmailBlock,
  current: EmailBlock,
  previousIndex: number,
  closeIndex: number,
): boolean {
  if (closeIndex < 0 || previousIndex <= closeIndex) {
    return false;
  }

  if (isLinkOnly(current.html)) {
    return looksLikeFooterAddress(previous.plainText);
  }

  if (looksLikeFooterAddress(current.plainText)) {
    return false;
  }

  return isShortSignatureLine(previous.plainText) && isShortSignatureLine(current.plainText);
}

function isComplimentaryClose(value: string): boolean {
  return /^(best|best regards|regards|sincerely|thanks|thank you|warmly|cheers),?$/i.test(
    value.trim(),
  );
}

function isShortSignatureLine(value: string): boolean {
  const trimmed = value.trim();

  return trimmed.length > 0 && trimmed.length <= 80;
}

function looksLikeFooterAddress(value: string): boolean {
  return /\||\b(address|ave|avenue|blvd|boulevard|drive|dr\.?|lane|ln\.?|road|rd\.?|street|st\.?|suite|ste\.?)\b/i.test(
    value,
  );
}

function isLinkOnly(html: string): boolean {
  return /^<a\b[^>]*>[\s\S]*<\/a>$/i.test(html.trim());
}

function isEmptyHtml(html: string): boolean {
  return /^(?:\s|&nbsp;|<br\s*\/?>)*$/i.test(html);
}

function getPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}
