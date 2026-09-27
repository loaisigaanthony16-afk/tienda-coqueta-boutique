"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Moon, PackageSearch } from "lucide-react";
import { toast } from "sonner";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
  CommandSeparator, CommandShortcut,
} from "@/components/ui/command";
import { useSession } from "@/stores/session";
import { useCatalog } from "@/stores/catalog";
import { useCart } from "@/stores/cart";
import { formatMoney } from "@/domain/money";
import { NAV } from "./nav";
import { toggleTheme } from "./theme-toggle";

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const role = useSession((s) => s.user?.role);
  const views = useCatalog((s) => s.views);
  const add = useCart((s) => s.add);
  const [query, setQuery] = React.useState("");

  const products = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return views
      .filter((v) => v.active)
      .filter((v) =>
        `${v.productName} ${v.size ?? ""} ${v.color ?? ""} ${v.sku} ${v.barcode}`.toLowerCase().includes(q),
      )
      .slice(0, 12);
  }, [query, views]);

  const run = (fn: () => void) => {
    onOpenChange(false);
    setQuery("");
    fn();
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Buscar producto, SKU o acción…" value={query} onValueChange={setQuery} />
      <CommandList>
        <CommandEmpty>Sin resultados.</CommandEmpty>
        {products.length > 0 && (
          <CommandGroup heading="Agregar al carrito">
            {products.map((v) => (
              <CommandItem
                key={v.id}
                value={`${v.productName} ${v.size} ${v.color} ${v.sku} ${v.barcode}`}
                disabled={v.stock <= 0}
                onSelect={() =>
                  run(() => {
                    add(v.id);
                    toast.success(`${v.productName} agregado`);
                    router.push("/pos");
                  })
                }
              >
                <PackageSearch />
                <span className="flex-1 truncate">
                  {v.productName}
                  <span className="text-muted-foreground"> · {[v.size, v.color].filter(Boolean).join(" / ")}</span>
                </span>
                <span className="text-xs text-muted-foreground tabular">{v.stock} u</span>
                <span className="w-20 text-right tabular">{formatMoney(v.effectivePrice)}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        <CommandSeparator />
        <CommandGroup heading="Ir a">
          {NAV.filter((n) => role && n.roles.includes(role)).map((n) => (
            <CommandItem key={n.href} value={`ir ${n.label}`} onSelect={() => run(() => router.push(n.href))}>
              <n.icon /> {n.label}
              <CommandShortcut>{n.shortcut}</CommandShortcut>
            </CommandItem>
          ))}
          <CommandItem value="tema oscuro claro" onSelect={() => run(toggleTheme)}>
            <Moon /> Cambiar tema
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
