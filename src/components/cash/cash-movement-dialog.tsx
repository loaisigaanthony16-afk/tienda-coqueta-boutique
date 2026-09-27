"use client";
import * as React from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { formatMoney } from "@/domain/money";
import type { CashMovementType, Cents } from "@/domain/types";
import { repo } from "@/data";
import { useRegister } from "@/stores/register";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import { errorMessage } from "./shared";

const QUICK_REASONS: Record<CashMovementType, string[]> = {
  in: ["Fondo de cambio", "Aporte de caja", "Otro"],
  out: ["Compra de bolsas", "Pago a proveedor", "Limpieza", "Transporte", "Otro"],
};

export function CashMovementDialog({
  type,
  onOpenChange,
}: {
  /** null = cerrado. */
  type: CashMovementType | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={type != null} onOpenChange={onOpenChange}>
      <DialogContent>{type && <MovementForm key={type} type={type} onDone={() => onOpenChange(false)} />}</DialogContent>
    </Dialog>
  );
}

function MovementForm({ type, onDone }: { type: CashMovementType; onDone: () => void }) {
  const register = useRegister((s) => s.register);
  const summary = useRegister((s) => s.summary);
  const refresh = useRegister((s) => s.refresh);
  const [amount, setAmount] = React.useState<Cents | null>(null);
  const [quick, setQuick] = React.useState<string | null>(null);
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const reasonRef = React.useRef<HTMLInputElement>(null);

  const isOut = type === "out";
  const finalReason = (quick && quick !== "Otro" ? quick + (reason.trim() ? ` — ${reason.trim()}` : "") : reason.trim());
  const available = summary?.expectedCash ?? 0;
  const exceeds = isOut && amount != null && amount > available;
  const valid = amount != null && amount > 0 && finalReason.length > 0 && !exceeds;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!register || !valid || busy) return;
    setBusy(true);
    try {
      await repo().addCashMovement({ registerId: register.id, type, amount, reason: finalReason });
      toast.success(`${isOut ? "Salida" : "Entrada"} de ${formatMoney(amount)} registrada`);
      await refresh();
      onDone();
    } catch (err) {
      toast.error("No se pudo registrar el movimiento", { description: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-5">
      <DialogHeader>
        <DialogTitle>{isOut ? "Salida / Pago" : "Entrada de efectivo"}</DialogTitle>
        <DialogDescription>
          {isOut
            ? "Efectivo que sale de la gaveta: compras, pagos o gastos menores."
            : "Efectivo que se agrega a la gaveta fuera de una venta."}
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-2">
        <Label htmlFor="mv-amount">Monto</Label>
        <MoneyInput
          id="mv-amount"
          autoFocus
          placeholder="0.00"
          value={amount}
          onValueChange={setAmount}
          className="h-14 text-2xl font-semibold"
        />
        {isOut && (
          <p className={cn("text-xs", exceeds ? "text-destructive" : "text-muted-foreground")}>
            {exceeds ? "Supera el efectivo disponible: " : "Disponible en gaveta: "}
            <span className="tabular">{formatMoney(available)}</span>
          </p>
        )}
      </div>

      <div className="grid gap-2">
        <Label>Motivo</Label>
        <div className="flex flex-wrap gap-2">
          {QUICK_REASONS[type].map((r) => (
            <Button
              key={r}
              type="button"
              variant="outline"
              className={cn("h-10", quick === r && "border-primary bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground")}
              onClick={() => {
                setQuick(quick === r ? null : r);
                if (r === "Otro") requestAnimationFrame(() => reasonRef.current?.focus());
              }}
            >
              {r}
            </Button>
          ))}
        </div>
        <Input
          ref={reasonRef}
          className="h-11"
          placeholder={quick && quick !== "Otro" ? "Detalle (opcional)" : "Describe el motivo"}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={140}
        />
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" size="lg" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" size="lg" variant={isOut ? "destructive" : "default"} disabled={!valid || busy}>
          {busy && <Loader2 className="animate-spin" />}
          Registrar {isOut ? "salida" : "entrada"}
          {amount ? ` · ${formatMoney(amount)}` : ""}
        </Button>
      </DialogFooter>
    </form>
  );
}
