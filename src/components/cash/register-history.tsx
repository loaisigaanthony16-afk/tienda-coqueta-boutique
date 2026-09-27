"use client";
import * as React from "react";
import { ChevronDown, Printer } from "lucide-react";
import { summarizeRegister, type RegisterSummary } from "@/domain/cash";
import { formatMoney } from "@/domain/money";
import type { CashMovement, CashRegister } from "@/domain/types";
import { repo } from "@/data";
import { dayRange, formatDate, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CashLedger, DifferenceBadge, errorMessage, printReport, Stat, useProfileNames } from "./shared";

const DAYS = 30;

/** Historial de cajas de los últimos 30 días, con arqueo bajo demanda. */
export function RegisterHistory({ reloadKey }: { reloadKey: string }) {
  const nameOf = useProfileNames();
  const [rows, setRows] = React.useState<CashRegister[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [expanded, setExpanded] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    const start = new Date();
    start.setDate(start.getDate() - (DAYS - 1));
    repo()
      .listRegisters(dayRange(start, DAYS))
      .then((rs) => {
        if (!alive) return;
        setRows(rs);
        setError(null);
      })
      .catch((e) => {
        if (alive) setError(errorMessage(e));
      });
    return () => {
      alive = false;
    };
  }, [reloadKey]);

  if (error) return <p className="p-6 text-center text-sm text-destructive">{error}</p>;
  if (!rows) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    );
  }

  const closed = rows.filter((r) => r.status === "closed");
  const netDiff = closed.reduce((a, r) => a + (r.difference ?? 0), 0);
  const shortages = closed.filter((r) => (r.difference ?? 0) < 0).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Cajas (30 días)" value={rows.length} hint={`${closed.length} cerradas`} />
        <Stat label="Efectivo contado" value={formatMoney(closed.reduce((a, r) => a + (r.countedAmount ?? 0), 0))} />
        <Stat
          label="Diferencia neta"
          value={(netDiff > 0 ? "+" : "") + formatMoney(netDiff)}
          valueClassName={netDiff < 0 ? "text-destructive" : netDiff > 0 ? "text-warning" : "text-success"}
        />
        <Stat label="Cierres con faltante" value={shortages} valueClassName={shortages ? "text-destructive" : undefined} />
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          No hay cajas en los últimos {DAYS} días.
        </p>
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {rows.map((r) => {
            const open = expanded === r.id;
            return (
              <li key={r.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-muted/50"
                  aria-expanded={open}
                  onClick={() => setExpanded(open ? null : r.id)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">
                      {formatDate(r.openedAt)}
                      <span className="ml-2 font-normal text-muted-foreground">
                        {formatTime(r.openedAt)}
                        {r.closedAt ? `–${formatTime(r.closedAt)}` : ""}
                      </span>
                    </div>
                    <div className="truncate text-xs text-muted-foreground">{nameOf(r.closedBy ?? r.openedBy)}</div>
                  </div>
                  <div className="hidden text-right sm:block">
                    <div className="text-xs text-muted-foreground">Esperado / Contado</div>
                    <div className="tabular">
                      {r.status === "closed"
                        ? `${formatMoney(r.expectedAmount ?? 0)} / ${formatMoney(r.countedAmount ?? 0)}`
                        : "—"}
                    </div>
                  </div>
                  {r.status === "open" ? <Badge variant="brand">Abierta</Badge> : <DifferenceBadge difference={r.difference} />}
                  <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
                </button>
                {open && <RegisterDetail register={r} cashierName={nameOf(r.openedBy)} />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function RegisterDetail({ register, cashierName }: { register: CashRegister; cashierName: string }) {
  const [data, setData] = React.useState<{ summary: RegisterSummary; movements: CashMovement[] } | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    const r = repo();
    Promise.all([r.listSales({ registerId: register.id }), r.listCashMovements(register.id)])
      .then(([sales, movements]) => {
        if (alive) setData({ summary: summarizeRegister(register.openingAmount, sales, movements), movements });
      })
      .catch((e) => {
        if (alive) setError(errorMessage(e));
      });
    return () => {
      alive = false;
    };
  }, [register.id, register.openingAmount]);

  if (error) return <p className="px-4 pb-4 text-sm text-destructive">{error}</p>;
  if (!data) return <Skeleton className="mx-4 mb-4 h-32" />;
  const { summary, movements } = data;

  return (
    <div className="grid gap-4 bg-muted/30 px-4 pt-2 pb-4 text-sm md:grid-cols-2">
      <div className="rounded-lg border bg-card px-4 py-2">
        <CashLedger summary={summary} />
        {register.status === "closed" && (
          <dl className="mt-2 grid gap-1 border-t pt-2">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Contado</dt>
              <dd className="tabular">{formatMoney(register.countedAmount ?? 0)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Diferencia</dt>
              <dd>
                <DifferenceBadge difference={register.difference} />
              </dd>
            </div>
          </dl>
        )}
      </div>
      <div className="flex flex-col gap-3">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg border bg-card p-4">
          <dt className="text-muted-foreground">Ventas</dt>
          <dd className="text-right tabular">
            {summary.salesCount} · {formatMoney(summary.grossSales)}
          </dd>
          <dt className="text-muted-foreground">Efectivo</dt>
          <dd className="text-right tabular">{formatMoney(summary.byMethod.cash)}</dd>
          <dt className="text-muted-foreground">Tarjeta</dt>
          <dd className="text-right tabular">{formatMoney(summary.byMethod.card)}</dd>
          <dt className="text-muted-foreground">Transferencia</dt>
          <dd className="text-right tabular">{formatMoney(summary.byMethod.transfer)}</dd>
          <dt className="text-muted-foreground">Descuentos</dt>
          <dd className="text-right tabular">{formatMoney(summary.discountTotal)}</dd>
          <dt className="text-muted-foreground">Anuladas</dt>
          <dd className="text-right tabular">{summary.voidedCount}</dd>
        </dl>
        {movements.length > 0 && (
          <ul className="rounded-lg border bg-card p-3 text-xs">
            {movements.map((m) => (
              <li key={m.id} className="flex justify-between gap-3 py-0.5">
                <span className="truncate">
                  {formatTime(m.createdAt)} · {m.reason}
                </span>
                <span className={cn("tabular", m.type === "in" ? "text-success" : "text-destructive")}>
                  {m.type === "in" ? "+" : "−"}
                  {formatMoney(m.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
        {register.notes && <p className="rounded-lg border bg-card p-3 text-xs">{register.notes}</p>}
        <Button
          variant="outline"
          className="self-start"
          onClick={() =>
            void printReport({ kind: register.status === "closed" ? "Z" : "X", register, summary, cashierName })
          }
        >
          <Printer /> {register.status === "closed" ? "Reimprimir corte Z" : "Imprimir corte X"}
        </Button>
      </div>
    </div>
  );
}
