import { summarizeRegister } from "@/domain/cash";
import { settle } from "@/domain/payment";
import { priceCart } from "@/domain/pricing";
import type {
  CashMovement,
  CashRegister,
  InventoryMovement,
  Product,
  ProductVariant,
  Profile,
  Sale,
  SaleItem,
  SaleWithItems,
} from "@/domain/types";
import { uid } from "@/lib/utils";
import { DEMO_DB_KEY, DEMO_DB_VERSION, type DemoDb } from "./demo-db";
import {
  RepositoryError,
  type CreateSaleInput,
  type Credentials,
  type DateRange,
  type ProductDraft,
  type Repository,
} from "./repository";
import { buildSeed } from "./seed";

interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function memoryStorage(): KeyValueStorage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
}

const clone = <T,>(v: T): T => structuredClone(v);
const now = () => new Date().toISOString();
const inRange = (iso: string, r?: DateRange) => !r || (iso >= r.from && iso < r.to);

/**
 * Repositorio que vive por completo en el navegador. Cada mutación trabaja
 * sobre una copia y solo la persiste si todo sale bien (todo-o-nada), igual
 * que una transacción SQL.
 */
export class DemoRepository implements Repository {
  readonly mode = "demo" as const;
  private db: DemoDb;
  private storage: KeyValueStorage;

  constructor(storage?: KeyValueStorage) {
    this.storage =
      storage ?? (typeof window !== "undefined" ? window.localStorage : memoryStorage());
    this.db = this.load();
  }

  private load(): DemoDb {
    try {
      const raw = this.storage.getItem(DEMO_DB_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as DemoDb;
        if (parsed.version === DEMO_DB_VERSION) return parsed;
      }
    } catch {
      // datos corruptos: se regeneran
    }
    const fresh = buildSeed();
    this.persist(fresh);
    return fresh;
  }

  private persist(db: DemoDb) {
    try {
      this.storage.setItem(DEMO_DB_KEY, JSON.stringify(db));
    } catch {
      // cuota llena o modo privado: la demo sigue en memoria
    }
  }

  private tx<T>(fn: (db: DemoDb) => T): T {
    const draft = clone(this.db);
    const result = fn(draft);
    this.db = draft;
    this.persist(draft);
    return clone(result);
  }

  /** Borra todo y vuelve a los datos de ejemplo. */
  reset() {
    this.db = buildSeed();
    this.persist(this.db);
  }

  private requireUser(db: DemoDb, role?: Profile["role"]): Profile {
    const user = db.profiles.find((p) => p.id === db.sessionUserId && p.active);
    if (!user) throw new RepositoryError("Sesión no iniciada.", "auth");
    if (role === "admin" && user.role !== "admin")
      throw new RepositoryError("Solo un administrador puede hacer esto.", "forbidden");
    return user;
  }

  // ---------- Sesión ----------
  async getCurrentUser() {
    const u = this.db.profiles.find((p) => p.id === this.db.sessionUserId && p.active);
    return u ? stripPin(u) : null;
  }

  async signIn({ identifier, secret }: Credentials) {
    return this.tx((db) => {
      const u = db.profiles.find((p) => p.id === identifier && p.active);
      if (!u || u.pin !== secret) throw new RepositoryError("PIN incorrecto.", "auth");
      db.sessionUserId = u.id;
      return stripPin(u);
    });
  }

  async signOut() {
    this.tx((db) => void (db.sessionUserId = null));
  }

  async listProfiles() {
    return this.db.profiles.filter((p) => p.active).map(stripPin);
  }

  // ---------- Catálogo ----------
  async listCategories() {
    return clone([...this.db.categories].sort((a, b) => a.sortOrder - b.sortOrder));
  }

  async saveCategory(c: { id?: string; name: string; sortOrder: number }) {
    return this.tx((db) => {
      this.requireUser(db, "admin");
      const name = c.name.trim();
      if (!name) throw new RepositoryError("El nombre es obligatorio.");
      const existing = c.id ? db.categories.find((x) => x.id === c.id) : undefined;
      if (existing) {
        existing.name = name;
        existing.sortOrder = c.sortOrder;
        return existing;
      }
      const created = { id: uid("cat"), name, sortOrder: c.sortOrder };
      db.categories.push(created);
      return created;
    });
  }

  async listProducts() {
    return clone(this.db.products);
  }

  async listVariants() {
    return clone(this.db.variants);
  }

  async reserveBarcodeSequence(count: number) {
    return this.tx((db) => {
      const start = db.counters.barcode;
      db.counters.barcode += Math.max(1, count);
      return start;
    });
  }

  async saveProduct(draft: ProductDraft) {
    return this.tx((db) => {
      const user = this.requireUser(db, "admin");
      validateDraft(draft);
      const ts = now();
      let product = draft.id ? db.products.find((p) => p.id === draft.id) : undefined;
      if (draft.id && !product) throw new RepositoryError("Producto no encontrado.", "not_found");
      const fields = {
        categoryId: draft.categoryId, name: draft.name.trim(), brand: draft.brand?.trim() || null,
        description: draft.description?.trim() || null, skuBase: draft.skuBase.trim().toUpperCase(),
        basePrice: draft.basePrice, baseCost: draft.baseCost, imageUrl: draft.imageUrl, active: draft.active,
      };
      if (product) Object.assign(product, fields, { updatedAt: ts });
      else {
        product = { id: uid("prd"), ...fields, createdAt: ts, updatedAt: ts };
        db.products.push(product);
      }

      for (const vd of draft.variants) {
        const clash = db.variants.find(
          (v) => v.id !== vd.id && (v.sku === vd.sku.trim() || v.barcode === vd.barcode.trim()),
        );
        if (clash) throw new RepositoryError(`SKU o código repetido: ${clash.sku}`);
        const vfields = {
          size: vd.size, color: vd.color, sku: vd.sku.trim(), barcode: vd.barcode.trim(),
          price: vd.price, cost: vd.cost, minStock: vd.minStock, active: vd.active,
        };
        const existing = vd.id ? db.variants.find((v) => v.id === vd.id && v.productId === product!.id) : undefined;
        if (existing) Object.assign(existing, vfields);
        else {
          const stock = Math.max(0, Math.trunc(vd.initialStock ?? 0));
          const v: ProductVariant = { id: uid("var"), productId: product.id, ...vfields, stock };
          db.variants.push(v);
          if (stock > 0) pushMovement(db, v, "initial", stock, null, "Inventario inicial", user.id);
        }
      }
      return { product, variants: db.variants.filter((v) => v.productId === product!.id) };
    });
  }

  async adjustStock(input: {
    variantId: string;
    delta: number;
    type: "purchase" | "adjustment" | "return";
    note?: string | null;
  }) {
    return this.tx((db) => {
      const user = this.requireUser(db, "admin");
      const v = db.variants.find((x) => x.id === input.variantId);
      if (!v) throw new RepositoryError("Variante no encontrada.", "not_found");
      const delta = Math.trunc(input.delta);
      if (!delta) throw new RepositoryError("La cantidad no puede ser cero.");
      if (v.stock + delta < 0) throw new RepositoryError("El stock no puede quedar negativo.", "insufficient_stock");
      v.stock += delta;
      pushMovement(db, v, input.type, delta, null, input.note ?? null, user.id);
      return v;
    });
  }

  async listInventoryMovements(opts: { variantId?: string; limit?: number } = {}) {
    const list = this.db.inventoryMovements
      .filter((m) => !opts.variantId || m.variantId === opts.variantId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return clone(opts.limit ? list.slice(0, opts.limit) : list);
  }

  // ---------- Caja ----------
  async getOpenRegister() {
    const r = this.db.registers.find((x) => x.status === "open");
    return r ? clone(r) : null;
  }

  async openRegister(openingAmount: number) {
    return this.tx((db) => {
      const user = this.requireUser(db);
      if (db.registers.some((r) => r.status === "open"))
        throw new RepositoryError("Ya hay una caja abierta.", "register_open");
      if (!Number.isInteger(openingAmount) || openingAmount < 0)
        throw new RepositoryError("Monto de apertura inválido.");
      const reg: CashRegister = {
        id: uid("reg"), openedBy: user.id, openedAt: now(), openingAmount, status: "open",
        closedBy: null, closedAt: null, countedAmount: null, expectedAmount: null, difference: null, notes: null,
      };
      db.registers.push(reg);
      return reg;
    });
  }

  async closeRegister(input: { registerId: string; countedAmount: number; notes?: string | null }) {
    return this.tx((db) => {
      const user = this.requireUser(db);
      const reg = db.registers.find((r) => r.id === input.registerId);
      if (!reg) throw new RepositoryError("Caja no encontrada.", "not_found");
      if (reg.status !== "open") throw new RepositoryError("La caja ya está cerrada.", "register_closed");
      if (!Number.isInteger(input.countedAmount) || input.countedAmount < 0)
        throw new RepositoryError("Monto contado inválido.");
      const summary = summarizeRegister(
        reg.openingAmount,
        db.sales.filter((s) => s.registerId === reg.id),
        db.cashMovements.filter((m) => m.registerId === reg.id),
      );
      Object.assign(reg, {
        status: "closed", closedBy: user.id, closedAt: now(), countedAmount: input.countedAmount,
        expectedAmount: summary.expectedCash, difference: input.countedAmount - summary.expectedCash,
        notes: input.notes?.trim() || null,
      });
      return reg;
    });
  }

  async listRegisters(range?: DateRange) {
    return clone(
      this.db.registers
        .filter((r) => inRange(r.openedAt, range))
        .sort((a, b) => b.openedAt.localeCompare(a.openedAt)),
    );
  }

  async addCashMovement(input: { registerId: string; type: "in" | "out"; amount: number; reason: string }) {
    return this.tx((db) => {
      const user = this.requireUser(db);
      const reg = db.registers.find((r) => r.id === input.registerId);
      if (!reg || reg.status !== "open") throw new RepositoryError("La caja no está abierta.", "register_closed");
      if (!Number.isInteger(input.amount) || input.amount <= 0) throw new RepositoryError("Monto inválido.");
      if (!input.reason.trim()) throw new RepositoryError("Indica el motivo.");
      if (input.type === "out") {
        const s = summarizeRegister(
          reg.openingAmount,
          db.sales.filter((x) => x.registerId === reg.id),
          db.cashMovements.filter((m) => m.registerId === reg.id),
        );
        if (input.amount > s.expectedCash)
          throw new RepositoryError("No hay suficiente efectivo en caja para ese retiro.");
      }
      const m: CashMovement = {
        id: uid("cmv"), registerId: reg.id, type: input.type, amount: input.amount,
        reason: input.reason.trim(), createdBy: user.id, createdAt: now(),
      };
      db.cashMovements.push(m);
      return m;
    });
  }

  async listCashMovements(registerId: string) {
    return clone(
      this.db.cashMovements
        .filter((m) => m.registerId === registerId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    );
  }

  // ---------- Ventas ----------
  async createSale(input: CreateSaleInput): Promise<SaleWithItems> {
    return this.tx((db) => {
      const user = this.requireUser(db);
      const reg = db.registers.find((r) => r.id === input.registerId);
      if (!reg || reg.status !== "open")
        throw new RepositoryError("Abre la caja antes de vender.", "register_closed");
      if (!input.items.length) throw new RepositoryError("El carrito está vacío.");

      // Agrupa líneas repetidas para validar stock sobre el total real.
      const needed = new Map<string, number>();
      for (const it of input.items) {
        if (!Number.isInteger(it.quantity) || it.quantity <= 0) throw new RepositoryError("Cantidad inválida.");
        needed.set(it.variantId, (needed.get(it.variantId) ?? 0) + it.quantity);
      }
      const resolved = input.items.map((it) => {
        const v = db.variants.find((x) => x.id === it.variantId && x.active);
        const p = v && db.products.find((x) => x.id === v.productId && x.active);
        if (!v || !p) throw new RepositoryError("Producto no disponible.", "not_found");
        return { it, v, p };
      });
      for (const [variantId, qty] of needed) {
        const v = db.variants.find((x) => x.id === variantId)!;
        if (v.stock < qty)
          throw new RepositoryError(`Stock insuficiente de ${v.sku} (quedan ${v.stock}).`, "insufficient_stock");
      }

      const priced = priceCart(
        resolved.map(({ it, v, p }, i) => ({
          key: String(i), quantity: it.quantity, unitPrice: v.price ?? p.basePrice,
          unitCost: v.cost ?? p.baseCost, discount: it.discount,
        })),
        input.cartDiscount ?? null,
      );
      const settled = settle(priced.total, input.tenders);
      if (!settled.ok) throw new RepositoryError(settled.error);

      const ts = now();
      db.counters.saleNumber += 1;
      const sale: Sale = {
        id: uid("sal"), number: db.counters.saleNumber, registerId: reg.id, cashierId: user.id,
        customerName: input.customerName?.trim() || null, subtotal: priced.subtotal,
        discountTotal: priced.discountTotal, taxTotal: priced.taxTotal, total: priced.total,
        payments: settled.payments, change: settled.change, status: "completed", createdAt: ts,
        voidedAt: null, voidReason: null,
      };
      const items: SaleItem[] = priced.lines.map((pl, i) => {
        const { v, p } = resolved[i];
        v.stock -= pl.quantity;
        pushMovement(db, v, "sale", -pl.quantity, sale.id, null, user.id);
        return {
          id: uid("itm"), saleId: sale.id, variantId: v.id, productName: p.name,
          variantLabel: [v.size, v.color].filter(Boolean).join(" / "), sku: v.sku,
          quantity: pl.quantity, unitPrice: pl.unitPrice, unitCost: pl.unitCost,
          discount: pl.discount, lineTotal: pl.lineTotal,
        };
      });
      db.sales.push(sale);
      db.saleItems.push(...items);
      return { ...sale, items };
    });
  }

  async voidSale(saleId: string, reason: string) {
    return this.tx((db) => {
      const user = this.requireUser(db, "admin");
      const sale = db.sales.find((s) => s.id === saleId);
      if (!sale) throw new RepositoryError("Venta no encontrada.", "not_found");
      if (sale.status === "voided") throw new RepositoryError("La venta ya estaba anulada.");
      if (!reason.trim()) throw new RepositoryError("Indica el motivo de la anulación.");
      const reg = db.registers.find((r) => r.id === sale.registerId);
      if (!reg || reg.status !== "open")
        throw new RepositoryError("Solo se pueden anular ventas de la caja abierta.", "register_closed");
      sale.status = "voided";
      sale.voidedAt = now();
      sale.voidReason = reason.trim();
      const items = db.saleItems.filter((i) => i.saleId === sale.id);
      for (const it of items) {
        const v = db.variants.find((x) => x.id === it.variantId);
        if (!v) continue;
        v.stock += it.quantity;
        pushMovement(db, v, "void", it.quantity, sale.id, sale.voidReason, user.id);
      }
      return { ...sale, items };
    });
  }

  async getSale(saleId: string) {
    const sale = this.db.sales.find((s) => s.id === saleId);
    if (!sale) return null;
    return clone({ ...sale, items: this.db.saleItems.filter((i) => i.saleId === saleId) });
  }

  async listSales(opts: { range?: DateRange; registerId?: string }) {
    const byId = new Map<string, SaleItem[]>();
    for (const it of this.db.saleItems) {
      const list = byId.get(it.saleId);
      if (list) list.push(it);
      else byId.set(it.saleId, [it]);
    }
    return clone(
      this.db.sales
        .filter((s) => inRange(s.createdAt, opts.range) && (!opts.registerId || s.registerId === opts.registerId))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((s) => ({ ...s, items: byId.get(s.id) ?? [] })),
    );
  }

  async listSaleItems(range: DateRange) {
    const ids = new Set(
      this.db.sales.filter((s) => s.status === "completed" && inRange(s.createdAt, range)).map((s) => s.id),
    );
    return clone(this.db.saleItems.filter((i) => ids.has(i.saleId)));
  }
}

function stripPin(p: Profile): Profile {
  const { pin: _pin, ...rest } = p;
  return rest;
}

function pushMovement(
  db: DemoDb,
  v: ProductVariant,
  type: InventoryMovement["type"],
  quantity: number,
  referenceId: string | null,
  note: string | null,
  createdBy: string,
) {
  db.inventoryMovements.push({
    id: uid("mov"), variantId: v.id, type, quantity, stockAfter: v.stock, referenceId, note,
    createdBy, createdAt: now(),
  });
}

function validateDraft(d: ProductDraft) {
  if (!d.name.trim()) throw new RepositoryError("El nombre es obligatorio.");
  if (!d.skuBase.trim()) throw new RepositoryError("El SKU base es obligatorio.");
  if (!Number.isInteger(d.basePrice) || d.basePrice < 0) throw new RepositoryError("Precio inválido.");
  if (!Number.isInteger(d.baseCost) || d.baseCost < 0) throw new RepositoryError("Costo inválido.");
  if (!d.variants.length) throw new RepositoryError("Agrega al menos una variante.");
  const skus = new Set<string>();
  const codes = new Set<string>();
  for (const v of d.variants) {
    if (!v.sku.trim() || !v.barcode.trim()) throw new RepositoryError("Cada variante necesita SKU y código.");
    if (skus.has(v.sku) || codes.has(v.barcode)) throw new RepositoryError(`Variante repetida: ${v.sku}`);
    skus.add(v.sku);
    codes.add(v.barcode);
  }
}

export type { Product };
