"use client";
import * as React from "react";
import { toast } from "sonner";
import { Ban, Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatMoney } from "@/domain/money";
import { PAYMENT_LABEL } from "@/domain/payment";
import type { SaleWithItems } from "@/domain/types";
import { formatDateTime } from "@/lib/format";
import { printReceipt } from "@/lib/printing";
import { useRegister } from "@/stores/register";
import { useIsAdmin } from "@/stores/session";
import { StatusBadge } from "./sale-badges";
import { VoidSaleDialog } from "./void-sale-dialog";

export function SaleDetailSheet({
  sale,
  open,
  onOpenChange,
  cashierName,
  onVoided,
}: {
  sale: SaleWithItems | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cashierName: (id: string) => string;
  onVoided: (sale: SaleWithItems) => void;
}) {
  const isAdmin = useIsAdmin();
  const openRegisterId = useRegister((s) => s.register?.id ?? null);
  const registerLoaded = useRegister((s) => s.loaded);
  const [printing, setPrinting] = React.useState(false);
  const [voidOpen, setVoidOpen] = React.useState(false);

  async function reprint() {
    if (!sale) return;
    setPrinting(true);
    try {
      await printReceipt(sale, { copyLabel: "REIMPRESIÓN", cashierName: cashierName(sale.cashierId) });
      toast.success("Ticket enviado a la impresora");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo imprimir");
    } finally {
      setPrinting(false);
    }
  }

  // Pista local; el repositorio valida de todos modos (RepositoryError "register_closed").
  const canVoidRegister = sale ? !registerLoaded || sale.registerId === openRegisterId : false;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="gap-0 sm:max-w-lg">
        {sale && (
          <>
            <SheetHeader className="border-b pr-12">
              <div className="flex items-center gap-2">
                <SheetTitle className="text-lg">Venta #{sale.number}</SheetTitle>
                <StatusBadge status={sale.status} />
              </div>
              <SheetDescription>
                {formatDateTime(sale.createdAt)} · {cashierName(sale.cashierId)}
                {sale.customerName ? ` · Cliente: ${sale.customerName}` : ""}
              </SheetDescription>
            </SheetHeader>

            <div className="flex flex-col gap-4 p-4">
              {sale.status === "voided" && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/8 p-3 text-sm">
                  <div className="font-medium text-destructive">Anulada{sale.voidedAt ? ` el ${formatDateTime(sale.voidedAt)}` : ""}</div>
                  {sale.voidReason && <div className="mt-0.5 text-muted-foreground">Motivo: {sale.voidReason}</div>}
                </div>
              )}

              <ul className="flex flex-col divide-y">
                {sale.items.map((i) => (
                  <li key={i.id} className="flex gap-3 py-2.5 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{i.productName}</div>
                      <div className="text-xs text-muted-foreground">
                        {[i.variantLabel, i.sku].filter(Boolean).join(" · ")}
                      </div>
                      <div className="text-xs text-muted-foreground tabular-nums">
                        {i.quantity} × {formatMoney(i.unitPrice)}
                        {i.discount > 0 && <span className="text-success"> · −{formatMoney(i.discount)}</span>}
                      </div>
                    </div>
                    <div className="font-medium tabular-nums">{formatMoney(i.lineTotal)}</div>
                  </li>
                ))}
              </ul>

              <Separator />

              <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd className="text-right tabular-nums">{formatMoney(sale.subtotal)}</dd>
                {sale.discountTotal > 0 && (
                  <>
                    <dt className="text-muted-foreground">Descuentos</dt>
                    <dd className="text-right text-success tabular-nums">−{formatMoney(sale.discountTotal)}</dd>
                  </>
                )}
                <dt className="text-muted-foreground">IVA incluido</dt>
                <dd className="text-right tabular-nums">{formatMoney(sale.taxTotal)}</dd>
                <dt className="mt-1 text-base font-semibold">Total</dt>
                <dd className="mt-1 text-right text-base font-semibold tabular-nums">{formatMoney(sale.total)}</dd>
              </dl>

              <Separator />

              <div className="flex flex-col gap-1.5 text-sm">
                <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Pagos</div>
                {sale.payments.map((p, k) => (
                  <div key={k} className="flex items-baseline gap-2">
                    <span className="flex-1">
                      {PAYMENT_LABEL[p.method]}
                      {p.reference && <span className="text-xs text-muted-foreground"> · Ref. {p.reference}</span>}
                      {p.method === "cash" && p.tendered !== undefined && p.tendered !== p.amount && (
                        <span className="text-xs text-muted-foreground"> · recibido {formatMoney(p.tendered)}</span>
                      )}
                    </span>
                    <span className="tabular-nums">{formatMoney(p.amount)}</span>
                  </div>
                ))}
                {sale.change > 0 && (
                  <div className="flex items-baseline gap-2">
                    <span className="flex-1 text-muted-foreground">Vuelto</span>
                    <span className="tabular-nums">{formatMoney(sale.change)}</span>
                  </div>
                )}
              </div>
            </div>

            <SheetFooter className="border-t sm:flex-row">
              <Button variant="outline" className="flex-1" onClick={reprint} disabled={printing}>
                {printing ? <Loader2 className="animate-spin" /> : <Printer />} Reimprimir
              </Button>
              {isAdmin && sale.status === "completed" && (
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={() => setVoidOpen(true)}
                  disabled={!canVoidRegister}
                  title={canVoidRegister ? undefined : "Solo se pueden anular ventas de la caja abierta."}
                >
                  <Ban /> Anular
                </Button>
              )}
            </SheetFooter>
            {isAdmin && sale.status === "completed" && !canVoidRegister && (
              <p className="px-4 pb-4 text-xs text-muted-foreground">
                Solo se pueden anular ventas de la caja abierta.
              </p>
            )}

            {isAdmin && (
              <VoidSaleDialog sale={sale} open={voidOpen} onOpenChange={setVoidOpen} onVoided={onVoided} />
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
