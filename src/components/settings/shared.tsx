"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

const noopSubscribe = () => () => {};

/** Valor que solo se conoce en el cliente (false durante SSR/hidratación). */
export function useClientValue<T>(get: () => T, serverValue: T): T {
  return React.useSyncExternalStore(noopSubscribe, get, () => serverValue);
}

/** Fila de ajuste: etiqueta + descripción a la izquierda, control a la derecha. */
export function SettingRow({
  label,
  description,
  htmlFor,
  children,
  className,
}: {
  label: React.ReactNode;
  description?: React.ReactNode;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6", className)}>
      <div className="min-w-0 space-y-0.5">
        <label htmlFor={htmlFor} className="text-sm font-medium">
          {label}
        </label>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}

export function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

export function Note({
  tone = "muted",
  icon,
  children,
}: {
  tone?: "muted" | "warning" | "destructive";
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex gap-2 rounded-lg px-3 py-2.5 text-xs leading-relaxed [&_svg]:mt-0.5 [&_svg]:size-3.5 [&_svg]:shrink-0",
        tone === "muted" && "bg-muted text-muted-foreground",
        tone === "warning" && "bg-warning/12 text-foreground",
        tone === "destructive" && "bg-destructive/10 text-destructive",
      )}
    >
      {icon}
      <div>{children}</div>
    </div>
  );
}
