import * as React from "react";
import { Card } from "@/components/ui/card";
import type { Delta } from "@/lib/analytics";
import { cn } from "@/lib/utils";

export function DeltaBadge({ delta, className }: { delta: Delta; className?: string }) {
  if (delta.pct === null) {
    return <span className={cn("text-xs font-medium text-muted-foreground", className)}>Nuevo vs. periodo anterior</span>;
  }
  const up = delta.pct > 0.05;
  const down = delta.pct < -0.05;
  const text = `${Math.abs(delta.pct).toFixed(Math.abs(delta.pct) >= 100 ? 0 : 1)}%`;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs", className)}>
      <span
        className={cn(
          "font-semibold tabular-nums",
          up && "text-success",
          down && "text-destructive",
          !up && !down && "text-muted-foreground",
        )}
      >
        <span aria-hidden>{up ? "▲" : down ? "▼" : "■"}</span> {up ? "+" : down ? "−" : ""}
        {text}
      </span>
      <span className="text-muted-foreground">vs. periodo anterior</span>
    </span>
  );
}

export function KpiCard({
  title,
  value,
  sub,
  delta,
  icon,
}: {
  title: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  delta?: Delta;
  icon?: React.ReactNode;
}) {
  return (
    <Card className="gap-2 py-4">
      <div className="flex items-center justify-between gap-2 px-4">
        <span className="text-sm text-muted-foreground">{title}</span>
        <span className="text-muted-foreground [&_svg]:size-4">{icon}</span>
      </div>
      <div className="min-w-0 px-4">
        <div className="truncate text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
        {sub && <div className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</div>}
      </div>
      {delta && (
        <div className="px-4">
          <DeltaBadge delta={delta} />
        </div>
      )}
    </Card>
  );
}
