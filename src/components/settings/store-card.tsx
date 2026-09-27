import { Store } from "lucide-react";
import { formatBps } from "@/domain/money";
import { STORE } from "@/lib/config";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoRow } from "./shared";

export function StoreCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Store className="size-4 text-muted-foreground" /> Tienda
        </CardTitle>
        <CardDescription>Datos que aparecen en el encabezado de los tickets.</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="divide-y">
          <InfoRow label="Nombre" value={STORE.name} />
          <InfoRow label="Razón social" value={STORE.legalName} />
          <InfoRow label="Identificación fiscal" value={STORE.taxId} />
          <InfoRow label="Dirección" value={STORE.address} />
          <InfoRow label="Teléfono" value={STORE.phone} />
          <InfoRow label="Moneda" value={STORE.currency} />
          <InfoRow
            label="IVA"
            value={`${formatBps(STORE.taxRateBps)} ${STORE.pricesIncludeTax ? "(incluido en precios)" : "(se suma al precio)"}`}
          />
          <InfoRow label="Pie del ticket" value={<span className="font-normal">{STORE.receiptFooter}</span>} />
        </dl>
      </CardContent>
    </Card>
  );
}
