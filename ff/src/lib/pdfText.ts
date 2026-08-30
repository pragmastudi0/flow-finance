/**
 * PDF → text, in the browser.
 *
 * The only part of the import pipeline that knows a PDF engine exists. It
 * hands `parseStatementText` a plain string, which is what lets the parser
 * and everything downstream be unit-tested without one.
 *
 * Lines are rebuilt from the text items' own coordinates rather than trusted
 * from the extractor: a statement is a table, and reading it row by row is
 * the difference between "27/08/26 Impuesto de sellos $ 16.275,31" and three
 * disconnected fragments.
 */
import type { TextItem } from 'pdfjs-dist/types/src/display/api';

/**
 * pdf.js is ~400 kB and only this screen needs it, so it is loaded on the
 * first import rather than shipped in the app's entry chunk. Vite resolves
 * the worker to a hashed asset URL at build time and keeps it out of the
 * bundle entirely.
 */
let enginePromise: Promise<typeof import('pdfjs-dist')> | null = null;

function engine() {
  enginePromise ??= (async () => {
    const [pdfjs, worker] = await Promise.all([
      import('pdfjs-dist'),
      import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
    ]);
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    return pdfjs;
  })();
  return enginePromise;
}

export class PdfTextError extends Error {
  constructor(
    readonly code: 'encrypted' | 'corrupt' | 'no_text' | 'unknown',
    message: string,
  ) {
    super(message);
    this.name = 'PdfTextError';
  }
}

/** Items on the same visual row, within this many points of each other. */
const ROW_TOLERANCE = 3;

/**
 * Text of every page, with the rows of the original document preserved.
 *
 * A scanned statement has no text layer at all — that surfaces as `no_text`
 * so the screen can say "this looks like a scan" instead of "0 movements
 * found", which is the same outcome with none of the information.
 */
export async function extractPdfText(file: File | ArrayBuffer): Promise<string> {
  const data = file instanceof File ? await file.arrayBuffer() : file;
  const pdfjs = await engine();

  let doc;
  try {
    doc = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (/password/i.test(message)) throw new PdfTextError('encrypted', message);
    throw new PdfTextError('corrupt', message);
  }

  try {
    const pages: string[] = [];

    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();

      // Bucket by baseline, then order each row left to right.
      const rows: Array<{ y: number; items: Array<{ x: number; text: string }> }> = [];
      for (const raw of content.items) {
        const item = raw as TextItem;
        if (typeof item.str !== 'string' || !item.str.trim()) continue;
        const x = item.transform[4];
        const y = item.transform[5];
        const row = rows.find((r) => Math.abs(r.y - y) <= ROW_TOLERANCE);
        if (row) row.items.push({ x, text: item.str });
        else rows.push({ y, items: [{ x, text: item.str }] });
      }

      rows.sort((a, b) => b.y - a.y);
      pages.push(
        rows
          .map((row) =>
            row.items
              .sort((a, b) => a.x - b.x)
              .map((i) => i.text)
              .join(' ')
              .replace(/\s+/g, ' ')
              .trim(),
          )
          .filter(Boolean)
          .join('\n'),
      );

      page.cleanup();
    }

    const text = pages.join('\n');
    if (!text.replace(/\s/g, '')) {
      throw new PdfTextError('no_text', 'the PDF has no text layer');
    }
    return text;
  } finally {
    await doc.destroy();
  }
}

/**
 * SHA-256 of the file, used to recognise a statement that was already
 * imported. Content-addressed rather than name-based: the same download
 * saved twice under different names must not import twice.
 */
export async function fileHash(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
