import {
  BarChart3, Boxes, ReceiptText, Settings, ShoppingBag, Wallet, type LucideIcon,
} from "lucide-react";
import type { Role } from "@/domain/types";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Atajo de teclado (F-key) para ir directo. */
  shortcut: string;
  roles: Role[];
  /** Mostrar en la barra inferior móvil. */
  mobile: boolean;
}

export const NAV: NavItem[] = [
  { href: "/pos", label: "Vender", icon: ShoppingBag, shortcut: "F1", roles: ["admin", "cashier"], mobile: true },
  { href: "/caja", label: "Caja", icon: Wallet, shortcut: "F2", roles: ["admin", "cashier"], mobile: true },
  { href: "/ventas", label: "Ventas", icon: ReceiptText, shortcut: "F3", roles: ["admin", "cashier"], mobile: true },
  { href: "/inventario", label: "Inventario", icon: Boxes, shortcut: "F4", roles: ["admin", "cashier"], mobile: true },
  { href: "/reportes", label: "Reportes", icon: BarChart3, shortcut: "F6", roles: ["admin"], mobile: true },
  { href: "/ajustes", label: "Ajustes", icon: Settings, shortcut: "F7", roles: ["admin", "cashier"], mobile: false },
];
