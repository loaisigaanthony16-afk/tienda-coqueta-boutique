"use client";
import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useSession } from "@/stores/session";
import { useCatalog } from "@/stores/catalog";
import { useRegister } from "@/stores/register";
import { LoginScreen } from "./login-screen";
import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";
import { BottomNav } from "./bottom-nav";
import { CommandPalette } from "./command-palette";
import { NAV } from "./nav";
import { autoReconnectPrinter } from "@/lib/printing";

export function AppShell({ children }: { children: React.ReactNode }) {
  const status = useSession((s) => s.status);
  const user = useSession((s) => s.user);
  const init = useSession((s) => s.init);
  const loadCatalog = useCatalog((s) => s.load);
  const refreshRegister = useRegister((s) => s.refresh);
  const router = useRouter();
  const pathname = usePathname();
  const [paletteOpen, setPaletteOpen] = React.useState(false);

  React.useEffect(() => {
    init().catch((e) => console.error(e));
  }, [init]);

  React.useEffect(() => {
    if (status !== "authenticated") return;
    void Promise.all([loadCatalog(true), refreshRegister()]);
    void Promise.resolve(autoReconnectPrinter()).catch(() => {});
  }, [status, loadCatalog, refreshRegister]);

  // Atajos globales: Ctrl/Cmd+K paleta, F-keys navegación.
  React.useEffect(() => {
    if (status !== "authenticated") return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
        return;
      }
      const item = NAV.find((n) => n.shortcut === e.key && user && n.roles.includes(user.role));
      if (item) {
        e.preventDefault();
        router.push(item.href);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [status, user, router]);

  if (status === "loading") {
    return (
      <div className="grid min-h-dvh place-items-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (status === "anonymous" || !user) return <LoginScreen />;

  const allowed = NAV.find((n) => pathname.startsWith(n.href));
  const forbidden = allowed && !allowed.roles.includes(user.role);

  return (
    <div className="flex min-h-dvh">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onOpenPalette={() => setPaletteOpen(true)} />
        <main className="flex min-h-0 flex-1 flex-col pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
          {forbidden ? (
            <div className="grid flex-1 place-items-center p-8 text-center text-sm text-muted-foreground">
              Esta sección es solo para administradores.
            </div>
          ) : (
            children
          )}
        </main>
      </div>
      <BottomNav />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
