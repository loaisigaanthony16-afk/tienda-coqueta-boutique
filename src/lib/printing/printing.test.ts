import { describe, expect, it } from "vitest";
import type { RegisterSummary } from "@/domain/cash";
import type { CashRegister, SaleWithItems } from "@/domain/types";
import { encodeText, sanitizeForCharset, toAscii } from "./codepage";
import { chunkBytes, encodeDoc, encodeDocs, EscPos } from "./escpos";
import {
  columnsFor,
  docToPlainText,
  layoutReceipt,
  layoutRegisterReport,
  layoutTestPage,
  twoCols,
  wrap,
  type PrintDoc,
} from "./layout";
import { normalizeSettings, DEFAULT_PRINTER_SETTINGS } from "./settings";
import { browserPrintMetrics } from "./browser-print";

const sale: SaleWithItems = {
  id: "s1",
  number: 1042,
  registerId: "r1",
  cashierId: "u1",
  customerName: "María Núñez",
  subtotal: 7500,
  discountTotal: 500,
  taxTotal: 913,
  total: 7000,
  payments: [
    { method: "card", amount: 2000, reference: "AUT-9981" },
    { method: "cash", amount: 5000, tendered: 10000 },
  ],
  change: 5000,
  status: "completed",
  createdAt: "2026-09-27T14:05:00",
  voidedAt: null,
  voidReason: null,
  items: [
    {
      id: "i1",
      saleId: "s1",
      variantId: "v1",
      productName: "Blusa de lino con bordado artesanal y botones de nácar",
      variantLabel: "M / Rosa",
      sku: "BLU-LIN-M-ROS",
      quantity: 2,
      unitPrice: 2500,
      unitCost: 1000,
      discount: 500,
      lineTotal: 4500,
    },
    {
      id: "i2",
      saleId: "s1",
      variantId: "v2",
      productName: "Falda",
      variantLabel: "",
      sku: "FAL",
      quantity: 1,
      unitPrice: 2500,
      unitCost: 1000,
      discount: 0,
      lineTotal: 2500,
    },
  ],
};

function textLines(doc: PrintDoc) {
  return doc.lines.flatMap((l) => (l.type === "text" ? [l] : []));
}

describe("codepage", () => {
  it("quita acentos en ASCII", () => {
    expect(toAscii("¿Cómo estás? Ñandú – “ok” …")).toBe('Como estas? Nandu - "ok" ...');
  });
  it("mantiene ñ y acentos en PC850 con bytes correctos", () => {
    expect(Array.from(encodeText("ñÑáéíóú¿¡", "pc850"))).toEqual([
      0xa4, 0xa5, 0xa0, 0x82, 0xa1, 0xa2, 0xa3, 0xa8, 0xad,
    ]);
    expect(Array.from(encodeText("ÁÉÍÓÚ", "pc850"))).toEqual([0xb5, 0x90, 0xd6, 0xe0, 0xe9]);
  });
  it("€ solo existe en PC858", () => {
    expect(Array.from(encodeText("€", "pc858"))).toEqual([0xd5]);
    expect(sanitizeForCharset("5€", "pc850")).toBe("5EUR");
  });
  it("descarta controles y reemplaza lo desconocido", () => {
    expect(sanitizeForCharset("a\nb\u{1F600}", "pc850")).toBe("ab?");
  });
});

describe("layout helpers", () => {
  it("ajusta por palabras y corta palabras largas", () => {
    expect(wrap("hola mundo cruel", 10)).toEqual(["hola mundo", "cruel"]);
    expect(wrap("abcdefghijkl", 5)).toEqual(["abcde", "fghij", "kl"]);
    for (const l of wrap("Blusa de lino con bordado artesanal", 12)) expect(l.length).toBeLessThanOrEqual(12);
  });
  it("dos columnas alinea a la derecha y respeta el ancho", () => {
    expect(twoCols("Total", "10.00", 20)).toEqual(["Total          10.00"]);
    const lines = twoCols("Un texto de etiqueta muy largo", "1,234.00", 20);
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(20);
    expect(lines.at(-1)!.endsWith("1,234.00")).toBe(true);
  });
});

describe("ticket de venta", () => {
  for (const width of [58, 80] as const) {
    it(`no excede ${columnsFor(width)} columnas en ${width} mm`, () => {
      const doc = layoutReceipt(sale, { paperWidth: width, charset: "pc850", cashierName: "Ana" });
      for (const l of textLines(doc)) {
        expect(l.text.length).toBeLessThanOrEqual(Math.floor(doc.columns / (l.size ?? 1)));
      }
    });
  }

  it("incluye los datos clave", () => {
    const text = docToPlainText(
      layoutReceipt(sale, { paperWidth: 80, charset: "pc850", cashierName: "Ana", copyLabel: "Reimpresión" }),
    );
    expect(text).toContain("#001042");
    expect(text).toContain("*** REIMPRESIÓN ***");
    expect(text).toContain("María Núñez");
    expect(text).toContain("2 x 25.00");
    expect(text).toContain("-5.00");
    expect(text).toContain("IVA incluido 15%");
    expect(text).toContain("Ref: AUT-9981");
    expect(text).toMatch(/Efectivo recibido\s+100\.00/);
    expect(text).toMatch(/Vuelto\s+50\.00/);
    expect(text).toContain("27/09/2026 14:05");
    expect(text).toContain("Cajero");
  });

  it("marca las ventas anuladas", () => {
    const doc = layoutReceipt(
      { ...sale, status: "voided", voidedAt: "2026-09-27T15:00:00", voidReason: "Error" },
      { paperWidth: 58, charset: "ascii" },
    );
    const text = docToPlainText(doc);
    expect(text).toContain("* * *   A N U L A D A   * * *");
    expect(text).toContain("Motivo: Error");
  });

  it("translitera en ASCII", () => {
    const text = docToPlainText(layoutReceipt(sale, { paperWidth: 58, charset: "ascii" }));
    expect(text).toContain("Maria Nunez");
    expect(text).not.toMatch(/[^\x00-\x7f]/);
  });

  it("agrega QR opcional", () => {
    const doc = layoutReceipt(sale, { paperWidth: 80, charset: "pc850", saleCode: "qr" });
    expect(doc.lines.some((l) => l.type === "qr" && l.data === "VENTA-001042")).toBe(true);
  });
});

describe("corte de caja", () => {
  const register: CashRegister = {
    id: "r1",
    openedBy: "u1",
    openedAt: "2026-09-27T08:00:00",
    openingAmount: 5000,
    status: "closed",
    closedBy: "u1",
    closedAt: "2026-09-27T20:00:00",
    countedAmount: 14500,
    expectedAmount: 15000,
    difference: -500,
    notes: null,
  };
  const summary: RegisterSummary = {
    openingAmount: 5000,
    cashSales: 12000,
    cashIn: 1000,
    cashOut: 3000,
    expectedCash: 15000,
    byMethod: { cash: 12000, card: 4000, transfer: 1500 },
    salesCount: 8,
    voidedCount: 1,
    grossSales: 17500,
    discountTotal: 700,
    taxTotal: 2283,
  };

  it("muestra esperado, contado y diferencia", () => {
    const doc = layoutRegisterReport(
      { kind: "Z", register, summary, cashierName: "Ana", printedAt: "2026-09-27T20:01:00" },
      { paperWidth: 58, charset: "pc850" },
    );
    const text = docToPlainText(doc);
    expect(text).toContain("C O R T E   Z");
    expect(text).toMatch(/Esperado en caja\s+150\.00/);
    expect(text).toMatch(/Contado\s+145\.00/);
    expect(text).toMatch(/Diferencia \(faltante\)\s+-5\.00/);
    expect(text).toMatch(/Transferencia\s+15\.00/);
    expect(text).toMatch(/Ventas anuladas\s+1/);
    for (const l of textLines(doc)) expect(l.text.length).toBeLessThanOrEqual(doc.columns / (l.size ?? 1));
  });

  it("el corte X no muestra contado", () => {
    const text = docToPlainText(
      layoutRegisterReport(
        { kind: "X", register: { ...register, status: "open", closedAt: null, countedAmount: null, difference: null }, summary },
        { paperWidth: 80, charset: "pc850" },
      ),
    );
    expect(text).not.toContain("Contado");
  });
});

describe("ESC/POS", () => {
  it("inicia, selecciona página y corta", () => {
    const doc = layoutTestPage({ paperWidth: 58, charset: "pc850", transportLabel: "Bluetooth" });
    const bytes = encodeDoc(doc, { charset: "pc850" });
    expect(Array.from(bytes.slice(0, 5))).toEqual([0x1b, 0x40, 0x1b, 0x74, 2]);
    expect(Array.from(bytes.slice(-4))).toEqual([0x1d, 0x56, 0x42, 3]);
  });

  it("abre la gaveta solo una vez con varias copias", () => {
    const doc = layoutReceipt(sale, { paperWidth: 58, charset: "pc850" });
    const bytes = Array.from(encodeDocs([doc, doc], { charset: "pc850", openDrawer: true }));
    const kick = [0x1b, 0x70, 0x00, 0x19, 0xfa];
    const count = bytes.filter((_, i) => kick.every((b, k) => bytes[i + k] === b)).length;
    expect(count).toBe(1);
    const cuts = bytes.filter((_, i) => bytes[i] === 0x1d && bytes[i + 1] === 0x56).length;
    expect(cuts).toBe(2);
  });

  it("aplica negrita, alineación y doble tamaño", () => {
    const doc: PrintDoc = {
      paperWidth: 58,
      columns: 32,
      lines: [{ type: "text", text: "Hola", align: "center", bold: true, size: 2 }],
    };
    const bytes = Array.from(encodeDoc(doc, { charset: "ascii", cut: false, init: false }));
    const s = bytes.join(",");
    expect(s).toContain([0x1b, 0x61, 1].join(","));
    expect(s).toContain([0x1b, 0x45, 1].join(","));
    expect(s).toContain([0x1d, 0x21, 0x11].join(","));
    expect(s).toContain([0x48, 0x6f, 0x6c, 0x61, 0x0a].join(","));
  });

  it("codifica el QR con la longitud correcta", () => {
    const bytes = Array.from(new EscPos().qr("VENTA-001042").bytes());
    const store = bytes.findIndex((b, i) => b === 0x31 && bytes[i + 1] === 0x50 && bytes[i + 2] === 0x30);
    expect(bytes[store - 2]).toBe("VENTA-001042".length + 3);
    expect(bytes[store - 1]).toBe(0);
  });

  it("parte en bloques de hasta 180 bytes", () => {
    const chunks = chunkBytes(new Uint8Array(400), 180);
    expect(chunks.map((c) => c.length)).toEqual([180, 180, 40]);
  });
});

describe("preferencias", () => {
  it("normaliza valores inválidos", () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_PRINTER_SETTINGS);
    const s = normalizeSettings({ transport: "fax", paperWidth: 58, copies: 3, autoPrint: true, baudRate: 115200 });
    expect(s.transport).toBe("browser");
    expect(s.paperWidth).toBe(58);
    expect(s.copies).toBe(1);
    expect(s.autoPrint).toBe(true);
    expect(s.baudRate).toBe(115200);
  });
});

describe("impresión en navegador", () => {
  it("dimensiona la fuente para que quepan las columnas", () => {
    const m58 = browserPrintMetrics(layoutReceipt(sale, { paperWidth: 58, charset: "pc850" }));
    expect(m58.contentWidthMm).toBe(48);
    expect(m58.fontSizeMm * 0.6 * 32).toBeCloseTo(48);
    expect(m58.pageHeightMm).toBeGreaterThan(50);
  });
});
