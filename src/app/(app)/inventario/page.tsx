import type { Metadata } from "next";
import { InventoryView } from "@/components/inventory/inventory-view";

export const metadata: Metadata = { title: "Inventario" };

export default function Page() {
  return <InventoryView />;
}
