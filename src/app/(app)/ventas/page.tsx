import type { Metadata } from "next";
import { SalesView } from "@/components/sales/sales-view";

export const metadata: Metadata = { title: "Ventas" };

export default function Page() {
  return <SalesView />;
}
