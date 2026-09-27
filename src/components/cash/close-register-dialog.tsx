"use client";
import * as React from "react";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, Check, CheckCircle2, Loader2, Minus, Plus, Printer } from "lucide-react";
import {
  classifyDifference, COUNT_DENOMINATIONS, sumCount, type RegisterSummary,
} from "@/domain/cash";
import { formatMoney } from "@/domain/money";
import type { CashRegister, Cents } from "@/domain/types";
import { repo } from "@/data";
import { useCart } from "@/stores/cart";
import { useRegister } from "@/stores/register";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  CashLedger, denominationLabel, differenceMessage, errorMessage, LEVEL_TEXT, printReport,
} from "./shared";

export interface CloseSnapshot {
  register: CashRegister;
  summary: RegisterSummary;
  cashierName: string;
}

type Step = "count" | "review" | "done";
type Mode = "denoms" | "total";

const STEPS: { id: Step; label: string }[] = [
  { id: "count", label: "Conteo" },
  { id: "review", label: "Revisión" },
  { id: "done", label: "Cierre Z" },
];

/**
 * Cierre Z en tres pasos. Recibe una foto de la caja y su arqueo tomada al
 * abrir el diálogo, para que siga visible aunque el store pase a "cerrada".
 */
export function CloseRegisterDialog({ snapshot, onClose }: { snapshot: CloseSnapshot; onClose: () => void }) {
  const { register, summary, cashierName } = snapshot;
  const refresh = useRegister((s) => s.refresh);
  const cartCount = useCart((s) => s.lines.length);

  const [step, setStep] = React.useState<Step>("count");
  const [mode, setMode] = React.useState<Mode>("denoms");
  const [counts, setCounts] = React.useState<Record<number, number>>({});
  const [total, setTotal] = React.useState<Cents | null>(null);
  const [notes, setNotes] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<CashRegister | null>(null);

  const counted: Cents | null = mode === "denoms" ? sumCount(counts) : total;
  const difference = (counted ?? 0) - summary.expectedCash;
  const level = classifyDifference(difference);
  const notesRequired = level === "major";
  const canConfirm = counted != null && (!notesRequired || notes.trim().length >= 3);

  const setCount = (d: Cents, n: number) =>
    setCounts((c) => ({ ...c, [d]: Math.max(0, Math.min(9999, Math.trunc(n) || 0)) }));

  const confirm = async () => {
    if (counted == null || !canConfirm || busy) return;
    setBusy(true);
    try {
      const closed = await repo().closeRegister({
        registerId: register.id,
        countedAmount: counted,
        notes: notes.trim() || null,
      });
      setResult(closed);
      setStep("done");
      toast.success("Caja cerrada");
    } catch (err) {
      toast.error("No se pudo cerrar la caja", { description: errorMessage(err) });
    } finally {
      await refresh().catch(() => undefined);
      setBusy(false);
    }
  };

  const stepIndex = STEPS.findIndex((s) => s.id === step);

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o && !busy) onClose();
      }}
    >
      <DialogContent
        className="max-w-2xl gap-5"
        showCloseButton={!busy}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Cierre de caja (Z)</DialogTitle>
          <DialogDescription>Abierta el {formatDateTime(register.openedAt)} por {cashierName}</DialogDescription>
          <ol className="mt-2 flex items-center gap-2 text-xs">
            {STEPS.map((s, i) => (
              <li key={s.id} className="flex items-center gap-2">
                <span
                  className={cn(
                    "grid size-6 place-items-center rounded-full border text-[11px] font-semibold",
                    i < stepIndex && "border-success bg-success text-white",
                    i === stepIndex && "border-primary bg-primary text-primary-foreground",
                    i > stepIndex && "text-muted-foreground",
                  )}
                >
                  {i < stepIndex ? <Check className="size-3.5" /> : i + 1}
                </span>
                <span className={cn(i === stepIndex ? "font-medium" : "text-muted-foreground")}>{s.label}</span>
                {i < STEPS.length - 1 && <span className="h-px w-6 bg-border" />}
              </li>
            ))}
          </ol>
        </DialogHeader>

        {cartCount > 0 && step !== "done" && (
          <div className="flex gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
            <p>
              Hay {cartCount} {cartCount === 1 ? "artículo" : "artículos"} en el carrito de Vender sin cobrar. Si cierras
              la caja no podrás cobrarlos hasta abrir una nueva.
            </p>
          </div>
        )}

        {step === "count" && (
          <>
            <ToggleGroup
              type="single"
              value={mode}
              onValueChange={(v) => v && setMode(v as Mode)}
              className="grid grid-cols-2"
            >
              <ToggleGroupItem value="denoms" className="h-11">
                Por billetes y monedas
              </ToggleGroupItem>
              <ToggleGroupItem value="total" className="h-11">
                Monto total
              </ToggleGroupItem>
            </ToggleGroup>

            {mode === "denoms" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <DenominationGroup
                  title="Billetes"
                  denoms={COUNT_DENOMINATIONS.filter((d) => d >= 100)}
                  counts={counts}
                  onChange={setCount}
                />
                <DenominationGroup
                  title="Monedas"
                  denoms={COUNT_DENOMINATIONS.filter((d) => d < 100)}
                  counts={counts}
                  onChange={setCount}
                />
              </div>
            ) : (
              <div className="grid gap-2">
                <Label htmlFor="counted-total">Efectivo contado en gaveta</Label>
                <MoneyInput
                  id="counted-total"
                  autoFocus
                  placeholder="0.00"
                  value={total}
                  onValueChange={setTotal}
                  className="h-16 text-3xl font-semibold"
                />
              </div>
            )}

            <div className="sticky bottom-0 -mx-6 -mb-6 flex items-center gap-3 border-t bg-background/95 px-6 py-4 backdrop-blur">
              <div className="flex-1">
                <div className="text-xs text-muted-foreground">Total contado</div>
                <div className="tabular text-2xl font-semibold">{formatMoney(counted ?? 0)}</div>
              </div>
              {mode === "denoms" && Object.values(counts).some((n) => n > 0) && (
                <Button variant="ghost" onClick={() => setCounts({})}>
                  Limpiar
                </Button>
              )}
              <Button size="lg" disabled={counted == null} onClick={() => setStep("review")}>
                Revisar
              </Button>
            </div>
          </>
        )}

        {step === "review" && (
          <>
            <div className="grid grid-cols-3 gap-2 text-center">
              <ReviewTile label="Esperado" value={formatMoney(summary.expectedCash)} />
              <ReviewTile label="Contado" value={formatMoney(counted ?? 0)} />
              <ReviewTile
                label="Diferencia"
                value={(difference > 0 ? "+" : "") + formatMoney(difference)}
                className={LEVEL_TEXT[level]}
              />
            </div>
            <div
              className={cn(
                "rounded-xl p-4 text-center",
                level === "ok" && "bg-success/10",
                level === "minor" && "bg-warning/12",
                level === "major" && "bg-destructive/10",
              )}
            >
              <div className={cn("text-2xl font-semibold", LEVEL_TEXT[level])}>{differenceMessage(difference)}</div>
              <p className="mt-1 text-sm text-muted-foreground">
                {level === "ok"
                  ? "El efectivo contado coincide con el sistema."
                  : level === "minor"
                    ? "Diferencia menor. Puedes cerrar; agrega una nota si sabes la causa."
                    : "Diferencia importante. Vuelve a contar y explica la causa antes de cerrar."}
              </p>
            </div>

            <details className="rounded-lg border px-4 py-2 text-sm">
              <summary className="cursor-pointer py-1 font-medium">Cómo se calcula el esperado</summary>
              <CashLedger summary={summary} className="pt-2 pb-1" />
            </details>

            <div className="grid gap-2">
              <Label htmlFor="close-notes">
                Notas {notesRequired ? <span className="text-destructive">(obligatorio)</span> : <span className="font-normal text-muted-foreground">(opcional)</span>}
              </Label>
              <Textarea
                id="close-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={notesRequired ? "Explica la diferencia (p. ej. vuelto mal dado, pago no registrado…)" : "Observaciones del turno"}
                maxLength={500}
                aria-invalid={notesRequired && notes.trim().length < 3}
              />
            </div>

            <DialogFooter>
              <Button variant="outline" size="lg" onClick={() => setStep("count")} disabled={busy}>
                <ArrowLeft /> Volver a contar
              </Button>
              <Button size="lg" variant="destructive" disabled={!canConfirm || busy} onClick={confirm}>
                {busy && <Loader2 className="animate-spin" />}
                Cerrar caja
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "done" && result && (
          <>
            <div className="flex flex-col items-center gap-2 py-2 text-center">
              <CheckCircle2 className="size-10 text-success" />
              <div className="text-lg font-semibold">Caja cerrada</div>
              {result.closedAt && (
                <div className="text-sm text-muted-foreground">{formatDateTime(result.closedAt)}</div>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <ReviewTile label="Esperado" value={formatMoney(result.expectedAmount ?? summary.expectedCash)} />
              <ReviewTile label="Contado" value={formatMoney(result.countedAmount ?? counted ?? 0)} />
              <ReviewTile
                label="Diferencia"
                value={differenceMessage(result.difference ?? difference)}
                className={LEVEL_TEXT[classifyDifference(result.difference ?? difference)]}
              />
            </div>
            <div className="grid gap-x-6 gap-y-1 rounded-lg border p-4 text-sm sm:grid-cols-2">
              <CashLedger summary={summary} />
              <dl className="grid content-start gap-1.5 border-t pt-3 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-6">
                <Row label="Ventas" value={`${summary.salesCount} · ${formatMoney(summary.grossSales)}`} />
                <Row label="Efectivo" value={formatMoney(summary.byMethod.cash)} />
                <Row label="Tarjeta" value={formatMoney(summary.byMethod.card)} />
                <Row label="Transferencia" value={formatMoney(summary.byMethod.transfer)} />
                <Row label="Descuentos" value={formatMoney(summary.discountTotal)} />
                {summary.voidedCount > 0 && <Row label="Anuladas" value={String(summary.voidedCount)} />}
              </dl>
            </div>
            {result.notes && <p className="rounded-lg bg-muted p-3 text-sm">{result.notes}</p>}
            <DialogFooter>
              <Button
                variant="outline"
                size="lg"
                onClick={() => void printReport({ kind: "Z", register: result, summary, cashierName })}
              >
                <Printer /> Imprimir corte Z
              </Button>
              <Button size="lg" onClick={onClose}>
                Listo
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DenominationGroup({
  title,
  denoms,
  counts,
  onChange,
}: {
  title: string;
  denoms: Cents[];
  counts: Record<number, number>;
  onChange: (d: Cents, n: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</div>
      {denoms.map((d) => {
        const n = counts[d] ?? 0;
        return (
          <div key={d} className="flex items-center gap-2">
            <span className="w-12 text-right text-sm font-semibold tabular">{denominationLabel(d)}</span>
            <Button
              type="button"
              variant="outline"
              size="icon-lg"
              aria-label={`Quitar ${denominationLabel(d)}`}
              disabled={n === 0}
              onClick={() => onChange(d, n - 1)}
            >
              <Minus />
            </Button>
            <Input
              inputMode="numeric"
              aria-label={`Cantidad de ${denominationLabel(d)}`}
              className="h-11 w-16 text-center text-base tabular"
              value={n === 0 ? "" : String(n)}
              placeholder="0"
              onFocus={(e) => e.target.select()}
              onChange={(e) => onChange(d, Number(e.target.value.replace(/\D/g, "")))}
            />
            <Button
              type="button"
              variant="outline"
              size="icon-lg"
              aria-label={`Agregar ${denominationLabel(d)}`}
              onClick={() => onChange(d, n + 1)}
            >
              <Plus />
            </Button>
            <span className={cn("ml-auto text-right text-sm tabular", n === 0 && "text-muted-foreground/60")}>
              {formatMoney(d * n)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ReviewTile({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="rounded-xl border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("tabular mt-1 text-lg font-semibold sm:text-xl", className)}>{value}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular">{value}</dd>
    </div>
  );
}
