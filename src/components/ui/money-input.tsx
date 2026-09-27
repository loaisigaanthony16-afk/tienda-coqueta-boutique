"use client";
import * as React from "react";
import { toCents } from "@/domain/money";
import type { Cents } from "@/domain/types";
import { cn } from "@/lib/utils";
import { Input } from "./input";

/**
 * Campo de dinero. Muestra texto libre mientras se escribe y entrega
 * centavos (o null si está vacío / inválido) al padre.
 */
function MoneyInput({
  value,
  onValueChange,
  className,
  ...props
}: Omit<React.ComponentProps<"input">, "value" | "onChange" | "type"> & {
  value: Cents | null;
  onValueChange: (cents: Cents | null) => void;
}) {
  const [text, setText] = React.useState(value == null ? "" : (value / 100).toFixed(2));
  const last = React.useRef(value);
  React.useEffect(() => {
    if (value !== last.current) {
      last.current = value;
      setText(value == null ? "" : (value / 100).toFixed(2));
    }
  }, [value]);
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">$</span>
      <Input
        inputMode="decimal"
        autoComplete="off"
        className={cn("pl-6 tabular", className)}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const c = toCents(e.target.value);
          const next = Number.isNaN(c) ? null : Math.max(0, c);
          last.current = next;
          onValueChange(next);
        }}
        onFocus={(e) => e.target.select()}
        {...props}
      />
    </div>
  );
}

export { MoneyInput };
