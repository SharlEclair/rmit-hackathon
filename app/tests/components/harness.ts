import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';

/**
 * Rendered-markup helpers. `react-dom/server` is available through `react-dom` (already a
 * dependency), so the primitive tests need no testing library: they assert over the markup that
 * `renderToStaticMarkup` produces, which is exactly what the design gates inspect.
 */
export function render(element: ReactElement): string {
  return renderToStaticMarkup(element);
}

/**
 * The `class` attribute of the element carrying `data-content-class="<value>"`.
 * `ContentClassPanel` writes that attribute before `className`, so the first `class="` after it
 * is the frame's own attribute.
 */
export function contentClassFrame(html: string, contentClass: string): string {
  const marker = `data-content-class="${contentClass}"`;
  const markerIndex = html.indexOf(marker);
  if (markerIndex === -1) {
    throw new Error(`no element carries ${marker}`);
  }

  // Search from the END of the marker: `data-content-class="` itself contains `class="`.
  const classIndex = html.indexOf('class="', markerIndex + marker.length);
  if (classIndex === -1) {
    throw new Error(`the element carrying ${marker} has no class attribute`);
  }

  const start = classIndex + 'class="'.length;
  const end = html.indexOf('"', start);
  if (end === -1) {
    throw new Error('unterminated class attribute');
  }

  return html.slice(start, end);
}

export function hasClass(frame: string, className: string): boolean {
  return frame.split(' ').includes(className);
}

/** The first `class` attribute in a fragment, for a single-element render. */
export function firstClassAttribute(html: string): string {
  const index = html.indexOf('class="');
  if (index === -1) {
    throw new Error('the fragment has no class attribute');
  }
  const start = index + 'class="'.length;
  const end = html.indexOf('"', start);
  if (end === -1) {
    throw new Error('unterminated class attribute');
  }
  return html.slice(start, end);
}

/**
 * React escapes `"`, `'`, `&`, `<` and `>` in text nodes, so copy assertions run against the
 * decoded string. `&amp;` is decoded last so a literal `&amp;quot;` in source text survives.
 */
export function decodeEntities(html: string): string {
  return html
    .replaceAll('&quot;', '"')
    .replaceAll('&#x27;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
}

export type BorderStyle = 'solid' | 'dashed' | 'dotted' | 'none';

export function borderStyleOf(frame: string): BorderStyle {
  if (hasClass(frame, 'border-dashed')) return 'dashed';
  if (hasClass(frame, 'border-dotted')) return 'dotted';
  if (hasClass(frame, 'border-solid')) return 'solid';
  return 'none';
}
