"use client";
import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Minus, Plus, ShoppingBag, Tag, Trash2, UserRound, Wallet, X } from "lucide-react";
import { formatMoney } from "@/domain/money";
import type { Discount, VariantView } from "@/domain/types";
import { STORE } from "@/lib/config";
import { variantLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useCart, type CartLine } from "@/stores/cart";
import { useRegister } from "@/stores/register";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { setLineQuantity } from "./cart-actions";
import { DiscountPopover, describeDiscount } from "./discount-popover";
import { useCartPricing } from "./use-cart-pricing";

const taxLabel = `IVA incluido (${STORE.taxRateBps / 100}%)`;

export function CartPanel({ onCheckout, className }: { onCheckout: () => void; className?: string }) {
  const { rows, pricing } = useCartPricing();
  const cartDiscount = useCart((s) => s.cartDiscount);
  const lastVariantId = useCart((s) => s.lastVariantId);
  const registerOpen = useRegister((s) => s.register !== null);
  const registerLoaded = useRegister((s) => s.loaded);
  const empty = rows.length === 0;

  const netBeforeCart = pricing.lines.reduce((a, l) => a + l.gross - l.lineDiscount, 0);

  const clearWithUndo = () => {
    const snapshot = useCart.getState();
    const saved = {
      lines: snapshot.lines,
      cartDiscount: snapshot.cartDiscount,
      customerName: snapshot.customerName,
    };
    snapshot.clear();
    toast("Carrito vaciado", {
      action: { label: "Deshacer", onClick: () => useCart.setState(saved) },
    });
  };

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <div className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
        <h2 className="text-sm font-semibold">Venta actual</h2>
        {pricing.itemCount > 0 && (
          <span className="tabular rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {pricing.itemCount} {pricing.itemCount === 1 ? "artículo" : "artículos"}
          </span>
        )}
        <div className="flex-1" />
        {!empty && (
          <Button variant="ghost" size="sm" onClick={clearWithUndo} className="text-muted-foreground">
            <Trash2 /> Vaciar
          </Button>
        )}
      </div>

      <CustomerField />

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {empty ? (
          <div className="grid h-full min-h-40 place-items-center p-6 text-center text-sm text-muted-foreground">
            <div className="flex flex-col items-center gap-2">
              <ShoppingBag className="size-8 opacity-40" />
              <p>Escanea o toca un producto para agregarlo.</p>
            </div>
          </div>
        ) : (
          <ul className="divide-y" aria-label="Artículos en el carrito">
            {rows.map(({ line, view }, i) => {
              const pl = pricing.lines[i];
              return (
                <CartLineRow
                  key={line.variantId}
                  line={line}
                  view={view}
                  gross={pl.gross}
                  lineDiscount={pl.lineDiscount}
                  highlighted={line.variantId === lastVariantId}
                />
              );
            })}
          </ul>
        )}
      </div>

      <div className="shrink-0 border-t bg-muted/20 p-4">
        <dl className="flex flex-col gap-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd className="tabular">{formatMoney(pricing.subtotal)}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt>
              <DiscountPopover
                value={cartDiscount}
                onChange={(d) => useCart.getState().setCartDiscount(d)}
                base={netBeforeCart}
                title="Descuento a toda la venta"
                align="start"
              >
                <button
                  type="button"
                  disabled={empty}
                  className="-mx-1 inline-flex items-center gap-1.5 rounded px-1 text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:no-underline disabled:opacity-60"
                >
                  <Tag className="size-3.5" />
                  Descuentos
                  {cartDiscount && (
                    <span className="rounded bg-brand/12 px-1 text-xs text-brand">{describeDiscount(cartDiscount)}</span>
                  )}
                </button>
              </DiscountPopover>
            </dt>
            <dd className={cn("tabular", pricing.discountTotal > 0 && "text-brand")}>
              {pricing.discountTotal > 0 ? `−${formatMoney(pricing.discountTotal)}` : formatMoney(0)}
            </dd>
          </div>
          <div className="flex justify-between text-xs">
            <dt className="text-muted-foreground">{taxLabel}</dt>
            <dd className="tabular text-muted-foreground">{formatMoney(pricing.taxTotal)}</dd>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <dt className="text-sm font-semibold tracking-wide uppercase">Total</dt>
            <dd className="tabular text-3xl font-bold tracking-tight" aria-live="polite" aria-atomic="true">
              {formatMoney(pricing.total)}
            </dd>
          </div>
        </dl>

        {registerLoaded && !registerOpen ? (
          <div className="mt-3 flex flex-col gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
            <p>Caja cerrada: abre la caja para poder cobrar.</p>
            <Button asChild variant="outline" size="lg" className="w-full">
              <Link href="/caja">
                <Wallet /> Abrir caja
              </Link>
            </Button>
          </div>
        ) : (
          <Button
            variant="brand"
            size="xl"
            className="mt-3 w-full justify-between"
            disabled={empty || !registerOpen}
            onClick={onCheckout}
          >
            <span>Cobrar</span>
            <span className="flex items-center gap-2">
              <span className="tabular">{formatMoney(pricing.total)}</span>
              <Kbd className="hidden border-brand-foreground/30 bg-transparent text-brand-foreground/80 lg:inline-flex">F9</Kbd>
            </span>
          </Button>
        )}
      </div>
    </div>
  );
}

function CustomerField() {
  const customerName = useCart((s) => s.customerName);
  return (
    <div className="relative shrink-0 border-b">
      <UserRound className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
      <label htmlFor="pos-customer" className="sr-only">
        Nombre del cliente (opcional)
      </label>
      <input
        id="pos-customer"
        value={customerName}
        onChange={(e) => useCart.getState().setCustomerName(e.target.value)}
        placeholder="Cliente (opcional)"
        autoComplete="off"
        maxLength={80}
        className="h-11 w-full bg-transparent pr-4 pl-10 text-sm outline-none placeholder:text-muted-foreground focus-visible:bg-muted/40 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset"
      />
    </div>
  );
}

const CartLineRow = React.memo(function CartLineRow({
  line,
  view,
  gross,
  lineDiscount,
  highlighted,
}: {
  line: CartLine;
  view: VariantView | undefined;
  gross: number;
  lineDiscount: number;
  highlighted: boolean;
}) {
  const name = view?.productName ?? "Producto no disponible";
  const label = view ? variantLabel(view) : "";
  const stock = view?.stock ?? 0;
  const atMax = line.quantity >= stock;
  const setDiscount = (d: Discount | null) => useCart.getState().setLineDiscount(line.variantId, d);

  return (
    <li className={cn("flex flex-col gap-2 px-4 py-3 transition-colors", highlighted && "bg-brand/5")}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {[label, view?.sku].filter(Boolean).join(" · ")}
            {" · "}
            <span className="tabular">{formatMoney(view?.effectivePrice ?? 0)}</span>
          </p>
          {line.quantity > stock && (
            <p className="text-xs font-medium text-destructive">Solo hay {stock} en inventario.</p>
          )}
        </div>
        <div className="text-right">
          <p className="tabular text-sm font-semibold">{formatMoney(gross - lineDiscount)}</p>
          {lineDiscount > 0 && (
            <p className="tabular text-xs text-muted-foreground line-through">{formatMoney(gross)}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="flex items-center rounded-lg border">
          <Button
            variant="ghost"
            size="icon-lg"
            className="rounded-r-none"
            aria-label={line.quantity <= 1 ? `Quitar ${name}` : `Restar uno a ${name}`}
            onClick={() => setLineQuantity(line.variantId, line.quantity - 1)}
          >
            <Minus />
          </Button>
          <QtyInput variantId={line.variantId} quantity={line.quantity} name={name} />
          <Button
            variant="ghost"
            size="icon-lg"
            className="rounded-l-none"
            aria-label={`Sumar uno a ${name}`}
            disabled={atMax}
            onClick={() => setLineQuantity(line.variantId, line.quantity + 1)}
          >
            <Plus />
          </Button>
        </div>
        <DiscountPopover value={line.discount} onChange={setDiscount} base={gross} title={`Descuento: ${name}`}>
          <Button
            variant={line.discount ? "secondary" : "ghost"}
            size={line.discount ? "lg" : "icon-lg"}
            className={cn(line.discount && "px-3 text-brand")}
            aria-label={line.discount ? `Descuento ${describeDiscount(line.discount)}, editar` : `Descuento a ${name}`}
          >
            <Tag />
            {line.discount && <span className="text-sm">{describeDiscount(line.discount)}</span>}
          </Button>
        </DiscountPopover>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="icon-lg"
          className="text-muted-foreground hover:text-destructive"
          aria-label={`Eliminar ${name}`}
          onClick={() => useCart.getState().remove(line.variantId)}
        >
          <X />
        </Button>
      </div>
    </li>
  );
});

function QtyInput({ variantId, quantity, name }: { variantId: string; quantity: number; name: string }) {
  const [draft, setDraft] = React.useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const n = Number.parseInt(draft, 10);
    setDraft(null);
    if (Number.isFinite(n) && n !== quantity) setLineQuantity(variantId, n);
  };
  return (
    <input
      aria-label={`Cantidad de ${name}`}
      inputMode="numeric"
      pattern="[0-9]*"
      autoComplete="off"
      value={draft ?? String(quantity)}
      onFocus={(e) => {
        setDraft(String(quantity));
        e.target.select();
      }}
      onChange={(e) => setDraft(e.target.value.replace(/\D/g, "").slice(0, 4))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        } else if (e.key === "Escape") {
          e.stopPropagation();
          setDraft(null);
          e.currentTarget.blur();
        }
      }}
      className="tabular h-11 w-12 border-x bg-transparent text-center text-base font-semibold outline-none focus-visible:bg-muted/50 focus-visible:ring-[3px] focus-visible:ring-ring/50"
    />
  );
}
