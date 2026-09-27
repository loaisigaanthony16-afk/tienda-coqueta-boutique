"use client";
import * as React from "react";
import { toast } from "sonner";
import { classifyDifference, type DiscrepancyLevel, type RegisterSummary } from "@/domain/cash";
import { formatMoney } from "@/domain/money";
import type { Cents } from "@/domain/types";
import { repo } from "@/data";
import { printRegisterReport, type RegisterReportInput } from "@/lib/printing";
import { useSession } from "@/stores/session";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const LEVEL_VARIANT: Record<DiscrepancyLevel, "success" | "warning" | "destructive"> = {
  ok: "success",
  minor: "warning",
  major: "destructive",
};

export const LEVEL_TEXT: Record<DiscrepancyLevel, string> = {
  ok: "text-success",
  minor: "text-warning",
  major: "text-destructive",
};

/** "Cuadra", "Faltan $X" o "Sobran $X". */
export function differenceMessage(difference: Cents): string {
  if (difference === 0) return "Cuadra";
  return difference < 0 ? `Faltan ${formatMoney(-difference)}` : `Sobran ${formatMoney(difference)}`;
}

export function DifferenceBadge({ difference, className }: { difference: Cents | null; className?: string }) {
  if (difference == null) return <Badge variant="outline" className={className}>—</Badge>;
  return (
    <Badge variant={LEVEL_VARIANT[classifyDifference(difference)]} className={cn("tabular", className)}>
      {differenceMessage(difference)}
    </Badge>
  );
}

/** Fondo inicial + Ventas en efectivo + Entradas − Salidas = Esperado. */
export function CashLedger({ summary, className }: { summary: RegisterSummary; className?: string }) {
  const rows: { sign: string; label: string; value: Cents }[] = [
    { sign: "", label: "Fondo inicial", value: summary.openingAmount },
    { sign: "+", label: "Ventas en efectivo", value: summary.cashSales },
    { sign: "+", label: "Entradas", value: summary.cashIn },
    { sign: "−", label: "Salidas", value: summary.cashOut },
  ];
  return (
    <dl className={cn("text-sm", className)}>
      {rows.map((r) => (
        <div key={r.label} className="flex items-baseline justify-between gap-3 py-1.5">
          <dt className="flex items-baseline gap-2 text-muted-foreground">
            <span className="w-3 text-center font-medium text-foreground/70">{r.sign}</span>
            {r.label}
          </dt>
          <dd className="tabular">{formatMoney(r.value)}</dd>
        </div>
      ))}
      <div className="mt-1 flex items-baseline justify-between gap-3 border-t pt-2 font-semibold">
        <dt className="flex items-baseline gap-2">
          <span className="w-3 text-center">=</span>
          Esperado en gaveta
        </dt>
        <dd className="tabular text-base">{formatMoney(summary.expectedCash)}</dd>
      </div>
    </dl>
  );
}

/** Imprime un corte X/Z mostrando el error como toast. */
export async function printReport(input: RegisterReportInput): Promise<boolean> {
  try {
    await printRegisterReport(input);
    toast.success(input.kind === "X" ? "Corte X enviado a impresión" : "Corte Z enviado a impresión");
    return true;
  } catch (e) {
    toast.error("No se pudo imprimir", { description: errorMessage(e) });
    return false;
  }
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Ocurrió un error inesperado.";
}

let profilesPromise: Promise<Map<string, string>> | null = null;

/** Mapa id → nombre de los perfiles (cacheado). Si falla, usa solo el usuario actual. */
export function useProfileNames(): (id: string | null | undefined) => string {
  const user = useSession((s) => s.user);
  const [names, setNames] = React.useState<Map<string, string>>(() => new Map());
  React.useEffect(() => {
    let alive = true;
    profilesPromise ??= repo()
      .listProfiles()
      .then((ps) => new Map(ps.map((p) => [p.id, p.fullName])))
      .catch(() => {
        profilesPromise = null;
        return new Map<string, string>();
      });
    void profilesPromise.then((m) => {
      if (alive) setNames(m);
    });
    return () => {
      alive = false;
    };
  }, []);
  return React.useCallback(
    (id) => {
      if (!id) return "—";
      return names.get(id) ?? (user?.id === id ? user.fullName : "—");
    },
    [names, user],
  );
}

const TICK_MS = 30_000;
function subscribeTick(cb: () => void) {
  const t = setInterval(cb, TICK_MS);
  return () => clearInterval(t);
}
const tickSnapshot = () => Math.floor(Date.now() / TICK_MS) * TICK_MS;
const tickServer = () => 0;

/** Hora actual, actualizada cada 30 s. 0 en el servidor. */
export function useNow(): number {
  return React.useSyncExternalStore(subscribeTick, tickSnapshot, tickServer);
}

export function formatElapsed(fromIso: string, now: number): string {
  if (!now) return "";
  const mins = Math.max(0, Math.floor((now - new Date(fromIso).getTime()) / 60_000));
  if (mins < 1) return "recién abierta";
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h >= 24) return `${Math.floor(h / 24)} d ${h % 24} h`;
  return `${h} h ${m.toString().padStart(2, "0")} min`;
}

export function denominationLabel(d: Cents): string {
  return d >= 100 ? `$${d / 100}` : `${d}¢`;
}

export function Stat({
  label,
  value,
  hint,
  className,
  valueClassName,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  className?: string;
  valueClassName?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1 rounded-xl border bg-card p-4", className)}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className={cn("tabular text-xl font-semibold tracking-tight", valueClassName)}>{value}</span>
      {hint != null && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}
