"use client";
import * as React from "react";
import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, Clock, Loader2, Lock, Printer } from "lucide-react";
import { formatMoney } from "@/domain/money";
import { PAYMENT_LABEL } from "@/domain/payment";
import type { CashMovementType } from "@/domain/types";
import { useRegister } from "@/stores/register";
import { formatDateTime, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CashMovementDialog } from "./cash-movement-dialog";
import { CashLedger, formatElapsed, printReport, Stat, useNow } from "./shared";

/** Estado "caja abierta": arqueo en vivo. */
export function RegisterDashboard({
  cashierName,
  onRequestClose,
  closing,
}: {
  cashierName: string;
  onRequestClose: () => void;
  closing: boolean;
}) {
  const register = useRegister((s) => s.register);
  const summary = useRegister((s) => s.summary);
  const sales = useRegister((s) => s.sales);
  const movements = useRegister((s) => s.movements);
  const refresh = useRegister((s) => s.refresh);
  const now = useNow();
  const [movement, setMovement] = React.useState<CashMovementType | null>(null);
  const [printing, setPrinting] = React.useState(false);

  const recentSales = React.useMemo(
    () => [...sales].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 12),
    [sales],
  );
  const sortedMovements = React.useMemo(
    () => [...movements].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [movements],
  );

  if (!register || !summary) return null;

  const corteX = async () => {
    setPrinting(true);
    try {
      await refresh().catch(() => undefined);
      const s = useRegister.getState();
      if (s.register && s.summary) {
        await printReport({ kind: "X", register: s.register, summary: s.summary, cashierName });
      }
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Encabezado */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="size-2.5 rounded-full bg-success" />
            <h2 className="text-lg font-semibold">Caja abierta</h2>
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
            <span>
              {formatDateTime(register.openedAt)} · {cashierName}
            </span>
            {now > 0 && (
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3.5" /> {formatElapsed(register.openedAt, now)}
              </span>
            )}
          </p>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
          <Button variant="outline" size="lg" onClick={() => setMovement("in")}>
            <ArrowDownLeft className="text-success" /> Entrada
          </Button>
          <Button variant="outline" size="lg" onClick={() => setMovement("out")}>
            <ArrowUpRight className="text-destructive" /> Salida / Pago
          </Button>
          <Button variant="outline" size="lg" onClick={corteX} disabled={printing}>
            {printing ? <Loader2 className="animate-spin" /> : <Printer />} Corte X
          </Button>
          <Button size="lg" onClick={onRequestClose} disabled={closing}>
            {closing ? <Loader2 className="animate-spin" /> : <Lock />} Cerrar caja
          </Button>
        </div>
      </div>

      {/* Esperado + ledger */}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="flex flex-col justify-center gap-1 rounded-xl border bg-card p-5">
          <span className="text-sm font-medium text-muted-foreground">Efectivo esperado en gaveta</span>
          <span className="tabular text-4xl font-bold tracking-tight sm:text-5xl">
            {formatMoney(summary.expectedCash)}
          </span>
          <span className="text-xs text-muted-foreground">Se actualiza con cada venta y movimiento.</span>
        </div>
        <div className="rounded-xl border bg-card px-5 py-3">
          <CashLedger summary={summary} />
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <Stat
          label="Ventas"
          value={formatMoney(summary.grossSales)}
          hint={
            <>
              {summary.salesCount} {summary.salesCount === 1 ? "venta" : "ventas"}
              {summary.voidedCount > 0 && ` · ${summary.voidedCount} anuladas`}
            </>
          }
        />
        <Stat label="Tarjeta" value={formatMoney(summary.byMethod.card)} />
        <Stat label="Transferencia" value={formatMoney(summary.byMethod.transfer)} />
        <Stat label="Entradas" value={formatMoney(summary.cashIn)} valueClassName="text-success" />
        <Stat label="Salidas" value={formatMoney(summary.cashOut)} valueClassName={summary.cashOut ? "text-destructive" : undefined} />
        <Stat label="Descuentos" value={formatMoney(summary.discountTotal)} />
      </div>

      {/* Movimientos y ventas */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="gap-2 py-4">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-sm">Movimientos de efectivo</CardTitle>
            <span className="text-xs text-muted-foreground">{sortedMovements.length}</span>
          </CardHeader>
          <CardContent className="px-0">
            {sortedMovements.length === 0 ? (
              <p className="px-5 py-6 text-center text-sm text-muted-foreground">Sin entradas ni salidas.</p>
            ) : (
              <ul className="divide-y">
                {sortedMovements.map((m) => (
                  <li key={m.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                    <span
                      className={cn(
                        "grid size-8 shrink-0 place-items-center rounded-full",
                        m.type === "in" ? "bg-success/12 text-success" : "bg-destructive/10 text-destructive",
                      )}
                    >
                      {m.type === "in" ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{m.reason}</div>
                      <div className="text-xs text-muted-foreground">{formatTime(m.createdAt)}</div>
                    </div>
                    <span className={cn("tabular font-medium", m.type === "in" ? "text-success" : "text-destructive")}>
                      {m.type === "in" ? "+" : "−"}
                      {formatMoney(m.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="gap-2 py-4">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-sm">Ventas de esta caja</CardTitle>
            <Link href="/ventas" className="text-xs text-muted-foreground hover:text-foreground hover:underline">
              Ver todas
            </Link>
          </CardHeader>
          <CardContent className="px-0">
            {recentSales.length === 0 ? (
              <p className="px-5 py-6 text-center text-sm text-muted-foreground">Todavía no hay ventas.</p>
            ) : (
              <ul className="divide-y">
                {recentSales.map((s) => {
                  const methods = [...new Set(s.payments.map((p) => PAYMENT_LABEL[p.method]))].join(" + ");
                  const voided = s.status === "voided";
                  return (
                    <li key={s.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium tabular">#{s.number}</span>
                          <span className="text-xs text-muted-foreground">{formatTime(s.createdAt)}</span>
                          {voided && <Badge variant="destructive">Anulada</Badge>}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">{methods || "—"}</div>
                      </div>
                      <span className={cn("tabular font-medium", voided && "text-muted-foreground line-through")}>
                        {formatMoney(s.total)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <CashMovementDialog type={movement} onOpenChange={(o) => !o && setMovement(null)} />
    </div>
  );
}
