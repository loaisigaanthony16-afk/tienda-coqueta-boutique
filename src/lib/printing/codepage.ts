/**
 * Conversión de texto a una página de códigos de un byte para impresoras
 * térmicas ESC/POS. PC850 y PC858 comparten todos los caracteres del español
 * (ñ, á, ¿, ¡…); PC858 solo cambia 0xD5 por el símbolo €.
 */

export type Charset = "pc850" | "pc858" | "ascii";

/** Número para `ESC t n` (tabla Epson). */
export const ESC_T_NUMBER: Record<Charset, number> = {
  ascii: 0, // PC437; solo usamos 0x20–0x7E
  pc850: 2,
  pc858: 19,
};

/** Caracteres 0x80–0xFF de CP850, en orden. */
const CP850_HIGH =
  "ÇüéâäàåçêëèïîìÄÅ" +
  "ÉæÆôöòûùÿÖÜø£Ø×ƒ" +
  "áíóúñÑªº¿®¬½¼¡«»" +
  "░▒▓│┤ÁÂÀ©╣║╗╝¢¥┐" +
  "└┴┬├─┼ãÃ╚╔╩╦╠═╬¤" +
  "ðÐÊËÈıÍÎÏ┘┌█▄¦Ì▀" +
  "ÓßÔÒõÕµþÞÚÛÙýÝ¯´" +
  "­±‗¾¶§÷¸°¨·¹³²■ ";

const CP850_MAP = new Map<string, number>();
for (let i = 0; i < CP850_HIGH.length; i++) CP850_MAP.set(CP850_HIGH[i], 0x80 + i);

const CP858_MAP = new Map(CP850_MAP);
CP858_MAP.delete("ı");
CP858_MAP.set("€", 0xd5);

/** Sustituciones tipográficas comunes que ninguna página cubre. */
const REPLACEMENTS: Record<string, string> = {
  "‘": "'",
  "’": "'",
  "‚": ",",
  "“": '"',
  "”": '"',
  "„": '"',
  "–": "-",
  "—": "-",
  "−": "-",
  "…": "...",
  "•": "*",
  " ": " ",
  " ": " ",
  " ": " ",
  "\t": " ",
  "€": "EUR",
  "™": "TM",
  "ß": "ss",
  "æ": "ae",
  "Æ": "AE",
  "ø": "o",
  "Ø": "O",
  "ð": "d",
  "Ð": "D",
  "þ": "th",
  "Þ": "Th",
  "ł": "l",
  "Ł": "L",
  "œ": "oe",
  "Œ": "OE",
};

/** Quita acentos y reemplaza lo que no sea ASCII imprimible. */
export function toAscii(text: string): string {
  let out = "";
  for (const ch of text.normalize("NFC")) {
    const code = ch.codePointAt(0)!;
    if (code >= 0x20 && code < 0x7f) {
      out += ch;
      continue;
    }
    if (REPLACEMENTS[ch] !== undefined) {
      out += REPLACEMENTS[ch];
      continue;
    }
    if (ch === "¿" || ch === "¡") continue;
    const stripped = ch.normalize("NFD").replace(/[̀-ͯ]/g, "");
    if (/^[\x20-\x7e]+$/.test(stripped)) out += stripped;
    else if (code < 0x20) continue;
    else out += "?";
  }
  return out;
}

/**
 * Normaliza el texto al conjunto de caracteres que la impresora puede
 * mostrar. El resultado sigue siendo una cadena JS (útil para medir anchos).
 */
export function sanitizeForCharset(text: string, charset: Charset): string {
  if (charset === "ascii") return toAscii(text);
  const map = charset === "pc858" ? CP858_MAP : CP850_MAP;
  let out = "";
  for (const ch of text.normalize("NFC")) {
    const code = ch.codePointAt(0)!;
    if (code >= 0x20 && code < 0x7f) out += ch;
    else if (map.has(ch) && ch !== " " && ch !== "­") out += ch;
    else if (code < 0x20) continue;
    else out += toAscii(ch) || "";
  }
  return out;
}

/** Codifica a bytes de la página elegida. Caracteres no mapeables → "?". */
export function encodeText(text: string, charset: Charset): Uint8Array {
  const clean = sanitizeForCharset(text, charset);
  const map = charset === "pc858" ? CP858_MAP : charset === "pc850" ? CP850_MAP : null;
  const bytes: number[] = [];
  for (const ch of clean) {
    const code = ch.codePointAt(0)!;
    if (code >= 0x20 && code < 0x7f) bytes.push(code);
    else bytes.push(map?.get(ch) ?? 0x3f);
  }
  return Uint8Array.from(bytes);
}
