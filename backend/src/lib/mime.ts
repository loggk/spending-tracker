/**
 * Just enough MIME to read a transaction alert.
 *
 * Alert emails are at the simple end of the format: a `multipart/alternative`
 * carrying a plain-text part and an HTML part, base64 or quoted-printable, in
 * UTF-8 or Latin-1. A full parser would bring a large dependency tree into a
 * Lambda bundle to handle attachments, nested signatures and exotic charsets
 * that no bank alert uses, so this handles the subset and nothing more.
 *
 * Anything unrecognised degrades to returning the raw body rather than
 * throwing: the issuer templates downstream are tolerant of noise, and an empty
 * body is a clearer failure than an exception from a decoder.
 */

export interface ParsedEmail {
  /** Bare address from the `From` header, lowercased. Empty when absent. */
  from: string;
  subject: string;
  /** The body as plain text, converted from HTML when that is all there was. */
  text: string;
  /** Header values by lowercased name, first occurrence only. */
  headers: Record<string, string>;
}

interface MimePart {
  headers: Record<string, string>;
  body: string;
}

const DEFAULT_CHARSET = 'utf-8';

export function parseEmail(raw: string): ParsedEmail {
  const message = splitPart(raw.replace(/\r\n/g, '\n'));
  const headers = message.headers;

  return {
    from: extractAddress(headers['from'] ?? ''),
    subject: decodeEncodedWords(headers['subject'] ?? '').trim(),
    text: bodyText(message),
    headers,
  };
}

/** Splits one part into its headers and its still-encoded body. */
function splitPart(part: string): MimePart {
  const separator = part.indexOf('\n\n');
  const headerBlock = separator === -1 ? part : part.slice(0, separator);
  const body = separator === -1 ? '' : part.slice(separator + 2);

  return { headers: parseHeaders(headerBlock), body };
}

/**
 * Folded headers continue on lines starting with whitespace, so lines are
 * joined before being split on the first colon.
 */
function parseHeaders(block: string): Record<string, string> {
  const headers: Record<string, string> = {};

  for (const line of block.replace(/\n[ \t]+/g, ' ').split('\n')) {
    const colon = line.indexOf(':');
    if (colon <= 0) {
      continue;
    }

    const name = line.slice(0, colon).trim().toLowerCase();
    // First occurrence wins; a second Subject or From is either a quirk or an
    // attempt to confuse whoever reads only one of them.
    if (!(name in headers)) {
      headers[name] = line.slice(colon + 1).trim();
    }
  }

  return headers;
}

/**
 * Walks the part tree for something readable, preferring a text/plain part over
 * converting HTML. Depth is bounded because a malformed boundary can otherwise
 * make the walk reenter the same bytes.
 */
function bodyText(part: MimePart, depth = 0): string {
  // Lowercased for comparing the type, but the boundary is read off the
  // original: MIME types are case-insensitive and boundaries are not.
  const rawContentType = part.headers['content-type'] ?? 'text/plain';
  const contentType = rawContentType.toLowerCase();

  if (depth < 8 && contentType.startsWith('multipart/')) {
    const boundary = parameter(rawContentType, 'boundary');
    if (boundary === undefined) {
      return '';
    }

    const candidates = splitMultipart(part.body, boundary)
      .map(splitPart)
      .map((candidate) => ({
        type: (candidate.headers['content-type'] ?? 'text/plain').toLowerCase(),
        text: bodyText(candidate, depth + 1),
      }))
      .filter((candidate) => candidate.text.trim() !== '');

    // A plain-text sibling is preferred over converting the HTML one, but any
    // readable part beats returning nothing.
    const plain = candidates.find(
      ({ type }) => type.startsWith('text/plain') || type.startsWith('multipart/'),
    );

    return (plain ?? candidates[0])?.text ?? '';
  }

  const decoded = decodeBody(part);

  return contentType.startsWith('text/html') ? htmlToText(decoded) : decoded;
}

/**
 * Parts are delimited by `--boundary` and terminated by `--boundary--`. The
 * preamble before the first delimiter is not a part and is discarded.
 */
function splitMultipart(body: string, boundary: string): string[] {
  const delimiter = `--${boundary}`;
  const segments = body.split(delimiter);

  return (
    segments
      .slice(1)
      // A segment starting `--` is the closing delimiter, not a part.
      .filter((segment) => !segment.startsWith('--'))
      // Drop the rest of the delimiter line, then the newline that precedes the
      // next one: per RFC 2046 that break belongs to the delimiter rather than
      // to the part's content.
      .map((segment) => segment.replace(/^[^\n]*\n/, '').replace(/\n$/, ''))
  );
}

function decodeBody({ headers, body }: MimePart): string {
  const encoding = (headers['content-transfer-encoding'] ?? '7bit').trim().toLowerCase();
  const charset = parameter(headers['content-type'] ?? '', 'charset');

  if (encoding === 'base64') {
    return toText(Buffer.from(body.replace(/\s+/g, ''), 'base64'), charset);
  }

  if (encoding === 'quoted-printable') {
    return decodeQuotedPrintable(body, charset);
  }

  return body;
}

/**
 * Decodes to bytes first rather than per escape, because a multi-byte UTF-8
 * character is encoded as several `=XX` escapes that are only meaningful
 * together.
 */
function decodeQuotedPrintable(body: string, charset: string | undefined): string {
  // A trailing `=` is a soft line break: the line continues, with no newline.
  const joined = body.replace(/=\n/g, '');
  const bytes: number[] = [];

  for (let index = 0; index < joined.length; index += 1) {
    const character = joined[index] as string;

    if (character === '=' && index + 2 < joined.length) {
      const hex = joined.slice(index + 1, index + 3);
      if (/^[0-9a-fA-F]{2}$/.test(hex)) {
        bytes.push(Number.parseInt(hex, 16));
        index += 2;
        continue;
      }
    }

    // Everything a mail system will have left alone is single-byte here.
    bytes.push(character.charCodeAt(0) & 0xff);
  }

  return toText(Buffer.from(bytes), charset);
}

function toText(bytes: Buffer, charset: string | undefined): string {
  const normalised = (charset ?? DEFAULT_CHARSET).toLowerCase();

  if (normalised === 'iso-8859-1' || normalised === 'latin1' || normalised === 'windows-1252') {
    return bytes.toString('latin1');
  }

  return bytes.toString('utf8');
}

/** Reads a `; name=value` parameter off a header value, quoted or bare. */
export function parameter(headerValue: string, name: string): string | undefined {
  const match = new RegExp(`;\\s*${name}\\s*=\\s*(?:"([^"]*)"|([^;\\s]+))`, 'i').exec(headerValue);

  return match?.[1] ?? match?.[2];
}

/** `"Amex" <alerts@americanexpress.com>` -> `alerts@americanexpress.com`. */
export function extractAddress(headerValue: string): string {
  const angled = /<([^>]+)>/.exec(headerValue);
  const address = angled?.[1] ?? headerValue;

  return address.trim().toLowerCase();
}

/**
 * RFC 2047 encoded words, which appear in subjects once a bank puts a currency
 * symbol or an accent in them.
 */
export function decodeEncodedWords(value: string): string {
  return value.replace(
    /=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g,
    (_match, charset: string, encoding: string, text: string) => {
      if (encoding.toLowerCase() === 'b') {
        return toText(Buffer.from(text, 'base64'), charset);
      }

      // In encoded words `_` stands for a space, unlike in a body.
      return decodeQuotedPrintable(text.replace(/_/g, ' '), charset);
    },
  );
}

const BLOCK_TAGS = /<\/?(?:br|p|div|tr|li|h[1-6]|table|td)\b[^>]*>/gi;

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/**
 * Collapses an HTML part to the text a person would see. Block-level tags
 * become newlines so that a label and its value do not run together into
 * something the issuer templates cannot match.
 */
export function htmlToText(html: string): string {
  return (
    decodeEntities(
      html
        .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(BLOCK_TAGS, '\n')
        .replace(/<[^>]*>/g, ''),
    )
      .replace(/[ \t ]+/g, ' ')
      .replace(/ *\n */g, '\n')
      // `</td><td>` yields a newline from each tag. Runs collapse to one, because
      // this text is read by the issuer templates rather than displayed, and they
      // only need a label kept apart from its value.
      .replace(/\n{2,}/g, '\n')
      .trim()
  );
}

function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity.startsWith('#')) {
      const codePoint = entity.startsWith('#x')
        ? Number.parseInt(entity.slice(2), 16)
        : Number.parseInt(entity.slice(1), 10);

      return Number.isFinite(codePoint) && codePoint > 0 && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : match;
    }

    return ENTITIES[entity.toLowerCase()] ?? match;
  });
}
