import * as React from "react";
import { isValidEan13 } from "@/domain/codes";

/**
 * Codificador EAN-13 → SVG, sin dependencias.
 * Estructura: 101 | 6 dígitos (L/G según el primero) | 01010 | 6 dígitos (R) | 101
 * = 95 módulos, más zonas de silencio de 11 (izq.) y 7 (der.).
 */

const L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const G = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
const R = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];
const PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

const QUIET_LEFT = 11;
const QUIET_RIGHT = 7;
const WIDTH = QUIET_LEFT + 95 + QUIET_RIGHT;

/** Devuelve los 95 módulos y cuáles son barras de guarda (más largas). */
export function encodeEan13(code: string): { bits: string; guard: boolean[] } {
  const d = code.split("").map(Number);
  const parity = PARITY[d[0]];
  let bits = "101";
  const guard: boolean[] = [true, true, true];
  const push = (s: string, g: boolean) => {
    bits += s;
    for (let i = 0; i < s.length; i++) guard.push(g);
  };
  for (let i = 1; i <= 6; i++) push((parity[i - 1] === "L" ? L : G)[d[i]], false);
  push("01010", true);
  for (let i = 7; i <= 12; i++) push(R[d[i]], false);
  push("101", true);
  return { bits, guard };
}

export function Ean13Svg({
  value,
  height = 40,
  showText = true,
  className,
}: {
  value: string;
  /** Alto de las barras en unidades de módulo (el ancho total es 113). */
  height?: number;
  showText?: boolean;
  className?: string;
}) {
  const valid = isValidEan13(value);
  const rects = React.useMemo(() => {
    if (!valid) return [];
    const { bits, guard } = encodeEan13(value);
    // Agrupa módulos contiguos en un solo <rect> para un SVG liviano.
    const out: Array<{ x: number; w: number; g: boolean }> = [];
    for (let i = 0; i < bits.length; i++) {
      if (bits[i] !== "1") continue;
      const last = out[out.length - 1];
      if (last && last.x + last.w === QUIET_LEFT + i && last.g === guard[i]) last.w += 1;
      else out.push({ x: QUIET_LEFT + i, w: 1, g: guard[i] });
    }
    return out;
  }, [value, valid]);

  if (!valid) {
    return (
      <div className={className}>
        <div className="font-mono text-[10px] tracking-widest">{value}</div>
      </div>
    );
  }

  const textH = showText ? 9 : 0;
  const guardExtra = showText ? 5 : 0;
  const total = height + textH;
  const digitY = height + textH - 1;

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${total}`}
      className={className}
      role="img"
      aria-label={`Código de barras ${value}`}
      shapeRendering="crispEdges"
      preserveAspectRatio="xMidYMid meet"
    >
      <rect x={0} y={0} width={WIDTH} height={total} fill="#fff" />
      {rects.map((r) => (
        <rect key={r.x} x={r.x} y={0} width={r.w} height={r.g ? height + guardExtra : height} fill="#000" />
      ))}
      {showText && (
        <g fontFamily="ui-monospace, Menlo, Consolas, monospace" fontSize={8.5} fill="#000" textAnchor="middle">
          <text x={QUIET_LEFT - 5} y={digitY}>{value[0]}</text>
          {value.slice(1, 7).split("").map((c, i) => (
            <text key={`l${i}`} x={QUIET_LEFT + 3 + 7 * i + 3.5} y={digitY}>{c}</text>
          ))}
          {value.slice(7).split("").map((c, i) => (
            <text key={`r${i}`} x={QUIET_LEFT + 50 + 7 * i + 3.5} y={digitY}>{c}</text>
          ))}
        </g>
      )}
    </svg>
  );
}
