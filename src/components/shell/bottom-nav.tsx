"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "@/stores/session";
import { cn } from "@/lib/utils";
import { NAV } from "./nav";

export function BottomNav() {
  const pathname = usePathname();
  const role = useSession((s) => s.user?.role);
  const items = NAV.filter((n) => n.mobile && role && n.roles.includes(role));
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      aria-label="Navegación principal"
    >
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((n) => {
          const active = pathname.startsWith(n.href);
          return (
            <li key={n.href}>
              <Link
                href={n.href}
                className={cn(
                  "flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium",
                  active ? "text-foreground" : "text-muted-foreground",
                )}
              >
                <n.icon className={cn("size-5", active && "text-brand")} />
                {n.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
