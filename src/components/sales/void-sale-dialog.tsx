"use client";
import * as React from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney } from "@/domain/money";
import type { SaleWithItems } from "@/domain/types";
import { repo, RepositoryError } from "@/data";
import { useCatalog } from "@/stores/catalog";
import { useRegister } from "@/stores/register";

export function VoidSaleDialog({
  sale,
  open,
  onOpenChange,
  onVoided,
}: {
  sale: SaleWithItems;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onVoided: (sale: SaleWithItems) => void;
}) {
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const valid = reason.trim().length >= 3;

  async function confirm() {
    if (!valid || busy) return;
    setBusy(true);
    try {
      const updated = await repo().voidSale(sale.id, reason.trim());
      toast.success(`Venta #${sale.number} anulada; el stock fue devuelto.`);
      onVoided(updated);
      onOpenChange(false);
      setReason("");
      void Promise.all([useCatalog.getState().load(true), useRegister.getState().refresh()]).catch(() => {});
    } catch (e) {
      toast.error(e instanceof RepositoryError || e instanceof Error ? e.message : "No se pudo anular la venta.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Anular la venta #{sale.number}?</AlertDialogTitle>
          <AlertDialogDescription>
            Se devolverán {sale.items.reduce((a, i) => a + i.quantity, 0)} artículos al inventario y{" "}
            {formatMoney(sale.total)} saldrá del arqueo de caja. Esta acción no se puede deshacer.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="void-reason">Motivo (obligatorio)</Label>
          <Textarea
            id="void-reason"
            autoFocus
            value={reason}
            maxLength={200}
            placeholder="Ej.: error de cobro, cliente desistió…"
            onChange={(e) => setReason(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void confirm();
            }}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
          <Button variant="destructive" disabled={!valid || busy} onClick={confirm}>
            {busy && <Loader2 className="animate-spin" />} Anular venta
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
