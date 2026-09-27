import type { Metadata } from "next";
import { PosTerminal } from "@/components/pos/pos-terminal";

export const metadata: Metadata = { title: "Vender" };

export default function Page() {
  return <PosTerminal />;
}
