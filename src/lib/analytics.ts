/**
 * Agregaciones puras para Reportes. Sin React ni acceso a datos: reciben
 * ventas (con sus ítems) y devuelven números en centavos enteros.
 *
 * DEFINICIONES (solo cuentan ventas con status "completed"):
 *  - Ventas brutas (gross): suma de `sale.total`, lo que pagó el cliente,
 *    ya con descuentos aplicados e IVA incluido.
 *  - IVA (tax): suma de `sale.taxTotal`.
 *  - Ventas netas (net): gross − IVA. Ingreso real de la tienda.
 *  - Costo (cost): Σ quantity × unitCost de los ítems (costo congelado al vender).
 *  - Utilidad bruta (profit): net − cost.
 *  - Margen (marginBps): profit / net en puntos básicos (1500 = 15%).
 *    Es decir, margen sobre la venta SIN IVA; 0 si net ≤ 0.
 *  - Tickets: número de ventas; ticket promedio = gross / tickets (redondeado).
 *  - Unidades: Σ quantity. Descuentos: Σ `sale.discountTotal`.
 *  - Por producto/variante/categoría: "revenue" = Σ lineTotal (con IVA,
 *    comparable con gross); el neto de cada línea descuenta su parte del IVA
 *    de la venta, prorrateado por lineTotal sin perder centavos.
 *  - Periodo anterior: el mismo largo inmediatamente antes de `range.from`.
 */
import { allocate, roundHalfAwayFromZero } from "@/domain/money";
import type { Category, Cents, PaymentMethod, SaleWithItems } from "@/domain/types";

export interface DateRange {
  from: string;
  to: string;
}

export interface Summary {
  gross: Cents;
  tax: Cents;
  net: Cents;
  cost: Cents;
  profit: Cents;
  marginBps: number;
  tickets: number;
  avgTicket: Cents;
  units: number;
  discounts: Cents;
  voidedCount: number;
  voidedTotal: Cents;
}

export interface DayPoint {
  /** Fecha local YYYY-MM-DD. */
  date: string;
  total: Cents;
  tickets: number;
}

export interface BucketPoint {
  index: number;
  total: Cents;
  tickets: number;
}

export interface ProductStat {
  key: string;
  name: string;
  /** Solo en agrupación por variante. */
  variantLabel?: string;
  sku?: string;
  units: number;
  revenue: Cents;
  net: Cents;
  cost: Cents;
  profit: Cents;
  marginBps: number;
}

export interface CategoryStat {
  id: string | null;
  name: string;
  units: number;
  revenue: Cents;
  profit: Cents;
  /** Participación en la venta del periodo, en bps. */
  shareBps: number;
}

export interface Report {
  range: DateRange;
  summary: Summary;
  byMethod: Record<PaymentMethod, Cents>;
  byDay: DayPoint[];
  /** 24 posiciones, index = hora local 0..23. */
  byHour: BucketPoint[];
  /** 7 posiciones, index = getDay() (0 = domingo). */
  byWeekday: BucketPoint[];
  /** heat[weekday][hour] = total vendido. */
  heat: Cents[][];
  productsByRevenue: ProductStat[];
  productsByUnits: ProductStat[];
  variants: ProductStat[];
  categories: CategoryStat[];
}

export interface CatalogLookup {
  /** variantId → categoryId del producto. */
  variantCategory: Map<string, string | null>;
  categories: Pick<Category, "id" | "name">[];
}

export interface Delta {
  current: number;
  previous: number;
  /** Variación porcentual (12.5 = +12.5%). null si el periodo anterior es 0. */
  pct: number | null;
}

// ─── Rangos ────────────────────────────────────────────────────────────────

/** Periodo inmediatamente anterior con la misma duración. */
export function previousRange(range: DateRange): DateRange {
  const from = new Date(range.from).getTime();
  const to = new Date(range.to).getTime();
  return { from: new Date(from - (to - from)).toISOString(), to: range.from };
}

export function inRange(iso: string, range: DateRange): boolean {
  const t = new Date(iso).getTime();
  return t >= new Date(range.from).getTime() && t < new Date(range.to).getTime();
}

/** YYYY-MM-DD en hora local. */
export function localDateKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Días locales cubiertos por el rango [from, to). */
export function daysInRange(range: DateRange): string[] {
  const out: string[] = [];
  const cur = new Date(range.from);
  cur.setHours(0, 0, 0, 0);
  const end = new Date(range.to).getTime();
  // Límite de seguridad: 3 años.
  for (let i = 0; cur.getTime() < end && i < 1100; i++) {
    out.push(localDateKey(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

// ─── Métricas ──────────────────────────────────────────────────────────────

export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function delta(current: number, previous: number): Delta {
  return { current, previous, pct: pctChange(current, previous) };
}

export function ratioBps(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return roundHalfAwayFromZero((part * 10000) / whole);
}

export function summarize(sales: SaleWithItems[]): Summary {
  let gross = 0, tax = 0, cost = 0, units = 0, discounts = 0, tickets = 0;
  let voidedCount = 0, voidedTotal = 0;
  for (const s of sales) {
    if (s.status !== "completed") {
      voidedCount++;
      voidedTotal += s.total;
      continue;
    }
    tickets++;
    gross += s.total;
    tax += s.taxTotal;
    discounts += s.discountTotal;
    for (const it of s.items) {
      cost += it.quantity * it.unitCost;
      units += it.quantity;
    }
  }
  const net = gross - tax;
  const profit = net - cost;
  return {
    gross, tax, net, cost, profit,
    marginBps: ratioBps(profit, net),
    tickets,
    avgTicket: tickets ? roundHalfAwayFromZero(gross / tickets) : 0,
    units, discounts, voidedCount, voidedTotal,
  };
}

function finishProduct(p: Omit<ProductStat, "profit" | "marginBps">): ProductStat {
  const profit = p.net - p.cost;
  return { ...p, profit, marginBps: ratioBps(profit, p.net) };
}

/** Construye el reporte completo del rango. Ignora ventas fuera de rango. */
export function buildReport(allSales: SaleWithItems[], range: DateRange, catalog?: CatalogLookup): Report {
  const sales = allSales.filter((s) => inRange(s.createdAt, range));
  const completed = sales.filter((s) => s.status === "completed");

  const byMethod: Record<PaymentMethod, Cents> = { cash: 0, card: 0, transfer: 0 };
  const days = daysInRange(range);
  const dayIdx = new Map(days.map((d, i) => [d, i]));
  const byDay: DayPoint[] = days.map((date) => ({ date, total: 0, tickets: 0 }));
  const byHour: BucketPoint[] = Array.from({ length: 24 }, (_, index) => ({ index, total: 0, tickets: 0 }));
  const byWeekday: BucketPoint[] = Array.from({ length: 7 }, (_, index) => ({ index, total: 0, tickets: 0 }));
  const heat: Cents[][] = Array.from({ length: 7 }, () => new Array<Cents>(24).fill(0));

  type Acc = Omit<ProductStat, "profit" | "marginBps">;
  const prod = new Map<string, Acc>();
  const vars = new Map<string, Acc>();
  const cats = new Map<string | null, { units: number; revenue: Cents; net: Cents; cost: Cents }>();

  for (const s of completed) {
    for (const p of s.payments) byMethod[p.method] += p.amount;
    const d = new Date(s.createdAt);
    const di = dayIdx.get(localDateKey(d));
    if (di !== undefined) {
      byDay[di].total += s.total;
      byDay[di].tickets++;
    }
    const h = d.getHours();
    const w = d.getDay();
    byHour[h].total += s.total;
    byHour[h].tickets++;
    byWeekday[w].total += s.total;
    byWeekday[w].tickets++;
    heat[w][h] += s.total;

    // IVA de la venta prorrateado a sus líneas.
    const taxShares = s.items.length
      ? allocate(s.taxTotal, s.items.map((i) => Math.max(0, i.lineTotal)))
      : [];
    s.items.forEach((it, k) => {
      const net = it.lineTotal - (taxShares[k] ?? 0);
      const cost = it.quantity * it.unitCost;

      const pk = it.productName;
      const pa = prod.get(pk) ?? { key: pk, name: it.productName, units: 0, revenue: 0, net: 0, cost: 0 };
      pa.units += it.quantity;
      pa.revenue += it.lineTotal;
      pa.net += net;
      pa.cost += cost;
      prod.set(pk, pa);

      const va = vars.get(it.variantId) ?? {
        key: it.variantId, name: it.productName, variantLabel: it.variantLabel, sku: it.sku,
        units: 0, revenue: 0, net: 0, cost: 0,
      };
      va.units += it.quantity;
      va.revenue += it.lineTotal;
      va.net += net;
      va.cost += cost;
      vars.set(it.variantId, va);

      const cid = catalog?.variantCategory.get(it.variantId) ?? null;
      const ca = cats.get(cid) ?? { units: 0, revenue: 0, net: 0, cost: 0 };
      ca.units += it.quantity;
      ca.revenue += it.lineTotal;
      ca.net += net;
      ca.cost += cost;
      cats.set(cid, ca);
    });
  }

  const products = [...prod.values()].map(finishProduct);
  const byRevenue = (a: ProductStat, b: ProductStat) =>
    b.revenue - a.revenue || b.units - a.units || a.name.localeCompare(b.name);
  const byUnits = (a: ProductStat, b: ProductStat) =>
    b.units - a.units || b.revenue - a.revenue || a.name.localeCompare(b.name);

  const catName = new Map(catalog?.categories.map((c) => [c.id, c.name]) ?? []);
  const catTotal = [...cats.values()].reduce((a, c) => a + c.revenue, 0);
  const categories: CategoryStat[] = [...cats.entries()]
    .map(([id, c]) => ({
      id,
      name: (id && catName.get(id)) || "Sin categoría",
      units: c.units,
      revenue: c.revenue,
      profit: c.net - c.cost,
      shareBps: ratioBps(c.revenue, catTotal),
    }))
    .sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name));

  return {
    range,
    summary: summarize(sales),
    byMethod,
    byDay,
    byHour,
    byWeekday,
    heat,
    productsByRevenue: [...products].sort(byRevenue),
    productsByUnits: [...products].sort(byUnits),
    variants: [...vars.values()].map(finishProduct).sort(byRevenue),
    categories,
  };
}

export interface Comparison {
  gross: Delta;
  net: Delta;
  profit: Delta;
  marginBps: Delta;
  tickets: Delta;
  avgTicket: Delta;
  units: Delta;
  /** Producto estrella del periodo actual y su venta en el periodo anterior. */
  star: (ProductStat & { delta: Delta }) | null;
}

export function compareReports(current: Report, previous: Report): Comparison {
  const c = current.summary;
  const p = previous.summary;
  const top = current.productsByRevenue[0];
  const prevTop = top ? previous.productsByRevenue.find((x) => x.key === top.key) : undefined;
  return {
    gross: delta(c.gross, p.gross),
    net: delta(c.net, p.net),
    profit: delta(c.profit, p.profit),
    marginBps: delta(c.marginBps, p.marginBps),
    tickets: delta(c.tickets, p.tickets),
    avgTicket: delta(c.avgTicket, p.avgTicket),
    units: delta(c.units, p.units),
    star: top ? { ...top, delta: delta(top.revenue, prevTop?.revenue ?? 0) } : null,
  };
}

/**
 * Reporte del periodo + comparación con el anterior a partir de una sola
 * lista de ventas que cubra ambos periodos.
 */
export function analyze(sales: SaleWithItems[], range: DateRange, catalog?: CatalogLookup) {
  const prevRange = previousRange(range);
  const current = buildReport(sales, range, catalog);
  const previous = buildReport(sales, prevRange, catalog);
  return { current, previous, comparison: compareReports(current, previous) };
}

export function buildCatalogLookup(
  variants: Array<{ id: string; categoryId: string | null }>,
  categories: Pick<Category, "id" | "name">[],
): CatalogLookup {
  return { variantCategory: new Map(variants.map((v) => [v.id, v.categoryId])), categories };
}

export const WEEKDAY_SHORT = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"] as const;
export const WEEKDAY_LONG = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"] as const;
