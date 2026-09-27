import { describe, expect, it } from "vitest";
import type { Payment, SaleItem, SaleWithItems } from "@/domain/types";
import {
  analyze, buildCatalogLookup, buildReport, daysInRange, pctChange, previousRange, summarize,
} from "./analytics";

function localIso(y: number, m: number, d: number, h = 12, min = 0) {
  return new Date(y, m - 1, d, h, min).toISOString();
}

let seq = 0;
function item(p: Partial<SaleItem> & Pick<SaleItem, "productName" | "variantId" | "quantity" | "lineTotal" | "unitCost">): SaleItem {
  seq++;
  return {
    id: `i${seq}`, saleId: "", variantLabel: "M / Rojo", sku: `SKU-${p.variantId}`,
    unitPrice: p.lineTotal / p.quantity, discount: 0, ...p,
  };
}

function sale(opts: {
  at: string;
  items: SaleItem[];
  tax: number;
  discount?: number;
  payments?: Payment[];
  status?: "completed" | "voided";
}): SaleWithItems {
  seq++;
  const total = opts.items.reduce((a, i) => a + i.lineTotal, 0);
  return {
    id: `s${seq}`, number: seq, registerId: "r1", cashierId: "u1", customerName: null,
    subtotal: total + (opts.discount ?? 0), discountTotal: opts.discount ?? 0, taxTotal: opts.tax, total,
    payments: opts.payments ?? [{ method: "cash", amount: total }], change: 0,
    status: opts.status ?? "completed", createdAt: opts.at, voidedAt: null, voidReason: null,
    items: opts.items.map((i) => ({ ...i })),
  };
}

const range = { from: localIso(2026, 9, 1, 0), to: localIso(2026, 9, 4, 0) }; // 1..3 sep

const sales: SaleWithItems[] = [
  // 1 sep 10:00 — blusa x2 ($23.00 c/u con IVA), costo $10
  sale({
    at: localIso(2026, 9, 1, 10),
    items: [item({ productName: "Blusa", variantId: "v1", quantity: 2, lineTotal: 4600, unitCost: 1000 })],
    tax: 600,
    discount: 200,
    payments: [{ method: "card", amount: 4600 }],
  }),
  // 3 sep 15:30 — blusa + jeans, pago mixto
  sale({
    at: localIso(2026, 9, 3, 15, 30),
    items: [
      item({ productName: "Blusa", variantId: "v2", quantity: 1, lineTotal: 2300, unitCost: 1000 }),
      item({ productName: "Jeans", variantId: "v3", quantity: 1, lineTotal: 6900, unitCost: 3000 }),
    ],
    tax: 1200,
    payments: [{ method: "card", amount: 5000 }, { method: "cash", amount: 4200 }],
  }),
  // anulada: no cuenta
  sale({
    at: localIso(2026, 9, 2, 11),
    items: [item({ productName: "Jeans", variantId: "v3", quantity: 5, lineTotal: 34500, unitCost: 3000 })],
    tax: 4500,
    status: "voided",
  }),
  // fuera de rango (periodo anterior: 29-31 ago)
  sale({
    at: localIso(2026, 8, 30, 12),
    items: [item({ productName: "Blusa", variantId: "v1", quantity: 1, lineTotal: 4600, unitCost: 1000 })],
    tax: 600,
  }),
];

describe("summarize", () => {
  it("solo cuenta ventas completadas y calcula margen sobre neto sin IVA", () => {
    const s = summarize(sales.slice(0, 3));
    expect(s.tickets).toBe(2);
    expect(s.gross).toBe(13800);
    expect(s.tax).toBe(1800);
    expect(s.net).toBe(12000);
    expect(s.cost).toBe(2000 + 1000 + 3000);
    expect(s.profit).toBe(6000);
    expect(s.marginBps).toBe(5000);
    expect(s.avgTicket).toBe(6900);
    expect(s.units).toBe(4);
    expect(s.discounts).toBe(200);
    expect(s.voidedCount).toBe(1);
    expect(s.voidedTotal).toBe(34500);
  });

  it("vacío no divide entre cero", () => {
    const s = summarize([]);
    expect(s.avgTicket).toBe(0);
    expect(s.marginBps).toBe(0);
  });
});

describe("rangos", () => {
  it("periodo anterior de igual duración", () => {
    const p = previousRange(range);
    expect(p.to).toBe(range.from);
    expect(new Date(p.from).getTime()).toBe(new Date(localIso(2026, 8, 29, 0)).getTime());
  });

  it("días del rango", () => {
    expect(daysInRange(range)).toEqual(["2026-09-01", "2026-09-02", "2026-09-03"]);
  });

  it("pctChange", () => {
    expect(pctChange(150, 100)).toBe(50);
    expect(pctChange(50, 100)).toBe(-50);
    expect(pctChange(10, 0)).toBeNull();
    expect(pctChange(0, 0)).toBe(0);
  });
});

describe("buildReport", () => {
  const lookup = buildCatalogLookup(
    [{ id: "v1", categoryId: "c1" }, { id: "v2", categoryId: "c1" }, { id: "v3", categoryId: "c2" }],
    [{ id: "c1", name: "Blusas" }, { id: "c2", name: "Pantalones" }],
  );
  const r = buildReport(sales, range, lookup);

  it("excluye ventas fuera de rango", () => {
    expect(r.summary.tickets).toBe(2);
  });

  it("rellena días vacíos con 0", () => {
    expect(r.byDay.map((d) => d.total)).toEqual([4600, 0, 9200]);
  });

  it("por hora y día de semana", () => {
    expect(r.byHour[10].total).toBe(4600);
    expect(r.byHour[15].total).toBe(9200);
    expect(r.byHour.reduce((a, h) => a + h.tickets, 0)).toBe(2);
    const w1 = new Date(range.from).getDay();
    expect(r.byWeekday[w1].total).toBe(4600);
    expect(r.heat[w1][10]).toBe(4600);
  });

  it("por método de pago", () => {
    expect(r.byMethod).toEqual({ cash: 4200, card: 9600, transfer: 0 });
  });

  it("top productos agrupa por nombre y por variante", () => {
    // Empate en venta ($69): desempata por unidades.
    expect(r.productsByRevenue.map((p) => p.name)).toEqual(["Blusa", "Jeans"]);
    expect(r.productsByUnits.map((p) => p.name)).toEqual(["Blusa", "Jeans"]);
    const blusa = r.productsByRevenue.find((p) => p.name === "Blusa")!;
    expect(blusa.units).toBe(3);
    expect(blusa.revenue).toBe(6900);
    expect(blusa.net).toBe(6000);
    expect(blusa.profit).toBe(3000);
    expect(blusa.marginBps).toBe(5000);
    expect(r.variants).toHaveLength(3);
    // El neto por producto suma exactamente el neto global.
    expect(r.productsByRevenue.reduce((a, p) => a + p.net, 0)).toBe(r.summary.net);
  });

  it("por categoría", () => {
    expect(r.categories.map((c) => [c.name, c.revenue, c.units])).toEqual([
      ["Blusas", 6900, 3],
      ["Pantalones", 6900, 1],
    ]);
    expect(r.categories.reduce((a, c) => a + c.shareBps, 0)).toBe(10000);
  });

  it("sin catálogo agrupa en 'Sin categoría'", () => {
    const r2 = buildReport(sales, range);
    expect(r2.categories).toHaveLength(1);
    expect(r2.categories[0].name).toBe("Sin categoría");
  });
});

describe("analyze", () => {
  it("compara contra el periodo anterior", () => {
    const { comparison, previous } = analyze(sales, range);
    expect(previous.summary.gross).toBe(4600);
    expect(comparison.gross.current).toBe(13800);
    expect(comparison.gross.pct).toBe(200);
    expect(comparison.tickets.pct).toBe(100);
    expect(comparison.star?.name).toBe("Blusa");
    expect(comparison.star?.delta.previous).toBe(4600);
    expect(comparison.star?.delta.pct).toBe(50);
  });
});
