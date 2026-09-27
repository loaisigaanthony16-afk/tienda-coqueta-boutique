"use client";
import * as React from "react";
import { toast } from "sonner";
import { Banknote, CheckCircle2, CreditCard, Landmark, Loader2, Plus, Printer, Shuffle, X } from "lucide-react";
import { formatMoney } from "@/domain/money";
import { PAYMENT_LABEL, quickCashOptions, settle, type TenderInput } from "@/domain/payment";
import type { Cents, PaymentMethod, SaleWithItems } from "@/domain/types";
import { repo, RepositoryError } from "@/data";
import { STORE } from "@/lib/config";
import { autoPrintReceipt, printReceipt } from "@/lib/printing";
import { cn, uid } from "@/lib/utils";
import { useCart } from "@/stores/cart";
import { useCatalog } from "@/stores/catalog";
import { useRegister } from "@/stores/register";
import { useSession } from "@/stores/session";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useCartPricing } from "./use-cart-pricing";

type Mode = PaymentMethod | "mixed";

interface MixedRow {
  id: string;
  method: PaymentMethod;
  amount: Cents | null;
  reference: string;
}

const METHOD_ICON: Record<PaymentMethod, React.ComponentType<{ className?: string }>> = {
  cash: Banknote,
  card: CreditCard,
  transfer: Landmark,
};

export function CheckoutDialog({
  open,
  onOpenChange,
  onFinished,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Al cerrar (venta hecha o cancelada): devolver el foco al buscador. */
  onFinished: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && <CheckoutContent onClose={() => onOpenChange(false)} onFinished={onFinished} />}
    </Dialog>
  );
}

function CheckoutContent({ onClose, onFinished }: { onClose: () => void; onFinished: () => void }) {
  const [sale, setSale] = React.useState<SaleWithItems | null>(null);
  const [busy, setBusy] = React.useState(false);

  return (
    <DialogContent
      className="max-w-lg gap-5 sm:p-6"
      showCloseButton={!busy}
      onEscapeKeyDown={(e) => busy && e.preventDefault()}
      onInteractOutside={(e) => (busy || sale) && e.preventDefault()}
      onCloseAutoFocus={(e) => {
        e.preventDefault();
        onFinished();
      }}
    >
      {sale ? (
        <SuccessScreen sale={sale} onNewSale={onClose} />
      ) : (
        <PaymentForm busy={busy} setBusy={setBusy} onSuccess={setSale} />
      )}
    </DialogContent>
  );
}

function PaymentForm({
  busy,
  setBusy,
  onSuccess,
}: {
  busy: boolean;
  setBusy: (b: boolean) => void;
  onSuccess: (s: SaleWithItems) => void;
}) {
  const { pricing } = useCartPricing();
  const total = pricing.total;
  const registerId = useRegister((s) => s.register?.id ?? null);

  const [mode, setMode] = React.useState<Mode>("cash");
  const [received, setReceived] = React.useState<Cents | null>(null);
  const [reference, setReference] = React.useState("");
  const [rows, setRows] = React.useState<MixedRow[]>(() => [
    { id: uid(), method: "card", amount: null, reference: "" },
    { id: uid(), method: "cash", amount: null, reference: "" },
  ]);
  const submitting = React.useRef(false);

  const tenders: TenderInput[] = React.useMemo(() => {
    switch (mode) {
      case "cash":
        return [{ method: "cash", amount: received ?? 0 }];
      case "card":
      case "transfer":
        return [{ method: mode, amount: total, reference: reference.trim() || undefined }];
      case "mixed":
        return rows
          .filter((r) => (r.amount ?? 0) > 0)
          .map((r) => ({ method: r.method, amount: r.amount ?? 0, reference: r.reference.trim() || undefined }));
    }
  }, [mode, received, reference, rows, total]);

  const result = React.useMemo(() => settle(total, tenders), [total, tenders]);
  const canConfirm = result.ok && !busy && registerId !== null && total >= 0 && pricing.itemCount > 0;

  const quick = React.useMemo(
    () => quickCashOptions(total, STORE.cashDenominations).filter((c) => c > total),
    [total],
  );

  async function confirm() {
    if (!canConfirm || submitting.current || !registerId) return;
    submitting.current = true;
    setBusy(true);
    try {
      const { lines, cartDiscount, customerName } = useCart.getState();
      const sale = await repo().createSale({
        registerId,
        items: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity, discount: l.discount })),
        cartDiscount,
        tenders,
        customerName: customerName.trim() || null,
      });

      const sold = new Map<string, number>();
      for (const it of sale.items) sold.set(it.variantId, (sold.get(it.variantId) ?? 0) + it.quantity);
      const { byId, patchStock } = useCatalog.getState();
      patchStock(
        [...sold].map(([variantId, qty]) => ({
          variantId,
          stock: Math.max(0, (byId.get(variantId)?.stock ?? qty) - qty),
        })),
      );
      useCart.getState().clear();
      onSuccess(sale);
      const cashierName = useSession.getState().user?.fullName;
      autoPrintReceipt(sale, { cashierName }).catch((e) =>
        toast.error(e instanceof Error ? e.message : "No se pudo imprimir el ticket"),
      );
      void useRegister
        .getState()
        .refresh()
        .catch((e) => console.error(e));
    } catch (e) {
      console.error(e);
      toast.error(e instanceof RepositoryError ? e.message : "No se pudo registrar la venta. Intenta de nuevo.");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Enter" || e.shiftKey || e.altKey) return;
    const t = e.target as HTMLElement;
    // Los botones manejan su propio Enter (p. ej. billetes rápidos).
    if (t.tagName === "BUTTON" && !(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    void confirm();
  };

  const change = result.ok ? result.change : 0;
  const missing = result.ok ? 0 : result.missing;

  return (
    <form
      className="flex flex-col gap-5"
      onKeyDown={onKeyDown}
      onSubmit={(e) => {
        e.preventDefault();
        void confirm();
      }}
    >
      <DialogHeader>
        <DialogTitle>Cobrar</DialogTitle>
        <DialogDescription>
          {pricing.itemCount} {pricing.itemCount === 1 ? "artículo" : "artículos"}
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col items-center gap-0.5 rounded-xl bg-muted/50 py-4">
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Total a cobrar</span>
        <span className="tabular text-4xl font-bold tracking-tight">{formatMoney(total)}</span>
      </div>

      <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)} className="gap-4">
        <TabsList className="grid h-11 w-full grid-cols-4">
          <TabsTrigger value="cash" className="gap-1.5 text-xs sm:text-sm">
            <Banknote className="hidden sm:block" /> Efectivo
          </TabsTrigger>
          <TabsTrigger value="card" className="gap-1.5 text-xs sm:text-sm">
            <CreditCard className="hidden sm:block" /> Tarjeta
          </TabsTrigger>
          <TabsTrigger value="transfer" className="gap-1.5 text-xs sm:text-sm">
            <Landmark className="hidden sm:block" /> Transf.
          </TabsTrigger>
          <TabsTrigger value="mixed" className="gap-1.5 text-xs sm:text-sm">
            <Shuffle className="hidden sm:block" /> Mixto
          </TabsTrigger>
        </TabsList>

        <TabsContent value="cash" className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pos-received">Recibido</Label>
            <MoneyInput
              id="pos-received"
              autoFocus
              value={received}
              onValueChange={setReceived}
              placeholder={(total / 100).toFixed(2)}
              className="h-14 text-2xl font-semibold"
            />
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            <Button type="button" variant="secondary" size="lg" onClick={() => setReceived(total)}>
              Exacto
            </Button>
            {quick.map((c) => (
              <Button
                key={c}
                type="button"
                variant="outline"
                size="lg"
                className="tabular"
                onClick={() => setReceived(c)}
              >
                {formatMoney(c)}
              </Button>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="card" className="flex flex-col gap-3">
          <ReferenceField
            id="pos-ref-card"
            label="Últimos 4 dígitos (opcional)"
            value={reference}
            onChange={setReference}
            numeric
          />
          <p className="text-sm text-muted-foreground">
            Cobrar <span className="tabular font-medium text-foreground">{formatMoney(total)}</span> con tarjeta.
          </p>
        </TabsContent>

        <TabsContent value="transfer" className="flex flex-col gap-3">
          <ReferenceField
            id="pos-ref-transfer"
            label="N.º de transferencia (opcional)"
            value={reference}
            onChange={setReference}
          />
          <p className="text-sm text-muted-foreground">
            Confirmar transferencia por <span className="tabular font-medium text-foreground">{formatMoney(total)}</span>.
          </p>
        </TabsContent>

        <TabsContent value="mixed" className="flex flex-col gap-3">
          <MixedRows rows={rows} setRows={setRows} total={total} tenders={tenders} />
        </TabsContent>
      </Tabs>

      <div
        className={cn(
          "flex items-center justify-between rounded-xl border px-4 py-3",
          result.ok ? "border-success/40 bg-success/10" : "bg-muted/30",
        )}
        aria-live="polite"
        aria-atomic="true"
      >
        {result.ok ? (
          <>
            <span className="text-sm font-medium">Vuelto</span>
            <span className="tabular text-4xl font-bold tracking-tight text-success">{formatMoney(change)}</span>
          </>
        ) : missing > 0 ? (
          <>
            <span className="text-sm font-medium">Falta</span>
            <span className="tabular text-3xl font-bold tracking-tight text-muted-foreground">{formatMoney(missing)}</span>
          </>
        ) : (
          <span className="text-sm text-destructive">{result.error}</span>
        )}
      </div>

      <Button type="submit" variant="brand" size="xl" className="w-full" disabled={!canConfirm}>
        {busy ? (
          <>
            <Loader2 className="animate-spin" /> Registrando…
          </>
        ) : (
          <>
            Confirmar cobro <Kbd className="border-brand-foreground/30 bg-transparent text-brand-foreground/80">Enter</Kbd>
          </>
        )}
      </Button>
      {!registerId && <p className="text-center text-sm text-destructive">Abre la caja antes de cobrar.</p>}
    </form>
  );
}

function ReferenceField({
  id,
  label,
  value,
  onChange,
  numeric,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  numeric?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        autoFocus
        autoComplete="off"
        inputMode={numeric ? "numeric" : "text"}
        maxLength={numeric ? 4 : 40}
        value={value}
        onChange={(e) => onChange(numeric ? e.target.value.replace(/\D/g, "") : e.target.value)}
        className="h-12 text-lg"
      />
    </div>
  );
}

function MixedRows({
  rows,
  setRows,
  total,
  tenders,
}: {
  rows: MixedRow[];
  setRows: React.Dispatch<React.SetStateAction<MixedRow[]>>;
  total: Cents;
  tenders: TenderInput[];
}) {
  const paid = tenders.reduce((a, t) => a + t.amount, 0);
  const remaining = Math.max(0, total - paid);
  const update = (id: string, patch: Partial<MixedRow>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  return (
    <div className="flex flex-col gap-2">
      {rows.map((r, i) => {
        const Icon = METHOD_ICON[r.method];
        return (
          <div key={r.id} className="flex flex-col gap-2 rounded-lg border p-2.5">
            <div className="flex items-center gap-2">
              <ToggleGroup
                type="single"
                value={r.method}
                onValueChange={(v) => v && update(r.id, { method: v as PaymentMethod })}
                aria-label={`Método del pago ${i + 1}`}
                className="flex-nowrap"
              >
                {(Object.keys(PAYMENT_LABEL) as PaymentMethod[]).map((m) => {
                  const I = METHOD_ICON[m];
                  return (
                    <ToggleGroupItem key={m} value={m} aria-label={PAYMENT_LABEL[m]} title={PAYMENT_LABEL[m]} className="h-10 min-w-10 px-2.5">
                      <I />
                    </ToggleGroupItem>
                  );
                })}
              </ToggleGroup>
              <div className="min-w-0 flex-1">
                <MoneyInput
                  aria-label={`Monto en ${PAYMENT_LABEL[r.method]}`}
                  autoFocus={i === 0}
                  value={r.amount}
                  onValueChange={(amount) => update(r.id, { amount })}
                  className="h-10 text-base font-semibold"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-10"
                onClick={() => update(r.id, { amount: (r.amount ?? 0) + remaining })}
                disabled={remaining === 0}
                title="Completar con lo que falta"
              >
                Resto
              </Button>
              {rows.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-10"
                  aria-label="Quitar pago"
                  onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))}
                >
                  <X />
                </Button>
              )}
            </div>
            {r.method !== "cash" && (
              <div className="flex items-center gap-2">
                <Icon className="size-4 shrink-0 text-muted-foreground" />
                <Input
                  aria-label={r.method === "card" ? "Últimos 4 dígitos" : "N.º de transferencia"}
                  placeholder={r.method === "card" ? "Últimos 4 (opcional)" : "Referencia (opcional)"}
                  value={r.reference}
                  maxLength={r.method === "card" ? 4 : 40}
                  onChange={(e) =>
                    update(r.id, {
                      reference: r.method === "card" ? e.target.value.replace(/\D/g, "") : e.target.value,
                    })
                  }
                  className="h-9"
                />
              </div>
            )}
          </div>
        );
      })}
      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setRows((rs) => [...rs, { id: uid(), method: "cash", amount: null, reference: "" }])}
          disabled={rows.length >= 4}
        >
          <Plus /> Agregar pago
        </Button>
        <p className="text-sm" aria-live="polite">
          Pendiente: <span className={cn("tabular font-semibold", remaining > 0 ? "text-foreground" : "text-success")}>{formatMoney(remaining)}</span>
        </p>
      </div>
    </div>
  );
}

function SuccessScreen({ sale, onNewSale }: { sale: SaleWithItems; onNewSale: () => void }) {
  const cashierName = useSession((s) => s.user?.fullName);
  const [printing, setPrinting] = React.useState(false);

  const print = async () => {
    setPrinting(true);
    try {
      await printReceipt(sale, { cashierName });
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? `No se pudo imprimir: ${e.message}` : "No se pudo imprimir el ticket.");
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-5 text-center">
      <CheckCircle2 className="size-12 text-success" aria-hidden />
      <DialogHeader className="items-center text-center">
        <DialogTitle>Venta #{sale.number} registrada</DialogTitle>
        <DialogDescription>
          Total {formatMoney(sale.total)} · {sale.payments.map((p) => PAYMENT_LABEL[p.method]).join(" + ") || "Sin cobro"}
        </DialogDescription>
      </DialogHeader>
      <div className="flex w-full flex-col items-center gap-1 rounded-xl bg-success/10 py-6" aria-live="assertive" aria-atomic="true">
        <span className="text-sm font-medium tracking-wide text-muted-foreground uppercase">Vuelto</span>
        <span className="tabular text-6xl font-bold tracking-tight text-success">{formatMoney(sale.change)}</span>
      </div>
      <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
        <Button type="button" variant="outline" size="xl" onClick={print} disabled={printing}>
          {printing ? <Loader2 className="animate-spin" /> : <Printer />} Imprimir ticket
        </Button>
        <Button type="button" variant="brand" size="xl" autoFocus onClick={onNewSale}>
          Nueva venta <Kbd className="border-brand-foreground/30 bg-transparent text-brand-foreground/80">Enter</Kbd>
        </Button>
      </div>
    </div>
  );
}
