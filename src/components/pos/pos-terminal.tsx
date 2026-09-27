"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronUp, Wallet } from "lucide-react";
import { formatMoney } from "@/domain/money";
import { useBarcodeScanner } from "@/hooks/use-barcode-scanner";
import { useCart } from "@/stores/cart";
import { useRegister } from "@/stores/register";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { addByCode, bumpLastLine, removeLastLine } from "./cart-actions";
import { CameraScanner } from "./camera-scanner";
import { CartPanel } from "./cart-panel";
import { CheckoutDialog } from "./checkout-dialog";
import { ProductBrowser, type ProductGroup, type SearchHandle } from "./product-browser";
import { useCartTotals } from "./use-cart-pricing";
import { VariantPicker } from "./variant-picker";

function isTextField(el: EventTarget | null): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  return (
    el.isContentEditable ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement ||
    (el instanceof HTMLInputElement && !["button", "checkbox", "radio", "submit", "reset"].includes(el.type))
  );
}

export function PosTerminal() {
  const searchRef = React.useRef<SearchHandle>(null);
  const [picker, setPicker] = React.useState<ProductGroup | null>(null);
  const [checkoutOpen, setCheckoutOpen] = React.useState(false);
  const [cameraOpen, setCameraOpen] = React.useState(false);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const registerLoaded = useRegister((s) => s.loaded);
  const registerOpen = useRegister((s) => s.register !== null);
  const router = useRouter();

  const modalOpen = picker !== null || checkoutOpen || cameraOpen;
  const focusSearch = React.useCallback(() => searchRef.current?.focus(), []);

  const requestCheckout = React.useCallback(() => {
    const { register } = useRegister.getState();
    if (!register) {
      toast.warning("Abre la caja antes de cobrar.", {
        action: { label: "Ir a Caja", onClick: () => router.push("/caja") },
      });
      return;
    }
    if (useCart.getState().lines.length === 0) {
      toast("El carrito está vacío.");
      return;
    }
    setSheetOpen(false);
    setCheckoutOpen(true);
  }, [router]);

  const onScan = React.useCallback((code: string) => {
    searchRef.current?.clear();
    addByCode(code, { sound: true });
  }, []);

  // Lector USB/HID: activo mientras no haya un modal abierto.
  useBarcodeScanner(onScan, { enabled: !modalOpen });

  // Atajos del POS.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.key === "F9" || ((e.ctrlKey || e.metaKey) && e.key === "Enter")) {
        e.preventDefault();
        if (!modalOpen) requestCheckout();
        return;
      }
      if (modalOpen || sheetOpen || e.ctrlKey || e.metaKey || e.altKey) return;

      const target = e.target;
      const inSearch = target instanceof HTMLElement && target.id === "pos-search";
      // Solo con el buscador vacío y fuera de otros campos de texto.
      if (!(searchRef.current?.isEmpty() ?? true)) return;
      if (isTextField(target) && !inSearch) return;

      if (e.key === "Delete") {
        e.preventDefault();
        removeLastLine();
      } else if (e.key === "+" || e.key === "Add") {
        e.preventDefault();
        bumpLastLine(1);
      } else if (e.key === "-" || e.key === "Subtract") {
        e.preventDefault();
        bumpLastLine(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalOpen, sheetOpen, requestCheckout]);

  return (
    <div className="flex h-[calc(100dvh-7.5rem-env(safe-area-inset-bottom))] flex-col md:h-[calc(100dvh-3.5rem)] lg:grid lg:grid-cols-[minmax(0,1fr)_24rem] xl:grid-cols-[minmax(0,1fr)_27rem]">
      <section className="flex min-h-0 flex-1 flex-col" aria-label="Productos">
        {registerLoaded && !registerOpen && <RegisterClosedBanner />}
        <ProductBrowser apiRef={searchRef} onPick={setPicker} onOpenCamera={() => setCameraOpen(true)} />
        <MobileCartBar onOpen={() => setSheetOpen(true)} />
      </section>

      <aside className="hidden min-h-0 flex-col border-l bg-background lg:flex" aria-label="Carrito">
        <CartPanel onCheckout={requestCheckout} />
      </aside>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="h-[88dvh] gap-0 p-0 lg:hidden">
          <SheetTitle className="sr-only">Carrito</SheetTitle>
          <SheetDescription className="sr-only">Artículos de la venta actual</SheetDescription>
          <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-muted" aria-hidden />
          <CartPanel onCheckout={requestCheckout} className="pt-1" />
        </SheetContent>
      </Sheet>

      <VariantPicker group={picker} onOpenChange={(o) => !o && setPicker(null)} onDone={focusSearch} />
      <CheckoutDialog open={checkoutOpen} onOpenChange={setCheckoutOpen} onFinished={focusSearch} />
      <CameraScanner
        open={cameraOpen}
        onOpenChange={setCameraOpen}
        onDetected={(code) => addByCode(code, { sound: true })}
        onClosed={focusSearch}
      />
    </div>
  );
}

function RegisterClosedBanner() {
  return (
    <div
      role="status"
      className="flex items-center gap-3 border-b border-warning/30 bg-warning/10 px-3 py-2.5 text-sm md:px-4"
    >
      <Wallet className="size-5 shrink-0 text-warning" />
      <p className="min-w-0 flex-1">
        <span className="font-medium">Caja cerrada.</span>{" "}
        <span className="text-muted-foreground">Puedes consultar productos, pero no cobrar.</span>
      </p>
      <Button asChild size="sm" variant="outline" className="h-9 shrink-0">
        <Link href="/caja">Abrir caja</Link>
      </Button>
    </div>
  );
}

function MobileCartBar({ onOpen }: { onOpen: () => void }) {
  const { total, itemCount } = useCartTotals();
  return (
    <div className="shrink-0 border-t bg-background/95 p-2 backdrop-blur lg:hidden">
      <Button
        variant={itemCount > 0 ? "brand" : "secondary"}
        size="xl"
        className="w-full justify-between"
        onClick={onOpen}
        aria-label={`Ver carrito: ${formatMoney(total)}, ${itemCount} artículos`}
      >
        <span className="flex items-center gap-2">
          <ChevronUp className="size-5" />
          Cobrar <span className="tabular">{formatMoney(total)}</span>
        </span>
        <span className="tabular text-sm font-normal opacity-90" aria-live="polite">
          {itemCount} {itemCount === 1 ? "artículo" : "artículos"}
        </span>
      </Button>
    </div>
  );
}
