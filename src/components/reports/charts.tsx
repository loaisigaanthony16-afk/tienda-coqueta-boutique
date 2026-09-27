"use client";
import * as React from "react";
import { formatBps, formatMoney } from "@/domain/money";
import { PAYMENT_LABEL } from "@/domain/payment";
import type { Cents, PaymentMethod } from "@/domain/types";
import { WEEKDAY_LONG, WEEKDAY_SHORT, ratioBps } from "@/lib/analytics";
import { cn } from "@/lib/utils";

/* Colores categóricos (validados para daltonismo) para métodos de pago.
   Se declaran como variables en el contenedor, con su paso para modo oscuro. */
export const PAY_VARS =
  "[--pay-cash:#2a78d6] [--pay-card:#eb6834] [--pay-transfer:#1baf7a] dark:[--pay-cash:#3987e5] dark:[--pay-card:#d95926] dark:[--pay-transfer:#199e70]";
export const PAY_COLOR: Record<PaymentMethod, string> = {
  cash: "var(--pay-cash)",
  card: "var(--pay-card)",
  transfer: "var(--pay-transfer)",
};
const METHODS: PaymentMethod[] = ["cash", "card", "transfer"];

export function useElementWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = React.useRef<T>(null);
  const [w, setW] = React.useState(0);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver((entries) => setW(Math.floor(entries[0].contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** $1.2k / $850 para ejes. */
export function compactMoney(cents: Cents): string {
  const v = cents / 100;
  if (Math.abs(v) >= 1000) return `$${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k`;
  return `$${Math.round(v)}`;
}

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * p;
}

/** Barra con esquinas superiores redondeadas anclada a la base. */
function barPath(x: number, y: number, w: number, h: number, r = 4): string {
  if (h <= 0) return "";
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

function Tooltip({ x, width, children }: { x: number; width: number; children: React.ReactNode }) {
  const left = Math.min(Math.max(x, 70), Math.max(70, width - 70));
  return (
    <div
      role="status"
      className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-md border bg-popover px-2.5 py-1.5 text-xs whitespace-nowrap text-popover-foreground shadow-md"
      style={{ left }}
    >
      {children}
    </div>
  );
}

export interface BarPoint {
  key: string;
  /** Etiqueta corta del eje X. */
  tick: string;
  value: Cents;
  title: string;
  detail?: string;
}

/** Barras verticales de una sola serie con tooltip por barra. */
export function BarChart({
  points,
  height = 200,
  highlightMax = true,
  ariaLabel,
}: {
  points: BarPoint[];
  height?: number;
  highlightMax?: boolean;
  ariaLabel: string;
}) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = React.useState<number | null>(null);
  const padL = 40;
  const padB = 22;
  const padT = 10;
  const plotW = Math.max(0, width - padL);
  const plotH = height - padB - padT;
  const n = points.length;
  const rawMax = points.reduce((a, p) => Math.max(a, p.value), 0);
  const max = niceMax(rawMax);
  const slot = n ? plotW / n : 0;
  const barW = Math.max(2, Math.min(32, slot - 2, slot * 0.72));
  const tickEvery = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(plotW / 44))));
  const grid = [0, 0.5, 1];
  const maxIdx = highlightMax && rawMax > 0 ? points.findIndex((p) => p.value === rawMax) : -1;

  return (
    <div ref={ref} className="relative w-full" style={{ height }} onMouseLeave={() => setHover(null)}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={ariaLabel} className="block overflow-visible">
          {grid.map((g) => {
            const y = padT + plotH - g * plotH;
            return (
              <g key={g}>
                <line x1={padL} x2={width} y1={y} y2={y} className="stroke-border" strokeDasharray={g === 0 ? undefined : "2 3"} />
                <text x={padL - 6} y={y} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[10px] tabular-nums">
                  {compactMoney(max * g)}
                </text>
              </g>
            );
          })}
          {points.map((p, i) => {
            const h = (p.value / max) * plotH;
            const x = padL + i * slot + (slot - barW) / 2;
            const active = hover === i;
            return (
              <g key={p.key}>
                <path
                  d={barPath(x, padT + plotH - h, barW, h)}
                  className={cn(
                    "fill-brand transition-opacity",
                    hover !== null && !active ? "opacity-40" : i === maxIdx || active ? "opacity-100" : "opacity-75",
                  )}
                />
                {i % tickEvery === 0 && (
                  <text
                    x={padL + i * slot + slot / 2}
                    y={height - 6}
                    textAnchor="middle"
                    className={cn("text-[10px]", active ? "fill-foreground" : "fill-muted-foreground")}
                  >
                    {p.tick}
                  </text>
                )}
                {/* Área de impacto más grande que la barra */}
                <rect
                  x={padL + i * slot}
                  y={padT}
                  width={slot}
                  height={plotH}
                  fill="transparent"
                  onMouseEnter={() => setHover(i)}
                  onClick={() => setHover(i)}
                />
              </g>
            );
          })}
        </svg>
      )}
      {hover !== null && points[hover] && (
        <Tooltip x={padL + hover * slot + slot / 2} width={width}>
          <div className="font-medium">{points[hover].title}</div>
          <div className="tabular-nums">{formatMoney(points[hover].value)}</div>
          {points[hover].detail && <div className="text-muted-foreground">{points[hover].detail}</div>}
        </Tooltip>
      )}
    </div>
  );
}

/** Mapa de calor día de semana × hora (secuencial, un solo tono). */
export function WeekHourHeatmap({ heat }: { heat: Cents[][] }) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = React.useState<{ w: number; h: number } | null>(null);

  const { hMin, hMax, max } = React.useMemo(() => {
    let lo = 24, hi = -1, mx = 0;
    heat.forEach((row) =>
      row.forEach((v, h) => {
        if (v > 0) {
          lo = Math.min(lo, h);
          hi = Math.max(hi, h);
          mx = Math.max(mx, v);
        }
      }),
    );
    if (hi < 0) return { hMin: 9, hMax: 19, max: 0 };
    return { hMin: Math.min(lo, 9), hMax: Math.max(hi, 19), max: mx };
  }, [heat]);

  const order = [1, 2, 3, 4, 5, 6, 0];
  const hours = Array.from({ length: hMax - hMin + 1 }, (_, i) => hMin + i);
  const padL = 32;
  const padB = 18;
  const gap = 2;
  const cellW = width > padL ? (width - padL) / hours.length : 0;
  const cellH = Math.max(14, Math.min(26, cellW * 0.8));
  const height = order.length * cellH + padB;

  return (
    <div ref={ref} className="relative w-full" style={{ height }} onMouseLeave={() => setHover(null)}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label="Ventas por día de la semana y hora" className="block">
          {order.map((w, r) => (
            <g key={w}>
              <text x={0} y={r * cellH + cellH / 2} dy="0.32em" className="fill-muted-foreground text-[10px]">
                {WEEKDAY_SHORT[w]}
              </text>
              {hours.map((h, c) => {
                const v = heat[w][h];
                const t = max ? v / max : 0;
                const active = hover?.w === w && hover?.h === h;
                return (
                  <rect
                    key={h}
                    x={padL + c * cellW + gap / 2}
                    y={r * cellH + gap / 2}
                    width={Math.max(1, cellW - gap)}
                    height={cellH - gap}
                    rx={3}
                    className={cn(v > 0 ? "fill-brand" : "fill-muted", active && "stroke-foreground")}
                    fillOpacity={v > 0 ? 0.15 + 0.85 * t : 1}
                    strokeWidth={active ? 1.5 : 0}
                    onMouseEnter={() => setHover({ w, h })}
                    onClick={() => setHover({ w, h })}
                  />
                );
              })}
            </g>
          ))}
          {hours.map((h, c) =>
            c % Math.max(1, Math.ceil(28 / Math.max(cellW, 1))) === 0 ? (
              <text
                key={h}
                x={padL + c * cellW + cellW / 2}
                y={height - 4}
                textAnchor="middle"
                className="fill-muted-foreground text-[10px] tabular-nums"
              >
                {h}h
              </text>
            ) : null,
          )}
        </svg>
      )}
      {hover && (
        <Tooltip x={padL + (hover.h - hMin) * cellW + cellW / 2} width={width}>
          <div className="font-medium">
            {WEEKDAY_LONG[hover.w]} · {hover.h}:00–{hover.h + 1}:00
          </div>
          <div className="tabular-nums">{formatMoney(heat[hover.w][hover.h])}</div>
        </Tooltip>
      )}
      <div className="sr-only">Intensidad = total vendido en esa franja.</div>
    </div>
  );
}

/** Barra apilada horizontal por método de pago + leyenda con montos. */
export function PaymentSplit({ byMethod }: { byMethod: Record<PaymentMethod, Cents> }) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = React.useState<PaymentMethod | null>(null);
  const total = METHODS.reduce((a, m) => a + byMethod[m], 0);
  const present = METHODS.filter((m) => byMethod[m] > 0);
  const gap = 2;
  const h = 14;
  const usable = Math.max(0, width - gap * Math.max(0, present.length - 1));
  let x = 0;

  return (
    <div className={cn("flex flex-col gap-3", PAY_VARS)}>
      <div ref={ref} className="w-full" style={{ height: h }}>
        {width > 0 && (
          <svg width={width} height={h} role="img" aria-label="Distribución por método de pago" className="block">
            {total === 0 ? (
              <rect x={0} y={0} width={width} height={h} rx={4} className="fill-muted" />
            ) : (
              present.map((m) => {
                const w = (byMethod[m] / total) * usable;
                const rect = (
                  <rect
                    key={m}
                    x={x}
                    y={0}
                    width={Math.max(1, w)}
                    height={h}
                    rx={4}
                    fill={PAY_COLOR[m]}
                    opacity={hover && hover !== m ? 0.4 : 1}
                    onMouseEnter={() => setHover(m)}
                    onMouseLeave={() => setHover(null)}
                  >
                    <title>{`${PAYMENT_LABEL[m]}: ${formatMoney(byMethod[m])}`}</title>
                  </rect>
                );
                x += w + gap;
                return rect;
              })
            )}
          </svg>
        )}
      </div>
      <ul className="grid gap-1.5 text-sm">
        {METHODS.map((m) => (
          <li
            key={m}
            className={cn("flex items-center gap-2 rounded px-1 transition-colors", hover === m && "bg-muted")}
            onMouseEnter={() => setHover(m)}
            onMouseLeave={() => setHover(null)}
          >
            <span className="size-2.5 shrink-0 rounded-sm" style={{ background: PAY_COLOR[m] }} aria-hidden />
            <span className="flex-1">{PAYMENT_LABEL[m]}</span>
            <span className="text-muted-foreground tabular-nums">{formatBps(ratioBps(byMethod[m], total))}</span>
            <span className="w-24 text-right font-medium tabular-nums">{formatMoney(byMethod[m])}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Barras horizontales etiquetadas (categorías u otras listas cortas). */
export function HBarList({
  rows,
  empty = "Sin datos en el periodo.",
}: {
  rows: Array<{ key: string; label: string; value: Cents; right?: string; sub?: string }>;
  empty?: string;
}) {
  const max = rows.reduce((a, r) => Math.max(a, r.value), 0);
  if (!rows.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="grid gap-3">
      {rows.map((r) => (
        <li key={r.key} className="grid gap-1">
          <div className="flex items-baseline gap-2 text-sm">
            <span className="min-w-0 flex-1 truncate">{r.label}</span>
            {r.sub && <span className="text-xs text-muted-foreground tabular-nums">{r.sub}</span>}
            <span className="font-medium tabular-nums">{r.right ?? formatMoney(r.value)}</span>
          </div>
          <svg width="100%" height="8" className="block" aria-hidden>
            <rect x="0" y="0" width="100%" height="8" rx="4" className="fill-muted" />
            <rect x="0" y="0" width={`${max ? (r.value / max) * 100 : 0}%`} height="8" rx="4" className="fill-brand" />
          </svg>
        </li>
      ))}
    </ul>
  );
}
