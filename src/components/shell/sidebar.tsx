"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "@/stores/session";
import { STORE } from "@/lib/config";
import { cn } from "@/lib/utils";
import { Kbd } from "@/components/ui/kbd";
import { NAV } from "./nav";

export function Sidebar() {
  const pathname = usePathname();
  const role = useSession((s) => s.user?.role);
  return (
    <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-r bg-muted/30 md:flex">
      <div className="flex h-14 items-center gap-2.5 px-4">
        <span className="grid size-7 place-items-center rounded-lg bg-brand text-sm font-semibold text-brand-foreground">C</span>
        <span className="truncate text-sm font-semibold tracking-tight">{STORE.name}</span>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 p-2">
        {NAV.filter((n) => role && n.roles.includes(role)).map((n) => {
          const active = pathname.startsWith(n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              prefetch
              className={cn(
                "group flex h-9 items-center gap-3 rounded-md px-3 text-sm transition-colors",
                active ? "bg-background font-medium text-foreground shadow-xs ring-1 ring-border" : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
              )}
            >
              <n.icon className={cn("size-4", active && "text-brand")} />
              <span className="flex-1">{n.label}</span>
              <Kbd className="opacity-0 transition-opacity group-hover:opacity-100">{n.shortcut}</Kbd>
            </Link>
          );
        })}
      </nav>
      <div className="p-4 text-[11px] text-muted-foreground">
        <Kbd>Ctrl</Kbd> <Kbd>K</Kbd> para buscar
      </div>
    </aside>
  );
}
