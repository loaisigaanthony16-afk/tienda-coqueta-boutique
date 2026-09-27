import type { Metadata } from "next";
import { CashPage } from "@/components/cash/cash-page";

export const metadata: Metadata = { title: "Caja" };

export default function Page() {
  return <CashPage />;
}
