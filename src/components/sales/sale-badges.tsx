import { Badge } from "@/components/ui/badge";
import { PAYMENT_LABEL } from "@/domain/payment";
import type { Payment, PaymentMethod, SaleStatus } from "@/domain/types";

export function StatusBadge({ status }: { status: SaleStatus }) {
  return status === "completed" ? (
    <Badge variant="success">Completada</Badge>
  ) : (
    <Badge variant="destructive">Anulada</Badge>
  );
}

export function MethodBadges({ payments }: { payments: Payment[] }) {
  const methods = [...new Set(payments.map((p) => p.method))] as PaymentMethod[];
  if (!methods.length) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {methods.map((m) => (
        <Badge key={m} variant="outline" className="font-normal">
          {PAYMENT_LABEL[m]}
        </Badge>
      ))}
    </span>
  );
}
