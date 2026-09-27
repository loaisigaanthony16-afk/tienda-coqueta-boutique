import { internalEan13, skuBaseFromName, variantSku } from "@/domain/codes";
import { priceCart } from "@/domain/pricing";
import { settle, type TenderInput } from "@/domain/payment";
import { summarizeRegister } from "@/domain/cash";
import type {
  CashMovement,
  CashRegister,
  Category,
  InventoryMovement,
  Product,
  ProductVariant,
  Profile,
  Sale,
  SaleItem,
} from "@/domain/types";
import { DEMO_DB_VERSION, type DemoDb } from "./demo-db";

/** PRNG determinista (mulberry32) para que la demo sea siempre igual. */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CATEGORIES: Array<[string, string]> = [
  ["cat_blusas", "Blusas y tops"],
  ["cat_vestidos", "Vestidos"],
  ["cat_pantalones", "Pantalones y faldas"],
  ["cat_jeans", "Jeans"],
  ["cat_calzado", "Calzado"],
  ["cat_accesorios", "Accesorios"],
  ["cat_bolsos", "Bolsos"],
];

const ROPA = ["XS", "S", "M", "L", "XL"];
const CALZADO = ["35", "36", "37", "38", "39", "40"];

type SeedProduct = [
  name: string,
  category: string,
  brand: string,
  price: number,
  cost: number,
  sizes: string[] | null,
  colors: string[] | null,
];

const PRODUCTS: SeedProduct[] = [
  ["Blusa de lino", "cat_blusas", "Coqueta", 2450, 1100, ROPA, ["Blanco", "Beige", "Negro"]],
  ["Top de tirantes", "cat_blusas", "Coqueta", 1500, 600, ["S", "M", "L"], ["Negro", "Rosa", "Blanco"]],
  ["Camisa oversize", "cat_blusas", "Urbana", 2890, 1300, ["S", "M", "L", "XL"], ["Celeste", "Blanco"]],
  ["Body manga larga", "cat_blusas", "Coqueta", 1990, 850, ["S", "M", "L"], ["Negro", "Vino"]],
  ["Crop top acanalado", "cat_blusas", "Urbana", 1290, 520, ["XS", "S", "M"], ["Blanco", "Lila", "Verde"]],
  ["Vestido midi floral", "cat_vestidos", "Bella", 4590, 2100, ["S", "M", "L"], ["Azul", "Rosa"]],
  ["Vestido satinado", "cat_vestidos", "Bella", 5490, 2600, ["XS", "S", "M", "L"], ["Champán", "Negro", "Esmeralda"]],
  ["Vestido camisero", "cat_vestidos", "Coqueta", 3990, 1750, ["S", "M", "L", "XL"], ["Beige", "Verde"]],
  ["Vestido corto de punto", "cat_vestidos", "Urbana", 3290, 1400, ["S", "M", "L"], ["Negro", "Rojo"]],
  ["Pantalón palazzo", "cat_pantalones", "Bella", 3490, 1500, ROPA, ["Negro", "Beige"]],
  ["Falda plisada", "cat_pantalones", "Coqueta", 2790, 1150, ["S", "M", "L"], ["Negro", "Rosa", "Verde"]],
  ["Short de lino", "cat_pantalones", "Urbana", 1890, 780, ["S", "M", "L"], ["Blanco", "Beige"]],
  ["Pantalón cargo", "cat_pantalones", "Urbana", 3190, 1450, ["S", "M", "L", "XL"], ["Verde", "Negro"]],
  ["Jean mom fit", "cat_jeans", "Denim Co", 3990, 1800, ["26", "28", "30", "32"], ["Azul claro", "Azul oscuro"]],
  ["Jean wide leg", "cat_jeans", "Denim Co", 4290, 1950, ["26", "28", "30", "32"], ["Azul", "Negro"]],
  ["Jean skinny tiro alto", "cat_jeans", "Denim Co", 3590, 1600, ["26", "28", "30", "32", "34"], ["Azul oscuro"]],
  ["Sandalia de tiras", "cat_calzado", "Paso Fino", 2990, 1300, CALZADO, ["Nude", "Negro"]],
  ["Tenis urbanos", "cat_calzado", "Paso Fino", 4990, 2400, CALZADO, ["Blanco"]],
  ["Tacón block", "cat_calzado", "Paso Fino", 4490, 2000, CALZADO.slice(0, 5), ["Negro", "Nude"]],
  ["Aretes dorados", "cat_accesorios", "Brillo", 890, 250, null, ["Dorado", "Plateado"]],
  ["Collar de perlas", "cat_accesorios", "Brillo", 1490, 480, null, null],
  ["Cinturón de cuero", "cat_accesorios", "Coqueta", 1690, 650, ["S", "M", "L"], ["Negro", "Café"]],
  ["Lentes de sol", "cat_accesorios", "Brillo", 1990, 700, null, ["Negro", "Carey"]],
  ["Pañuelo de seda", "cat_accesorios", "Bella", 1290, 450, null, ["Estampado", "Rosa"]],
  ["Bolso tote", "cat_bolsos", "Coqueta", 3990, 1700, null, ["Negro", "Camel"]],
  ["Clutch de fiesta", "cat_bolsos", "Bella", 2790, 1100, null, ["Dorado", "Negro", "Plateado"]],
  ["Mochila mini", "cat_bolsos", "Urbana", 3290, 1400, null, ["Negro", "Beige"]],
];

export const DEMO_PROFILES: Profile[] = [
  { id: "usr_admin", fullName: "Angie (Admin)", role: "admin", pin: "1234", active: true },
  { id: "usr_caja", fullName: "María (Caja)", role: "cashier", pin: "0000", active: true },
];

export function buildSeed(now = new Date()): DemoDb {
  const rand = rng(20260927);
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
  const iso = (d: Date) => d.toISOString();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const DAYS = 30;
  const epoch = new Date(startOfToday.getTime() - (DAYS + 1) * 86400000);

  const categories: Category[] = CATEGORIES.map(([id, name], i) => ({ id, name, sortOrder: i }));
  const products: Product[] = [];
  const variants: ProductVariant[] = [];
  const inventoryMovements: InventoryMovement[] = [];
  let barcode = 1;
  let movementSeq = 1;

  PRODUCTS.forEach(([name, categoryId, brand, price, cost, sizes, colors], pi) => {
    const id = `prd_${String(pi + 1).padStart(3, "0")}`;
    const skuBase = skuBaseFromName(name);
    products.push({
      id, categoryId, name, brand, description: null, skuBase,
      basePrice: price, baseCost: cost, imageUrl: null, active: true,
      createdAt: iso(epoch), updatedAt: iso(epoch),
    });
    const sizeList = sizes ?? [null];
    const colorList = colors ?? [null];
    for (const size of sizeList) {
      for (const color of colorList) {
        const vid = `var_${String(variants.length + 1).padStart(4, "0")}`;
        const stock = 4 + Math.floor(rand() * 14);
        variants.push({
          id: vid, productId: id, sku: variantSku(skuBase, size, color),
          barcode: internalEan13(barcode++), size, color, price: null, cost: null,
          stock, minStock: 3, active: true,
        });
        inventoryMovements.push({
          id: `mov_${movementSeq++}`, variantId: vid, type: "initial", quantity: stock,
          stockAfter: stock, referenceId: null, note: "Inventario inicial",
          createdBy: "usr_admin", createdAt: iso(epoch),
        });
      }
    }
  });

  const productById = new Map(products.map((p) => [p.id, p]));
  const registers: CashRegister[] = [];
  const cashMovements: CashMovement[] = [];
  const sales: Sale[] = [];
  const saleItems: SaleItem[] = [];
  let saleNumber = 1000;

  // 30 días cerrados; el día de hoy queda sin caja abierta.
  for (let d = DAYS; d >= 1; d--) {
    const day = new Date(startOfToday.getTime() - d * 86400000);
    const weekday = day.getDay();
    if (weekday === 0 && rand() < 0.6) continue; // muchos domingos cerrado
    const openAt = new Date(day.getTime() + 9 * 3600000);
    const closeAt = new Date(day.getTime() + 19 * 3600000);
    const cashier = rand() < 0.7 ? "usr_caja" : "usr_admin";
    const reg: CashRegister = {
      id: `reg_${registers.length + 1}`, openedBy: cashier, openedAt: iso(openAt),
      openingAmount: 5000, status: "closed", closedBy: cashier, closedAt: iso(closeAt),
      countedAmount: 0, expectedAmount: 0, difference: 0, notes: null,
    };
    const daySales: Sale[] = [];
    const dayMovs: CashMovement[] = [];
    const count = (weekday === 5 || weekday === 6 ? 9 : 5) + Math.floor(rand() * 6);

    for (let s = 0; s < count; s++) {
      const at = new Date(openAt.getTime() + rand() * (closeAt.getTime() - openAt.getTime() - 600000));
      const nLines = 1 + Math.floor(rand() * 3);
      const lines: { v: ProductVariant; qty: number }[] = [];
      for (let k = 0; k < nLines; k++) {
        const v = pick(variants.filter((x) => x.stock > 2));
        if (!v || lines.some((l) => l.v.id === v.id)) continue;
        lines.push({ v, qty: rand() < 0.85 ? 1 : 2 });
      }
      if (!lines.length) continue;
      const cartDiscount = rand() < 0.12 ? { kind: "percent" as const, bps: 1000 } : null;
      const priced = priceCart(
        lines.map((l) => {
          const p = productById.get(l.v.productId)!;
          return { key: l.v.id, quantity: l.qty, unitPrice: l.v.price ?? p.basePrice, unitCost: l.v.cost ?? p.baseCost };
        }),
        cartDiscount,
      );
      const r = rand();
      let tenders: TenderInput[];
      if (r < 0.55) {
        tenders = [{ method: "cash", amount: Math.ceil(priced.total / 500) * 500 }];
      } else if (r < 0.85) {
        tenders = [{ method: "card", amount: priced.total, reference: String(1000 + Math.floor(rand() * 9000)) }];
      } else if (r < 0.95) {
        tenders = [{ method: "transfer", amount: priced.total, reference: `TRF${Math.floor(rand() * 1e6)}` }];
      } else {
        const card = Math.floor(priced.total / 2);
        tenders = [{ method: "card", amount: card }, { method: "cash", amount: priced.total - card }];
      }
      const settled = settle(priced.total, tenders);
      if (!settled.ok) continue;
      const saleId = `sal_${saleNumber + 1}`;
      const sale: Sale = {
        id: saleId, number: ++saleNumber, registerId: reg.id, cashierId: cashier,
        customerName: null, subtotal: priced.subtotal, discountTotal: priced.discountTotal,
        taxTotal: priced.taxTotal, total: priced.total, payments: settled.payments,
        change: settled.change, status: "completed", createdAt: iso(at), voidedAt: null, voidReason: null,
      };
      priced.lines.forEach((pl, i) => {
        const v = lines[i].v;
        const p = productById.get(v.productId)!;
        v.stock -= pl.quantity;
        saleItems.push({
          id: `itm_${saleItems.length + 1}`, saleId, variantId: v.id, productName: p.name,
          variantLabel: [v.size, v.color].filter(Boolean).join(" / "), sku: v.sku,
          quantity: pl.quantity, unitPrice: pl.unitPrice, unitCost: pl.unitCost,
          discount: pl.discount, lineTotal: pl.lineTotal,
        });
        inventoryMovements.push({
          id: `mov_${movementSeq++}`, variantId: v.id, type: "sale", quantity: -pl.quantity,
          stockAfter: v.stock, referenceId: saleId, note: null, createdBy: cashier, createdAt: iso(at),
        });
      });
      daySales.push(sale);
    }

    if (rand() < 0.35) {
      dayMovs.push({
        id: `cmv_${cashMovements.length + dayMovs.length + 1}`, registerId: reg.id, type: "out",
        amount: 500 + Math.floor(rand() * 20) * 100, reason: pick(["Compra de bolsas", "Pago de limpieza", "Agua y café", "Transporte"]),
        createdBy: cashier, createdAt: iso(new Date(openAt.getTime() + 4 * 3600000)),
      });
    }

    const summary = summarizeRegister(reg.openingAmount, daySales, dayMovs);
    const drift = rand() < 0.8 ? 0 : pick([-200, -50, 100, -1200]);
    reg.expectedAmount = summary.expectedCash;
    reg.countedAmount = summary.expectedCash + drift;
    reg.difference = drift;
    if (drift <= -1000) reg.notes = "Faltante revisado con cajera";
    registers.push(reg);
    sales.push(...daySales);
    cashMovements.push(...dayMovs);
  }

  return {
    version: DEMO_DB_VERSION,
    profiles: DEMO_PROFILES,
    categories,
    products,
    variants,
    registers,
    cashMovements,
    sales,
    saleItems,
    inventoryMovements,
    counters: { saleNumber, barcode },
    sessionUserId: null,
  };
}
