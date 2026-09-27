"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Search, Settings } from "lucide-react";
import { useSession } from "@/stores/session";
import { useRegister } from "@/stores/register";
import { useCart } from "@/stores/cart";
import { formatMoney } from "@/domain/money";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { NAV } from "./nav";
import { ThemeToggle } from "./theme-toggle";

export function TopBar({ onOpenPalette }: { onOpenPalette: () => void }) {
  const pathname = usePathname();
  const user = useSession((s) => s.user);
  const signOut = useSession((s) => s.signOut);
  const mode = useSession((s) => s.mode);
  const register = useRegister((s) => s.register);
  const summary = useRegister((s) => s.summary);
  const clearCart = useCart((s) => s.clear);
  const title = NAV.find((n) => pathname.startsWith(n.href))?.label ?? "";

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur md:px-5">
      <h1 className="text-base font-semibold tracking-tight">{title}</h1>
      {mode === "demo" && (
        <span className="hidden rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase sm:inline">
          Demo
        </span>
      )}
      <div className="flex-1" />
      <Link
        href="/caja"
        className={cn(
          "flex h-8 items-center gap-2 rounded-full border px-3 text-xs font-medium transition-colors hover:bg-muted",
          !register && "border-warning/40 text-warning",
        )}
      >
        <span className={cn("size-2 rounded-full", register ? "bg-success" : "bg-warning")} />
        {register ? (
          <>
            <span className="hidden sm:inline">Caja abierta</span>
            <span className="tabular text-muted-foreground">{summary ? formatMoney(summary.expectedCash) : ""}</span>
          </>
        ) : (
          "Caja cerrada"
        )}
      </Link>
      <Button variant="outline" size="sm" className="hidden gap-2 text-muted-foreground md:inline-flex" onClick={onOpenPalette}>
        <Search /> Buscar <Kbd>Ctrl K</Kbd>
      </Button>
      <Button variant="ghost" size="icon" className="md:hidden" aria-label="Buscar" onClick={onOpenPalette}>
        <Search />
      </Button>
      <ThemeToggle />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Cuenta">
            <span className="grid size-7 place-items-center rounded-full bg-muted text-xs font-semibold">
              {user?.fullName[0]}
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel>
            <div className="text-sm font-medium text-foreground">{user?.fullName}</div>
            <div className="text-xs">{user?.role === "admin" ? "Administrador" : "Cajero"}</div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/ajustes"><Settings /> Ajustes</Link>
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onSelect={async () => {
              clearCart();
              await signOut();
            }}
          >
            <LogOut /> Cerrar sesión
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
