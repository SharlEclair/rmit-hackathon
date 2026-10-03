/**
 * Stage S4 (normalise) and stage S5 (chunk and index) of the ingestion pipeline
 * (`04` sections 7 and 6.2).
 *
 * **S4 normalises; S5 chunks.** Neither rewrites meaning. The output of S4 is "the same words with
 * the extractor's artefacts removed", and the output of S5 is contiguous spans of that text. That
 * distinction is what keeps I3 (the brief is verbatim) true: a chunk is a span a reader can find in
 * the document, and `06` section 7.2.3 requires every `requirement_nodes.verbatim_text` to be a
 * substring of the chunk it cites.
 *
 * The reading that matters most here is about **what a newline means**. `pdfjs` returns text *items*,
 * one per positioned run of characters, and the extractor joins them with `\n` -- so a single
 * newline is usually where the PDF placed a word, not where the document ended a line. Therefore:
 *
 * - a single newline becomes a space;
 * - a blank line (two or more newlines) is a paragraph boundary and is preserved;
 * - a hyphen followed by a line break inside a word is de-hyphenated.
 *
 * That is the S4 rule set, and it is why `demo-brief.pdf`'s numbered requirement list survives
 * chunking as whole requirements rather than as fragments: the blank lines between items are real,
 * and a numbered item is never split unless it alone exceeds the hard cap.
 *
 * Chunking is deterministic and order-preserving: the same pages always produce the same chunk
 * boundaries, because prompt-cache stability depends on a grounding block that does not reshuffle
 * (`04` section 5.5 rule 1).
 */

/** `04` section 6.2 rule 2: target 700 tokens per chunk, 120 tokens of overlap. */
export const DEFAULT_TARGET_TOKENS = 700;
export const DEFAULT_OVERLAP_TOKENS = 120;

/**
 * A ceiling above which a single paragraph is split even though it is one block.
 *
 * The rule "never split inside a numbered requirement" is about not fragmenting a requirement; it
 * is not a licence to emit a 40,000-character chunk that will not fit a prompt. A block past this
 * size is split at sentence boundaries, which is the least destructive split available.
 */
export const HARD_CAP_TOKENS = 2800;

/**
 * Characters per token.
 *
 * An estimate, and labelled as one. `04` section 6.2 specifies the target in tokens but stores
 * `char_count`, because the store cannot count tokens without the model's tokenizer and a
 * tokenizer-specific chunk size would change when the provider changed (D39). The consequence is
 * stated rather than hidden: a chunk may be larger or smaller than 700 tokens, and the number that
 * is exact is the stored `char_count`.
 */
export const CHARS_PER_TOKEN = 4;

export interface NormalisedPage {
  /** 1-based, from the extractor's page anchors (`04` section 7, stage S3). */
  readonly page: number;
  /** The extractor's own text. */
  readonly text: string;
}

export interface ChunkCandidate {
  readonly chunkIndex: number;
  /** A contiguous span of the normalised text. */
  readonly text: string;
  /** `null` when the format has no pages at all (Markdown, DOCX/PPTX, an image upload). */
  readonly pageFrom: number | null;
  readonly pageTo: number | null;
  /** The document's own heading text that governs this chunk, where one was found. */
  readonly sectionLabel: string | null;
  readonly charCount: number;
}

interface Block {
  readonly text: string;
  readonly page: number;
  readonly isHeading: boolean;
}

/**
 * Zero-width characters, which are extraction noise rather than document content.
 *
 * Built with `new RegExp` instead of a literal because ESLint's `no-misleading-character-class`
 * rejects a literal class containing a zero-width joiner, and a rule that cannot tell "I am
 * stripping these" from "I am matching these in a misleading way" is not worth weakening with a
 * disable comment. NBSP needs no entry: JavaScript's `\s` already matches it.
 */
const ZERO_WIDTH_CHARACTERS = new RegExp('[\\u200b-\\u200d\\ufeff]', 'g');

/**
 * S4: normalise one page's extracted text.
 *
 * Order matters and is asserted by the tests: de-hyphenation runs before whitespace collapsing
 * (otherwise the hyphen and the newline are already separated), and Unicode normalisation runs last
 * so a compatibility character cannot reintroduce a line break.
 */
export function normalisePageText(text: string): string {
  let value = text.replace(/\r\n?/g, '\n');
  // A word split across a line: "govern-\nance" is one word. Only inside a word, so a real hyphen
  // followed by a list item is untouched.
  value = value.replace(/(\p{L})-\n(\p{Ll})/gu, '$1$2');
  // A blank line is a paragraph boundary and stays one; a single newline is an extractor artefact
  // and becomes a space. Done by splitting rather than with a sentinel character, so no control
  // character ever enters the pipeline.
  value = value
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\n/g, ' '))
    .join('\n\n');
  value = value.replace(/[^\S\n]+/g, ' ');
  value = value.replace(ZERO_WIDTH_CHARACTERS, ' ');
  return value.replace(/[^\S\n]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().normalize('NFC');
}

/**
 * S5: turn normalised pages into page-anchored chunks.
 *
 * `sectionLabel` is carried across pages, because a document's list can continue onto the next page
 * and the heading that governs the continuation is the document's own, found earlier.
 */
export function chunkPages(
  pages: readonly NormalisedPage[],
  options: {
    readonly targetTokens?: number;
    readonly overlapTokens?: number;
    /**
     * False for a format with no pages (Markdown, DOCX/PPTX, an image upload). The chunk text is
     * chunked exactly the same way; only `page_from`/`page_to` become null, because claiming "page 1"
     * for a PNG would be a citation to a page that does not exist (D43).
     */
    readonly pageAnchors?: boolean;
  } = {},
): ChunkCandidate[] {
  const pageAnchors = options.pageAnchors ?? true;
  const targetChars = Math.max(1, (options.targetTokens ?? DEFAULT_TARGET_TOKENS) * CHARS_PER_TOKEN);
  const overlapChars = Math.max(
    0,
    Math.min((options.overlapTokens ?? DEFAULT_OVERLAP_TOKENS) * CHARS_PER_TOKEN, Math.floor(targetChars / 2)),
  );

  const blocks = pages.flatMap((page) => blocksOfPage(page));
  const chunks: ChunkCandidate[] = [];

  let pending: Block[] = [];
  let label: string | null = null;
  let carry: Block | null = null;

  /**
   * Emit the pending blocks as one chunk. Takes its inputs explicitly rather than reading the
   * closure variables: the page range comes from the blocks being flushed, and a page anchor that is
   * wrong by one is a citation that points at the wrong page (D43).
   */
  const flush = (blocksToFlush: readonly Block[], carryBlock: Block | null): ChunkCandidate | null => {
    const pieces = [carryBlock === null ? '' : carryBlock.text, ...blocksToFlush.map((block) => block.text)];
    const text = pieces.filter((piece) => piece !== '').join('\n\n').trim();
    if (text === '') return null;
    const pageList = [carryBlock, ...blocksToFlush]
      .filter((block): block is Block => block !== null)
      .map((block) => block.page);
    const chunk: ChunkCandidate = {
      chunkIndex: chunks.length,
      text,
      pageFrom: pageAnchors ? Math.min(...pageList) : null,
      pageTo: pageAnchors ? Math.max(...pageList) : null,
      sectionLabel: label,
      charCount: text.length,
    };
    chunks.push(chunk);
    return chunk;
  };

  for (const block of blocks) {
    // A block far past the target is split even though it is one paragraph. Everything pending is
    // emitted first so the split pieces stay contiguous with each other.
    if (block.text.length > targetChars * 3) {
      const previous = flush(pending, carry);
      pending = [];
      carry = null;
      for (const piece of splitLongBlock(block.text, targetChars)) {
        flush([{ text: piece, page: block.page, isHeading: false }], null);
      }
      carry = overlapOf(previous, overlapChars);
      continue;
    }

    // A heading always opens a new chunk, so a section never shares a chunk with the section before
    // it -- otherwise the section label would govern text it does not govern. The overlap is also
    // dropped here: carrying a tail from the previous section in front of the new heading would make
    // the chunk start with text that belongs to the section the heading just closed.
    if (block.isHeading) {
      if (pending.length > 0) flush(pending, carry);
      pending = [];
      carry = null;
      label = block.text;
    }

    const pendingChars = pending.reduce((total, entry) => total + entry.text.length + 2, 0);
    if (pending.length > 0 && pendingChars + block.text.length > targetChars) {
      const previous = flush(pending, carry);
      pending = [];
      carry = overlapOf(previous, overlapChars);
    }
    pending.push(block);
  }
  flush(pending, carry);

  return chunks.map((chunk, index) => ({ ...chunk, chunkIndex: index }));
}

/** Split one page's normalised text into heading and paragraph blocks. */
function blocksOfPage(page: NormalisedPage): Block[] {
  return page.text
    .split('\n\n')
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .map((part) => ({
      text: part,
      page: page.page,
      isHeading: isHeading(part),
    }));
}

/**
 * Is this paragraph the document's own heading?
 *
 * The rule is `11` WP-02's and the Phase 1 seed's (`app/scripts/seed.ts`): a short line that opens a
 * numbered section or a rubric criterion. It is deliberately narrow. A generous heading detector
 * would label ordinary sentences as sections, and `source_chunks.section_label` is rendered as a
 * citation ("Brief p.4, section 3.2"), so a wrong label is a wrong citation.
 */
export function isHeading(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > 120 || trimmed.includes('\n')) return false;
  // Numbered sections ("3. Requirements", "3.2 Referencing"), the rubric's criterion lines, and the
  // Section/Part forms. The length cap above is what keeps an ordinary numbered sentence out: a
  // heading is short, a requirement is not.
  return /^(\d+(?:\.\d+)*\.?\s+\S|Criterion \d+\b|Section \d+\b|Part \d+\b)/.test(trimmed);
}

/**
 * Split an oversized block at sentence boundaries.
 *
 * Never mid-sentence, and never mid-word. A sentence longer than the target is emitted whole rather
 * than truncated, because a truncated sentence is not verbatim text (C2).
 */
function splitLongBlock(text: string, targetChars: number): string[] {
  const sentences = text.match(/[^.!?]+[.!?]*\s*/g) ?? [text];
  const pieces: string[] = [];
  let current = '';
  for (const sentence of sentences) {
    if (current !== '' && current.length + sentence.length > targetChars) {
      pieces.push(current.trim());
      current = '';
    }
    current += sentence;
    while (current.length > targetChars * 2) {
      pieces.push(current.slice(0, targetChars).trim());
      current = current.slice(targetChars);
    }
  }
  if (current.trim() !== '') pieces.push(current.trim());
  return pieces.filter((piece) => piece !== '');
}

/**
 * The overlap carried into the next chunk: a tail of the previous chunk, trimmed to a word boundary.
 *
 * Purely additive: it duplicates text that also exists in the previous chunk, which is what overlap
 * means. It never truncates the previous chunk, so no text is lost between two chunks.
 */
function overlapOf(previous: ChunkCandidate | null, overlapChars: number): Block | null {
  if (previous === null || overlapChars === 0) return null;
  const tail = previous.text.slice(-overlapChars);
  const boundary = tail.search(/\s/);
  const trimmed = (boundary >= 0 ? tail.slice(boundary + 1) : tail).trim();
  if (trimmed === '') return null;
  // The carry belongs to the page the previous chunk ended on; with no page anchors the value is
  // never read (it is nulled at output).
  return { text: trimmed, page: previous.pageTo ?? 1, isHeading: false };
}
