"use client";
import * as React from "react";
import { Keyboard, ScanBarcode } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Note } from "./shared";

interface ScanResult {
  code: string;
  /** Milisegundos promedio entre teclas. */
  avgMs: number;
  totalMs: number;
  isScanner: boolean;
}

/** Un lector USB/Bluetooth HID "teclea" en ráfaga: < 35 ms entre caracteres. */
const SCANNER_MAX_AVG_MS = 35;
const MIN_SCANNER_LENGTH = 4;

export function ScannerCard() {
  const [value, setValue] = React.useState("");
  const [last, setLast] = React.useState<ScanResult | null>(null);
  const times = React.useRef<number[]>([]);

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      const code = value.trim();
      const t = times.current;
      times.current = [];
      setValue("");
      if (!code) return;
      const totalMs = t.length > 1 ? t[t.length - 1] - t[0] : 0;
      const avgMs = t.length > 1 ? totalMs / (t.length - 1) : Infinity;
      setLast({
        code,
        avgMs,
        totalMs,
        isScanner: code.length >= MIN_SCANNER_LENGTH && avgMs <= SCANNER_MAX_AVG_MS,
      });
      return;
    }
    if (e.key.length === 1) {
      const now = performance.now();
      const t = times.current;
      // Una pausa larga inicia una nueva lectura.
      if (t.length && now - t[t.length - 1] > 500) times.current = [];
      times.current.push(now);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ScanBarcode className="size-4 text-muted-foreground" /> Lector de códigos
        </CardTitle>
        <CardDescription>
          Los lectores USB y Bluetooth funcionan como un teclado: no requieren configuración. Conéctalo, abre el
          punto de venta y escanea; el producto se agrega al carrito.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="space-y-1.5">
          <label htmlFor="scanner-test" className="text-sm font-medium">
            Probar lector
          </label>
          <Input
            id="scanner-test"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Haz clic aquí y escanea una etiqueta"
            autoComplete="off"
            spellCheck={false}
            inputMode="none"
            className="font-mono"
          />
        </div>

        {last ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
            <div className="min-w-0">
              <p className="truncate font-mono text-sm font-medium">{last.code}</p>
              <p className="text-xs text-muted-foreground tabular">
                {last.code.length} caracteres
                {Number.isFinite(last.avgMs) && ` · ${Math.round(last.avgMs)} ms por carácter`}
              </p>
            </div>
            {last.isScanner ? (
              <Badge variant="success">
                <ScanBarcode /> Lector detectado
              </Badge>
            ) : (
              <Badge variant="secondary">
                <Keyboard /> Escritura manual
              </Badge>
            )}
          </div>
        ) : (
          <Note>
            El lector debe enviar <strong>Enter</strong> al final de cada código (viene así de fábrica). Si los
            códigos aparecen con letras cambiadas, configura el lector con distribución de teclado en español o
            inglés igual que la computadora.
          </Note>
        )}
      </CardContent>
    </Card>
  );
}
