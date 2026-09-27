/**
 * Respaldo universal: dibuja el mismo documento en un .print-area oculto con
 * fuente monoespaciada, ajusta @page al ancho del rollo y llama window.print().
 */
import type { PrintDoc } from "./layout";

/** Ancho imprimible aproximado (mm) de cada rollo. */
const PRINTABLE_MM: Record<PrintDoc["paperWidth"], number> = { 58: 48, 80: 72 };
/** Relación ancho/alto de un carácter monoespaciado típico. */
const CHAR_ASPECT = 0.6;
const LINE_HEIGHT = 1.25;
const MARGIN_MM = 4;

const ROOT_ID = "coqueta-print-root";
const STYLE_ID = "coqueta-print-style";

export interface BrowserPrintMetrics {
  fontSizeMm: number;
  contentWidthMm: number;
  pageHeightMm: number;
}

/** Cálculo puro de tamaños (probado por separado). */
export function browserPrintMetrics(doc: PrintDoc): BrowserPrintMetrics {
  const contentWidthMm = PRINTABLE_MM[doc.paperWidth];
  const fontSizeMm = contentWidthMm / doc.columns / CHAR_ASPECT;
  const lineMm = fontSizeMm * LINE_HEIGHT;
  let rows = 0;
  for (const l of doc.lines) {
    if (l.type === "feed") rows += l.lines;
    else if (l.type === "text") rows += l.size === 2 ? 2 : 1;
  }
  return { fontSizeMm, contentWidthMm, pageHeightMm: Math.ceil(rows * lineMm + MARGIN_MM * 3) };
}

function renderDoc(doc: PrintDoc, m: BrowserPrintMetrics): HTMLElement {
  const page = document.createElement("div");
  page.className = "coqueta-print-page";
  page.style.width = `${m.contentWidthMm}mm`;
  page.style.fontSize = `${m.fontSizeMm}mm`;
  for (const line of doc.lines) {
    if (line.type === "feed") {
      for (let i = 0; i < line.lines; i++) {
        const el = document.createElement("div");
        el.textContent = " ";
        page.appendChild(el);
      }
      continue;
    }
    if (line.type !== "text") continue; // QR / código de barras: solo en ESC/POS
    const el = document.createElement("div");
    el.textContent = line.text || " ";
    el.style.textAlign = line.align ?? "left";
    if (line.bold) el.style.fontWeight = "700";
    if (line.size === 2) el.style.fontSize = "2em";
    page.appendChild(el);
  }
  return page;
}

let cleanupPrevious: (() => void) | null = null;

/** Imprime los documentos (una página por copia) con el diálogo del navegador. */
export async function printDocsInBrowser(docs: PrintDoc[]): Promise<void> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("La impresión del navegador solo está disponible en el cliente.");
  }
  if (docs.length === 0) return;
  cleanupPrevious?.();

  const metrics = docs.map(browserPrintMetrics);
  const width = docs[0].paperWidth;
  const height = Math.max(...metrics.map((m) => m.pageHeightMm));

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
@page { size: ${width}mm ${height}mm; margin: 0; }
#${ROOT_ID} { position: fixed; left: -10000px; top: 0; }
#${ROOT_ID} .coqueta-print-page {
  box-sizing: content-box; padding: ${MARGIN_MM}mm ${(width - PRINTABLE_MM[width]) / 2}mm;
  font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, "Liberation Mono", "Courier New", monospace;
  line-height: ${LINE_HEIGHT}; color: #000; background: #fff; white-space: pre; overflow: hidden;
  font-variant-ligatures: none; letter-spacing: 0;
}
#${ROOT_ID} .coqueta-print-page + .coqueta-print-page { break-before: page; page-break-before: always; }
@media print {
  html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
  body > *:not(#${ROOT_ID}) { display: none !important; }
  #${ROOT_ID} { position: static; left: auto; }
}`;

  const root = document.createElement("div");
  root.id = ROOT_ID;
  root.className = "print-area";
  root.setAttribute("aria-hidden", "true");
  docs.forEach((d, i) => root.appendChild(renderDoc(d, metrics[i])));

  document.head.appendChild(style);
  document.body.appendChild(root);

  let done = false;
  const cleanup = () => {
    if (done) return;
    done = true;
    window.removeEventListener("afterprint", cleanup);
    clearTimeout(timer);
    style.remove();
    root.remove();
    if (cleanupPrevious === cleanup) cleanupPrevious = null;
  };
  cleanupPrevious = cleanup;
  window.addEventListener("afterprint", cleanup);
  // Por si el navegador no emite afterprint.
  const timer = setTimeout(cleanup, 60_000);

  // Deja que el navegador aplique estilos antes de abrir el diálogo.
  await new Promise<void>((r) => requestAnimationFrame(() => r()));
  try {
    window.print();
  } catch (e) {
    cleanup();
    throw e;
  }
}
