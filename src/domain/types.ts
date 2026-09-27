/**
 * Modelo de dominio. Refleja 1:1 las tablas de supabase/schema.sql
 * (en camelCase). Todo monto es un entero en centavos.
 */

export type Cents = number;
export type ISODate = string;

export type Role = "admin" | "cashier";

export interface Profile {
  id: string;
  fullName: string;
  role: Role;
  /** Solo en modo demo: PIN de 4 dígitos para entrar. */
  pin?: string;
  active: boolean;
}

export interface Category {
  id: string;
  name: string;
  sortOrder: number;
}

export interface Product {
  id: string;
  categoryId: string | null;
  name: string;
  brand: string | null;
  description: string | null;
  /** Prefijo base del SKU, p. ej. "BLU-LIN". */
  skuBase: string;
  basePrice: Cents;
  baseCost: Cents;
  imageUrl: string | null;
  active: boolean;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface ProductVariant {
  id: string;
  productId: string;
  sku: string;
  /** EAN-13 o código interno escaneable. */
  barcode: string;
  size: string | null;
  color: string | null;
  /** null = hereda el precio del producto. */
  price: Cents | null;
  cost: Cents | null;
  stock: number;
  minStock: number;
  active: boolean;
}

/** Variante con datos del producto ya resueltos (lo que usa la UI). */
export interface VariantView extends ProductVariant {
  productName: string;
  brand: string | null;
  categoryId: string | null;
  effectivePrice: Cents;
  effectiveCost: Cents;
  imageUrl: string | null;
}

export type RegisterStatus = "open" | "closed";

export interface CashRegister {
  id: string;
  openedBy: string;
  openedAt: ISODate;
  openingAmount: Cents;
  status: RegisterStatus;
  closedBy: string | null;
  closedAt: ISODate | null;
  /** Efectivo contado físicamente al cierre. */
  countedAmount: Cents | null;
  /** Efectivo esperado según el sistema al cierre. */
  expectedAmount: Cents | null;
  /** counted - expected. Negativo = faltante. */
  difference: Cents | null;
  notes: string | null;
}

export type CashMovementType = "in" | "out";

export interface CashMovement {
  id: string;
  registerId: string;
  type: CashMovementType;
  amount: Cents;
  reason: string;
  createdBy: string;
  createdAt: ISODate;
}

export type PaymentMethod = "cash" | "card" | "transfer";

export interface Payment {
  method: PaymentMethod;
  /** Monto aplicado a la venta (sin el vuelto). */
  amount: Cents;
  /** Solo efectivo: lo que entregó el cliente. */
  tendered?: Cents;
  reference?: string;
}

export type SaleStatus = "completed" | "voided";

export interface Sale {
  id: string;
  /** Número correlativo legible, p. ej. 1042. */
  number: number;
  registerId: string;
  cashierId: string;
  customerName: string | null;
  subtotal: Cents;
  discountTotal: Cents;
  taxTotal: Cents;
  total: Cents;
  payments: Payment[];
  change: Cents;
  status: SaleStatus;
  createdAt: ISODate;
  voidedAt: ISODate | null;
  voidReason: string | null;
}

export interface SaleItem {
  id: string;
  saleId: string;
  variantId: string;
  productName: string;
  variantLabel: string;
  sku: string;
  quantity: number;
  unitPrice: Cents;
  unitCost: Cents;
  discount: Cents;
  lineTotal: Cents;
}

export type InventoryMovementType =
  | "sale"
  | "void"
  | "purchase"
  | "adjustment"
  | "return"
  | "initial";

export interface InventoryMovement {
  id: string;
  variantId: string;
  type: InventoryMovementType;
  /** Positivo = entra, negativo = sale. */
  quantity: number;
  stockAfter: number;
  referenceId: string | null;
  note: string | null;
  createdBy: string | null;
  createdAt: ISODate;
}

export interface SaleWithItems extends Sale {
  items: SaleItem[];
}

export type Discount =
  | { kind: "percent"; bps: number }
  | { kind: "amount"; cents: Cents };
