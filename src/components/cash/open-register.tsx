"use client";
import * as React from "react";
import { toast } from "sonner";
import { Loader2, LockOpen, Wallet } from "lucide-react";
import { formatMoney } from "@/domain/money";
import type { CashRegister, Cents } from "@/domain/types";
import { repo, RepositoryError } from "@/data";
import { useRegister } from "@/stores/register";
import { formatDate, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import { Skeleton } from "@/components/ui/skeleton";
import { DifferenceBadge, errorMessage, useProfileNames } from "./shared";

const QUICK_FLOATS: Cents[] = [0, 2000, 5000, 10000];

/** Estado "caja cerrada": apertura obligatoria + últimos cierres. */
export function OpenRegisterView() {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <OpenRegisterCard />
      <RecentClosures />
    </div>
  );
}

function OpenRegisterCard() {
  const refresh = useRegister((s) => s.refresh);
  const [amount, setAmount] = React.useState<Cents | null>(null);
  const [busy, setBusy] = React.useState(false);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (amount == null || busy) return;
    setBusy(true);
    try {
      await repo().openRegister(amount);
      toast.success(`Caja abierta con ${formatMoney(amount)}`);
    } catch (err) {
      if (err instanceof RepositoryError && err.code === "register_open") {
        toast.info("Ya hay una caja abierta.");
      } else {
        toast.error("No se pudo abrir la caja", { description: errorMessage(err) });
      }
    } finally {
      await refresh().catch(() => undefined);
      setBusy(false);
    }
  };

  return (
    <Card className="gap-5 py-6 shadow-sm">
      <CardHeader className="items-center text-center">
        <div className="mb-2 grid size-12 place-items-center rounded-full bg-brand/12 text-brand">
          <Wallet className="size-6" />
        </div>
        <CardTitle className="text-xl">Abrir caja</CardTitle>
        <CardDescription>Cuenta el efectivo de la gaveta e ingresa el fondo inicial para empezar a vender.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="opening-amount">Fondo inicial</Label>
            <MoneyInput
              id="opening-amount"
              autoFocus
              placeholder="0.00"
              value={amount}
              onValueChange={setAmount}
              className="h-14 text-2xl font-semibold"
            />
          </div>
          <div className="grid grid-cols-4 gap-2">
            {QUICK_FLOATS.map((v) => (
              <Button
                key={v}
                type="button"
                variant="outline"
                size="lg"
                className={cn("tabular", amount === v && "border-primary bg-primary/5")}
                onClick={() => setAmount(v)}
              >
                ${v / 100}
              </Button>
            ))}
          </div>
          <Button type="submit" size="xl" variant="brand" disabled={amount == null || busy}>
            {busy ? <Loader2 className="animate-spin" /> : <LockOpen />}
            Abrir caja{amount != null ? ` con ${formatMoney(amount)}` : ""}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function RecentClosures() {
  const nameOf = useProfileNames();
  const [rows, setRows] = React.useState<CashRegister[] | null>(null);

  React.useEffect(() => {
    let alive = true;
    repo()
      .listRegisters()
      .then((rs) => {
        if (alive) setRows(rs.filter((r) => r.status === "closed").slice(0, 7));
      })
      .catch(() => {
        if (alive) setRows([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <section className="flex flex-col gap-2">
      <h2 className="px-1 text-sm font-medium text-muted-foreground">Últimos cierres</h2>
      {rows == null ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          Aún no hay cierres de caja.
        </p>
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-4 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <div className="font-medium">
                  {formatDate(r.closedAt ?? r.openedAt)}
                  <span className="ml-2 font-normal text-muted-foreground">
                    {formatTime(r.openedAt)}–{r.closedAt ? formatTime(r.closedAt) : ""}
                  </span>
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {nameOf(r.closedBy ?? r.openedBy)} · Esperado{" "}
                  <span className="tabular">{formatMoney(r.expectedAmount ?? 0)}</span> · Contado{" "}
                  <span className="tabular">{formatMoney(r.countedAmount ?? 0)}</span>
                </div>
              </div>
              <DifferenceBadge difference={r.difference} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
