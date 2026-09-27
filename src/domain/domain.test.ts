import { describe, expect, it } from "vitest";
import { allocate, formatPlain, marginBps, roundHalfAwayFromZero, taxIncluded, toCents } from "./money";
import { priceCart } from "./pricing";
import { quickCashOptions, settle } from "./payment";
import { classifyDifference, summarizeRegister } from "./cash";
import { ean13CheckDigit, internalEan13, isValidEan13, skuBaseFromName, sortSizes, variantSku } from "./codes";
import type { Sale } from "./types";

describe("money", () => {
  it("parsea montos en varios formatos", () => {
    expect(toCents("12.50")).toBe(1250);
    expect(toCents("12,5")).toBe(1250);
    expect(toCents("1,234.56")).toBe(123456);
    expect(toCents("$ 7")).toBe(700);
    expect(toCents("0.105")).toBe(11);
    expect(toCents(19.99)).toBe(1999);
    expect(toCents("abc")).toBeNaN();
    expect(toCents("")).toBeNaN();
  });

  it("redondea mitad lejos de cero como PostgreSQL", () => {
    expect(roundHalfAwayFromZero(2.5)).toBe(3);
    expect(roundHalfAwayFromZero(-2.5)).toBe(-3);
    expect(roundHalfAwayFromZero(2.4999)).toBe(2);
  });

  it("extrae el IVA incluido al 15%", () => {
    expect(taxIncluded(1150, 1500)).toBe(150);
    expect(taxIncluded(1000, 1500)).toBe(130);
  });

  it("reparte sin perder centavos", () => {
    const parts = allocate(100, [1, 1, 1]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(100);
    expect(parts).toEqual([34, 33, 33]);
    expect(allocate(0, [5, 5])).toEqual([0, 0]);
  });

  it("formatea y calcula margen", () => {
    expect(formatPlain(123456)).toBe("1,234.56");
    expect(formatPlain(-5)).toBe("-0.05");
    expect(marginBps(2000, 1200)).toBe(4000);
  });
});

describe("pricing", () => {
  const lines = [
    { key: "a", quantity: 2, unitPrice: 1999, unitCost: 900 },
    { key: "b", quantity: 1, unitPrice: 3500, unitCost: 1500 },
  ];

  it("suma subtotal, IVA incluido y costo", () => {
    const r = priceCart(lines);
    expect(r.subtotal).toBe(7498);
    expect(r.total).toBe(7498);
    expect(r.discountTotal).toBe(0);
    expect(r.costTotal).toBe(3300);
    expect(r.itemCount).toBe(3);
    expect(r.taxTotal).toBe(r.lines.reduce((a, l) => a + l.tax, 0));
  });

  it("prorratea el descuento global exacto", () => {
    const r = priceCart(lines, { kind: "amount", cents: 1000 });
    expect(r.discountTotal).toBe(1000);
    expect(r.total).toBe(6498);
    expect(r.lines.reduce((a, l) => a + l.cartDiscountShare, 0)).toBe(1000);
  });

  it("combina descuento por línea y porcentaje global, sin pasar de cero", () => {
    const r = priceCart(
      [{ ...lines[0], discount: { kind: "percent", bps: 5000 } }, lines[1]],
      { kind: "percent", bps: 1000 },
    );
    expect(r.lines[0].lineDiscount).toBe(1999);
    expect(r.total).toBe(Math.round((1999 + 3500) * 0.9));
    const capped = priceCart(lines, { kind: "amount", cents: 999999 });
    expect(capped.total).toBe(0);
  });

  it("modo precio sin IVA suma el impuesto", () => {
    const r = priceCart([{ key: "x", quantity: 1, unitPrice: 1000, unitCost: 0 }], null, {
      pricesIncludeTax: false,
      taxRateBps: 1500,
    });
    expect(r.total).toBe(1150);
  });
});

describe("payment", () => {
  it("calcula vuelto en efectivo", () => {
    const r = settle(1750, [{ method: "cash", amount: 2000 }]);
    expect(r.ok && r.change).toBe(250);
  });

  it("pago mixto: tarjeta primero, efectivo cubre el resto", () => {
    const r = settle(5000, [
      { method: "card", amount: 3000 },
      { method: "cash", amount: 2500 },
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.change).toBe(500);
      expect(r.payments).toEqual([
        { method: "card", amount: 3000, reference: undefined },
        { method: "cash", amount: 2000, tendered: 2500 },
      ]);
    }
  });

  it("rechaza tarjeta mayor al total e insuficiencia", () => {
    expect(settle(1000, [{ method: "card", amount: 1500 }]).ok).toBe(false);
    const r = settle(1000, [{ method: "cash", amount: 600 }]);
    expect(!r.ok && r.missing).toBe(400);
  });

  it("sugiere billetes", () => {
    expect(quickCashOptions(1750, [100, 500, 1000, 2000, 5000])).toEqual([1750, 1800, 2000, 5000]);
  });
});

describe("cash register", () => {
  const sale = (over: Partial<Sale>): Sale => ({
    id: "s", number: 1, registerId: "r", cashierId: "u", customerName: null,
    subtotal: 0, discountTotal: 0, taxTotal: 0, total: 0, payments: [], change: 0,
    status: "completed", createdAt: "", voidedAt: null, voidReason: null, ...over,
  });

  it("arqueo excluye anuladas y aplica movimientos", () => {
    const s = summarizeRegister(
      5000,
      [
        sale({ total: 2000, payments: [{ method: "cash", amount: 2000, tendered: 2000 }] }),
        sale({ total: 3000, payments: [{ method: "card", amount: 1000 }, { method: "cash", amount: 2000 }] }),
        sale({ total: 900, status: "voided", payments: [{ method: "cash", amount: 900 }] }),
      ],
      [
        { id: "1", registerId: "r", type: "out", amount: 700, reason: "", createdBy: "", createdAt: "" },
        { id: "2", registerId: "r", type: "in", amount: 200, reason: "", createdBy: "", createdAt: "" },
      ],
    );
    expect(s.expectedCash).toBe(5000 + 4000 + 200 - 700);
    expect(s.byMethod.card).toBe(1000);
    expect(s.salesCount).toBe(2);
    expect(s.voidedCount).toBe(1);
  });

  it("clasifica diferencias", () => {
    expect(classifyDifference(0)).toBe("ok");
    expect(classifyDifference(-50)).toBe("minor");
    expect(classifyDifference(-1500)).toBe("major");
  });
});

describe("codes", () => {
  it("genera EAN-13 válidos", () => {
    expect(ean13CheckDigit("400638133393")).toBe(1);
    const code = internalEan13(42);
    expect(code).toBe("200000000042" + ean13CheckDigit("200000000042"));
    expect(isValidEan13(code)).toBe(true);
    expect(isValidEan13("2000000000421")).toBe(isValidEan13(code) && code === "2000000000421");
  });

  it("genera SKU y ordena tallas", () => {
    expect(skuBaseFromName("Blusa de lino")).toBe("BLU-LIN");
    expect(variantSku("BLU-LIN", "M", "Negro")).toBe("BLU-LIN-M-NEG");
    expect(sortSizes(["L", "XS", "M", "S"])).toEqual(["XS", "S", "M", "L"]);
    expect(sortSizes(["38", "36", "40"])).toEqual(["36", "38", "40"]);
  });
});
