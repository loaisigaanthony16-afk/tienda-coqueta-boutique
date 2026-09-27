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

/** Forma completa de la base de datos demo guardada en localStorage. */
export interface DemoDb {
  version: number;
  profiles: Profile[];
  categories: Category[];
  products: Product[];
  variants: ProductVariant[];
  registers: CashRegister[];
  cashMovements: CashMovement[];
  sales: Sale[];
  saleItems: SaleItem[];
  inventoryMovements: InventoryMovement[];
  counters: { saleNumber: number; barcode: number };
  sessionUserId: string | null;
}

export const DEMO_DB_VERSION = 3;
export const DEMO_DB_KEY = "coqueta.demo.db";
