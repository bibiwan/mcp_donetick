/**
 * Description-field conversion helpers.
 *
 * DoneTick stores chore descriptions as HTML: its web editor is a rich-text
 * field, and the server rewrites `<img dt-data-path=...>` tags on read to
 * re-sign attachment URLs. Descriptions written by this connector used to be
 * plain text, so an instance ends up with a mix of `<p>Wipe the shelves</p>`
 * and `Wipe the shelves` — inconsistent to read, and plain text loses its line
 * breaks when the web UI renders it as HTML.
 *
 * These helpers normalize both directions: text on the way out, HTML on the
 * way in.
 */

/** Matches an actual tag, so prose like `a < b` or `<3` is not mistaken for markup. */
const TAG = /<\/?[a-z][a-z0-9]*(?:\s[^>]*)?\/?>/i;

const ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
};

/** True when the value carries real markup rather than incidental angle brackets. */
export function looksLikeHtml(value: string): boolean {
  return TAG.test(value);
}

function decodeEntities(value: string): string {
  let out = value.replace(/&(?:nbsp|amp|lt|gt|quot|apos|#39);/gi, (m) => ENTITIES[m.toLowerCase()] ?? m);
  // Numeric entities, decimal and hex.
  out = out.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
  out = out.replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
  return out;
}

/**
 * Converts a stored description to readable plain text.
 *
 * Block boundaries become newlines and list items gain a leading dash, so the
 * structure a human wrote in the web UI survives into the text a model reads.
 * Non-HTML input is returned unchanged apart from entity decoding.
 */
export function htmlToText(value: string): string {
  if (!value) {
    return '';
  }
  if (!looksLikeHtml(value)) {
    return decodeEntities(value).trim();
  }

  let out = value;

  // Drop anything whose text content is not prose.
  out = out.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '');

  // Images carry no text; name them so their presence is not silently lost.
  out = out.replace(/<img[^>]*\balt="([^"]*)"[^>]*>/gi, (_, alt) => (alt ? `[image: ${alt}]` : '[image]'));
  out = out.replace(/<img[^>]*>/gi, '[image]');

  out = out.replace(/<br\s*\/?>/gi, '\n');

  // A list item opens its own line; its closing tag must not add a second one,
  // or every bullet ends up separated by a blank line.
  out = out.replace(/<li[^>]*>/gi, '\n- ');
  out = out.replace(/<\/li>/gi, '');

  // Block-level elements are separated by a blank line, matching how they
  // render, so paragraphs survive the round-trip back to HTML.
  out = out.replace(/<\/(p|div|h[1-6]|tr|blockquote|ul|ol|table)>/gi, '\n\n');

  // Everything else is formatting with no textual meaning.
  out = out.replace(/<[^>]+>/g, '');

  out = decodeEntities(out);

  // Collapse the runs of blank lines the substitutions above tend to leave.
  out = out.replace(/[ \t]+\n/g, '\n');
  out = out.replace(/\n{3,}/g, '\n\n');

  return out.trim();
}

/**
 * Converts plain text to the minimal HTML DoneTick's editor expects.
 *
 * Blank-line-separated blocks become paragraphs and single newlines become
 * `<br>`, which is what makes a multi-line description render as written in
 * the web UI. Input that is already HTML is passed through untouched, so a
 * caller echoing back what it read does not get double-escaped.
 */
export function textToHtml(value: string): string {
  if (!value) {
    return '';
  }
  if (looksLikeHtml(value)) {
    return value;
  }

  const escape = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  return value
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0)
    .map((block) => `<p>${escape(block).replace(/\n/g, '<br>')}</p>`)
    .join('');
}
