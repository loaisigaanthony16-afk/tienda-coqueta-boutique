"use client";
import { DataCard } from "./data-card";
import { PrinterCard } from "./printer-card";
import { ScannerCard } from "./scanner-card";
import { SessionCard } from "./session-card";
import { StoreCard } from "./store-card";

export function SettingsPage() {
  return (
    <div className="mx-auto grid w-full max-w-6xl gap-4 p-4 md:p-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
      <div className="flex min-w-0 flex-col gap-4">
        <PrinterCard />
        <ScannerCard />
      </div>
      <div className="flex min-w-0 flex-col gap-4">
        <StoreCard />
        <SessionCard />
        <DataCard />
      </div>
    </div>
  );
}
