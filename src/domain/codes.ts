/** Generación de SKU y códigos de barras EAN-13. */

const SIZE_ORDER = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL", "UNICA"];

export function sortSizes(sizes: string[]): string[] {
  return [...sizes].sort((a, b) => {
    const ia = SIZE_ORDER.indexOf(a.toUpperCase());
    const ib = SIZE_ORDER.indexOf(b.toUpperCase());
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    const na = Number(a), nb = Number(b);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
    return a.localeCompare(b, "es");
  });
}

function slug(input: string, len: number): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.slice(0, len))
    .join("")
    .slice(0, len * 2);
}

/** "Blusa de lino" → "BLU-LIN". */
export function skuBaseFromName(name: string): string {
  const words = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 2 || /\d/.test(w));
  const parts = (words.length ? words : [name.toUpperCase()]).slice(0, 2).map((w) => w.slice(0, 3));
  return parts.join("-") || "PRD";
}

/** "BLU-LIN" + M + Negro → "BLU-LIN-M-NEG". */
export function variantSku(base: string, size: string | null, color: string | null): string {
  return [base, size ? slug(size, 4) : null, color ? slug(color, 3) : null]
    .filter(Boolean)
    .join("-");
}

export function ean13CheckDigit(first12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10;
}

export function isValidEan13(code: string): boolean {
  return /^\d{13}$/.test(code) && ean13CheckDigit(code.slice(0, 12)) === Number(code[12]);
}

/**
 * EAN-13 interno. El prefijo 20–29 está reservado por GS1 para uso interno
 * de tiendas, así nunca choca con códigos de fábrica.
 */
export function internalEan13(sequence: number, prefix = "20"): string {
  const body = prefix + String(sequence).padStart(10, "0").slice(-10);
  return body + ean13CheckDigit(body);
}
