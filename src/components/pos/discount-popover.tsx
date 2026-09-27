"use client";
import * as React from "react";
import { formatMoney } from "@/domain/money";
import { resolveDiscount } from "@/domain/pricing";
import type { Cents, Discount } from "@/domain/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export function describeDiscount(d: Discount | null): string {
  if (!d) return "";
  return d.kind === "percent" ? `${(d.bps / 100).toLocaleString("es-NI", { maximumFractionDigits: 2 })}%` : formatMoney(d.cents);
}

/**
 * Popover para fijar un descuento en porcentaje o monto fijo.
 * `base` es el monto sobre el que se aplica (solo para la vista previa).
 */
export function DiscountPopover({
  value,
  onChange,
  base,
  title,
  children,
  align = "end",
}: {
  value: Discount | null;
  onChange: (d: Discount | null) => void;
  base: Cents;
  title: string;
  children: React.ReactNode;
  align?: "start" | "center" | "end";
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align={align} className="w-72">
        {open && (
          <DiscountForm
            initial={value}
            base={base}
            title={title}
            onApply={(d) => {
              onChange(d);
              setOpen(false);
            }}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}

function DiscountForm({
  initial,
  base,
  title,
  onApply,
}: {
  initial: Discount | null;
  base: Cents;
  title: string;
  onApply: (d: Discount | null) => void;
}) {
  const [kind, setKind] = React.useState<Discount["kind"]>(initial?.kind ?? "percent");
  const [percent, setPercent] = React.useState(initial?.kind === "percent" ? String(initial.bps / 100) : "");
  const [amount, setAmount] = React.useState<Cents | null>(initial?.kind === "amount" ? initial.cents : null);
  const id = React.useId();

  const draft: Discount | null = React.useMemo(() => {
    if (kind === "percent") {
      const n = Number(percent.replace(",", "."));
      if (!percent.trim() || !Number.isFinite(n) || n <= 0) return null;
      return { kind: "percent", bps: Math.min(10000, Math.round(n * 100)) };
    }
    return amount && amount > 0 ? { kind: "amount", cents: amount } : null;
  }, [kind, percent, amount]);

  const preview = resolveDiscount(base, draft);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onApply(draft);
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <p className="text-sm font-medium">{title}</p>
      <ToggleGroup
        type="single"
        value={kind}
        onValueChange={(v) => v && setKind(v as Discount["kind"])}
        className="grid grid-cols-2"
        aria-label="Tipo de descuento"
      >
        <ToggleGroupItem value="percent">Porcentaje</ToggleGroupItem>
        <ToggleGroupItem value="amount">Monto</ToggleGroupItem>
      </ToggleGroup>
      {kind === "percent" ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-pct`}>Porcentaje</Label>
          <div className="relative">
            <Input
              id={`${id}-pct`}
              autoFocus
              inputMode="decimal"
              autoComplete="off"
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
              onFocus={(e) => e.target.select()}
              className="h-11 pr-8 text-lg tabular"
              placeholder="0"
            />
            <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground">%</span>
          </div>
          <div className="flex gap-1.5">
            {[5, 10, 15, 20, 50].map((p) => (
              <Button key={p} type="button" variant="outline" size="sm" className="flex-1" onClick={() => setPercent(String(p))}>
                {p}%
              </Button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-amt`}>Monto</Label>
          <MoneyInput id={`${id}-amt`} autoFocus value={amount} onValueChange={setAmount} className="h-11 text-lg" />
        </div>
      )}
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {preview > 0 ? `Descuento: −${formatMoney(preview)}` : "Sin descuento"}
      </p>
      <div className="flex gap-2">
        {initial && (
          <Button type="button" variant="ghost" className="flex-1" onClick={() => onApply(null)}>
            Quitar
          </Button>
        )}
        <Button type="submit" className="flex-1">
          Aplicar
        </Button>
      </div>
    </form>
  );
}
