"use client";
import * as React from "react";
import { toast } from "sonner";
import { Bluetooth, Info, Loader2, Printer, TriangleAlert, Unplug, Usb } from "lucide-react";
import {
  autoReconnectPrinter,
  connectPrinter,
  disconnectPrinter,
  isTransportSupported,
  openCashDrawer,
  printTestPage,
  setPrinterTransport,
  usePrinterSettings,
  usePrinterStatus,
  type PrinterTransportKind,
} from "@/lib/printing";
import { BAUD_RATES } from "@/lib/printing/settings";
import { errorMessage } from "@/lib/printing/service";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Note, SettingRow, useClientValue } from "./shared";

const TRANSPORTS: { value: PrinterTransportKind; label: string; hint: string }[] = [
  { value: "browser", label: "Navegador", hint: "Diálogo de impresión del sistema" },
  { value: "bluetooth", label: "Bluetooth", hint: "Impresora térmica BLE" },
  { value: "serial", label: "USB / Serie", hint: "Impresora conectada por cable" },
];

export function PrinterCard() {
  const [settings, update] = usePrinterSettings();
  const { status, deviceName, error, lastFallbackAt } = usePrinterStatus();
  const [busy, setBusy] = React.useState<null | "connect" | "test" | "drawer">(null);

  const btSupported = useClientValue(() => isTransportSupported("bluetooth"), false);
  const serialSupported = useClientValue(() => isTransportSupported("serial"), false);
  const hydrated = useClientValue(() => true, false);
  const supported: Record<PrinterTransportKind, boolean> = {
    browser: true,
    bluetooth: btSupported,
    serial: serialSupported,
  };
  const hardware = settings.transport !== "browser";
  const transportAvailable = supported[settings.transport];

  // Reconexión silenciosa a un dispositivo ya autorizado.
  React.useEffect(() => {
    void autoReconnectPrinter();
  }, [settings.transport]);

  async function run(kind: NonNullable<typeof busy>, fn: () => Promise<unknown>, ok: string) {
    setBusy(kind);
    try {
      await fn();
      toast.success(ok);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  const statusBadge = (() => {
    if (!hardware) return <Badge variant="secondary">Diálogo del sistema</Badge>;
    if (status === "connecting") return <Badge variant="secondary">Conectando…</Badge>;
    if (status === "printing") return <Badge variant="brand">Imprimiendo…</Badge>;
    if (status === "connected") return <Badge variant="success">Conectada</Badge>;
    if (status === "error") return <Badge variant="destructive">Error</Badge>;
    return <Badge variant="outline">Sin conectar</Badge>;
  })();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <Printer className="size-4 text-muted-foreground" /> Impresora
          </CardTitle>
          {hydrated && statusBadge}
        </div>
        <CardDescription>Tickets de venta y cortes de caja en impresora térmica de 58 u 80 mm.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col">
        <SettingRow label="Conexión" description={TRANSPORTS.find((t) => t.value === settings.transport)?.hint}>
          <Select
            value={settings.transport}
            onValueChange={(v) => void setPrinterTransport(v as PrinterTransportKind)}
          >
            <SelectTrigger className="w-48" aria-label="Conexión">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TRANSPORTS.map((t) => (
                <SelectItem key={t.value} value={t.value} disabled={hydrated && !supported[t.value]}>
                  {t.label}
                  {hydrated && !supported[t.value] ? " (no disponible)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>

        {hydrated && (!btSupported || !serialSupported) && (
          <Note icon={<Info />}>
            {!btSupported && !serialSupported ? (
              <>
                Este navegador no permite conectar impresoras directamente (Safari, iPhone/iPad y Firefox no
                admiten Web Bluetooth ni Web Serial). Usa <strong>Navegador</strong>: el ticket se abre en el
                diálogo de impresión del sistema, compatible con AirPrint y controladores instalados.
              </>
            ) : !btSupported ? (
              <>Bluetooth no está disponible aquí. En Android usa Chrome; en computadora, Chrome o Edge.</>
            ) : (
              <>USB / Serie solo funciona en Chrome o Edge de computadora. En tablets usa Bluetooth.</>
            )}
          </Note>
        )}

        {hardware && (
          <div className="mt-3 flex flex-col gap-3 rounded-lg border p-3">
            <div className="flex items-center gap-3">
              <div className="grid size-9 place-items-center rounded-md bg-muted text-muted-foreground">
                {settings.transport === "bluetooth" ? <Bluetooth className="size-4" /> : <Usb className="size-4" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {deviceName ?? settings.deviceName ?? "Ninguna impresora elegida"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {status === "connected"
                    ? "Lista para imprimir"
                    : settings.deviceName
                      ? "Se reconecta sola al imprimir si sigue autorizada"
                      : "Pulsa «Conectar» y elige tu impresora"}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={!transportAvailable || busy !== null}
                onClick={() => run("connect", () => connectPrinter({ interactive: true }), "Impresora conectada")}
              >
                {busy === "connect" ? <Loader2 className="animate-spin" /> : null}
                Conectar
              </Button>
              {(status === "connected" || settings.deviceName) && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy !== null}
                  onClick={() => run("connect", () => disconnectPrinter(true), "Impresora olvidada")}
                >
                  <Unplug /> Olvidar
                </Button>
              )}
            </div>
            {error && status !== "connected" && (
              <Note tone="destructive" icon={<TriangleAlert />}>
                {error}
              </Note>
            )}
            {lastFallbackAt && (
              <Note tone="warning" icon={<TriangleAlert />}>
                La última impresión falló en la impresora y se usó el diálogo del navegador.
              </Note>
            )}
          </div>
        )}

        <Separator className="my-2" />

        <SettingRow label="Ancho del papel" description={`${settings.paperWidth === 58 ? 32 : 48} caracteres por línea`}>
          <ToggleGroup
            type="single"
            value={String(settings.paperWidth)}
            onValueChange={(v) => v && update({ paperWidth: Number(v) as 58 | 80 })}
          >
            <ToggleGroupItem value="58">58 mm</ToggleGroupItem>
            <ToggleGroupItem value="80">80 mm</ToggleGroupItem>
          </ToggleGroup>
        </SettingRow>

        {hardware && (
          <SettingRow label="Caracteres" description="Página de códigos de la impresora (ESC t)">
            <Select value={settings.charset} onValueChange={(v) => update({ charset: v as typeof settings.charset })}>
              <SelectTrigger className="w-48" aria-label="Caracteres">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pc850">PC850 (ñ y acentos)</SelectItem>
                <SelectItem value="pc858">PC858 (ñ, acentos y €)</SelectItem>
                <SelectItem value="ascii">Sin acentos</SelectItem>
              </SelectContent>
            </Select>
          </SettingRow>
        )}

        {settings.transport === "serial" && (
          <SettingRow label="Velocidad" description="Baudios del puerto serie (USB suele ignorarlo)">
            <Select value={String(settings.baudRate)} onValueChange={(v) => update({ baudRate: Number(v) })}>
              <SelectTrigger className="w-48" aria-label="Velocidad">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BAUD_RATES.map((b) => (
                  <SelectItem key={b} value={String(b)}>
                    {b.toLocaleString("es-NI")} baudios
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingRow>
        )}

        <SettingRow label="Copias" description="La segunda sale marcada como «COPIA»">
          <ToggleGroup
            type="single"
            value={String(settings.copies)}
            onValueChange={(v) => v && update({ copies: Number(v) as 1 | 2 })}
          >
            <ToggleGroupItem value="1">1</ToggleGroupItem>
            <ToggleGroupItem value="2">2</ToggleGroupItem>
          </ToggleGroup>
        </SettingRow>

        <SettingRow label="Imprimir al cobrar" description="Imprime el ticket automáticamente al terminar cada venta" htmlFor="auto-print">
          <Switch id="auto-print" checked={settings.autoPrint} onCheckedChange={(v) => update({ autoPrint: v })} />
        </SettingRow>

        <SettingRow
          label="Abrir gaveta"
          description={
            hardware
              ? "Envía el pulso a la gaveta conectada a la impresora en ventas con efectivo"
              : "Requiere impresora Bluetooth o USB"
          }
          htmlFor="open-drawer"
        >
          <Switch
            id="open-drawer"
            checked={settings.openDrawer}
            disabled={!hardware}
            onCheckedChange={(v) => update({ openDrawer: v })}
          />
        </SettingRow>

        {hardware && (
          <SettingRow label="Código al pie" description="Número de venta como QR o código de barras">
            <Select value={settings.saleCode} onValueChange={(v) => update({ saleCode: v as typeof settings.saleCode })}>
              <SelectTrigger className="w-48" aria-label="Código al pie">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Ninguno</SelectItem>
                <SelectItem value="qr">Código QR</SelectItem>
                <SelectItem value="barcode">Código de barras</SelectItem>
              </SelectContent>
            </Select>
          </SettingRow>
        )}

        <Separator className="my-2" />

        <div className="flex flex-wrap gap-2 pt-2">
          <Button
            variant="outline"
            disabled={busy !== null || !transportAvailable}
            onClick={() => run("test", printTestPage, "Prueba enviada")}
          >
            {busy === "test" ? <Loader2 className="animate-spin" /> : <Printer />}
            Imprimir prueba
          </Button>
          {hardware && settings.openDrawer && (
            <Button
              variant="ghost"
              disabled={busy !== null || !transportAvailable}
              onClick={() => run("drawer", openCashDrawer, "Gaveta abierta")}
            >
              {busy === "drawer" ? <Loader2 className="animate-spin" /> : null}
              Probar gaveta
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
