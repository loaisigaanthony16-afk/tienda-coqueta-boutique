import type { TenderInput } from "@/domain/payment";
import type {
  CashMovement,
  CashMovementType,
  CashRegister,
  Category,
  Cents,
  Discount,
  InventoryMovement,
  InventoryMovementType,
  Product,
  ProductVariant,
  Profile,
  SaleItem,
  SaleWithItems,
} from "@/domain/types";

/**
 * Contrato único de acceso a datos. Hay dos implementaciones:
 *  - DemoRepository: todo en el navegador (localStorage), sin backend.
 *  - SupabaseRepository: PostgreSQL + RLS; las operaciones críticas
 *    (venta, anulación, cierre de caja) van por RPC transaccionales.
 * La UI solo conoce esta interfaz.
 */

export interface DateRange {
  from: string; // ISO, inclusivo
  to: string; // ISO, exclusivo
}

export interface SaleItemInput {
  variantId: string;
  quantity: number;
  discount?: Discount | null;
}

export interface CreateSaleInput {
  registerId: string;
  items: SaleItemInput[];
  cartDiscount?: Discount | null;
  tenders: TenderInput[];
  customerName?: string | null;
}

export interface VariantDraft {
  id?: string;
  size: string | null;
  color: string | null;
  sku: string;
  barcode: string;
  price: Cents | null;
  cost: Cents | null;
  /** Solo para variantes nuevas: stock inicial. */
  initialStock?: number;
  minStock: number;
  active: boolean;
}

export interface ProductDraft {
  id?: string;
  categoryId: string | null;
  name: string;
  brand: string | null;
  description: string | null;
  skuBase: string;
  basePrice: Cents;
  baseCost: Cents;
  imageUrl: string | null;
  active: boolean;
  variants: VariantDraft[];
}

export interface Credentials {
  /** Demo: id del perfil. Supabase: email. */
  identifier: string;
  /** Demo: PIN. Supabase: contraseña. */
  secret: string;
}

export class RepositoryError extends Error {
  constructor(
    message: string,
    public code:
      | "not_found"
      | "insufficient_stock"
      | "register_closed"
      | "register_open"
      | "invalid"
      | "forbidden"
      | "auth" = "invalid",
  ) {
    super(message);
    this.name = "RepositoryError";
  }
}

export interface Repository {
  readonly mode: "demo" | "supabase";

  // Sesión
  getCurrentUser(): Promise<Profile | null>;
  signIn(c: Credentials): Promise<Profile>;
  signOut(): Promise<void>;
  /** Lista de perfiles para la pantalla de entrada (demo) y ajustes. */
  listProfiles(): Promise<Profile[]>;

  // Catálogo
  listCategories(): Promise<Category[]>;
  saveCategory(c: Omit<Category, "id"> & { id?: string }): Promise<Category>;
  listProducts(): Promise<Product[]>;
  listVariants(): Promise<ProductVariant[]>;
  /** Crea o actualiza producto + matriz de variantes en una sola operación. */
  saveProduct(draft: ProductDraft): Promise<{ product: Product; variants: ProductVariant[] }>;
  /** Siguiente número para EAN-13 interno (reserva un bloque de `count`). */
  reserveBarcodeSequence(count: number): Promise<number>;
  adjustStock(input: {
    variantId: string;
    delta: number;
    type: Extract<InventoryMovementType, "purchase" | "adjustment" | "return">;
    note?: string | null;
  }): Promise<ProductVariant>;
  listInventoryMovements(opts?: { variantId?: string; limit?: number }): Promise<InventoryMovement[]>;

  // Caja
  getOpenRegister(): Promise<CashRegister | null>;
  openRegister(openingAmount: Cents): Promise<CashRegister>;
  closeRegister(input: { registerId: string; countedAmount: Cents; notes?: string | null }): Promise<CashRegister>;
  listRegisters(range?: DateRange): Promise<CashRegister[]>;
  addCashMovement(input: {
    registerId: string;
    type: CashMovementType;
    amount: Cents;
    reason: string;
  }): Promise<CashMovement>;
  listCashMovements(registerId: string): Promise<CashMovement[]>;

  // Ventas
  /** Recalcula precios con datos del servidor, valida stock y pagos, descuenta inventario. Atómica. */
  createSale(input: CreateSaleInput): Promise<SaleWithItems>;
  /** Anula y devuelve el stock. Solo admin. */
  voidSale(saleId: string, reason: string): Promise<SaleWithItems>;
  getSale(saleId: string): Promise<SaleWithItems | null>;
  listSales(opts: { range?: DateRange; registerId?: string }): Promise<SaleWithItems[]>;
  listSaleItems(range: DateRange): Promise<SaleItem[]>;
}
