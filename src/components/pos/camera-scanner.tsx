"use client";
import * as React from "react";
import { CameraOff, Loader2 } from "lucide-react";
import type { Html5Qrcode } from "html5-qrcode";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * Escáner con la cámara (EAN-13 y QR). html5-qrcode se importa bajo demanda
 * solo en el cliente, y la cámara se libera al cerrar el diálogo.
 */
export function CameraScanner({
  open,
  onOpenChange,
  onDetected,
  onClosed,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Devuelve true si el código se aceptó (cierra el diálogo). */
  onDetected: (code: string) => boolean;
  onClosed?: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md gap-4"
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          onClosed?.();
        }}
      >
        <DialogHeader>
          <DialogTitle>Escanear con la cámara</DialogTitle>
          <DialogDescription>Apunta al código de barras o QR de la etiqueta.</DialogDescription>
        </DialogHeader>
        {open && <CameraView onDetected={(c) => onDetected(c) && onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function CameraView({ onDetected }: { onDetected: (code: string) => void }) {
  const elementId = "qr-" + React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [status, setStatus] = React.useState<"starting" | "running" | "error">("starting");
  const [error, setError] = React.useState("");
  const cb = React.useRef(onDetected);
  React.useEffect(() => {
    cb.current = onDetected;
  }, [onDetected]);

  React.useEffect(() => {
    let cancelled = false;
    let scanner: Html5Qrcode | null = null;
    let lastCode = "";
    let lastAt = 0;

    (async () => {
      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
        if (cancelled) return;
        scanner = new Html5Qrcode(elementId, {
          verbose: false,
          formatsToSupport: [Html5QrcodeSupportedFormats.EAN_13, Html5QrcodeSupportedFormats.QR_CODE],
          useBarCodeDetectorIfSupported: true,
        });
        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 12,
            qrbox: (w, h) => {
              const width = Math.floor(Math.min(w * 0.85, 320));
              return { width, height: Math.floor(Math.min(h * 0.6, width * 0.6)) };
            },
          },
          (text) => {
            const now = Date.now();
            // Evita lecturas repetidas del mismo código en ráfaga.
            if (text === lastCode && now - lastAt < 1500) return;
            lastCode = text;
            lastAt = now;
            cb.current(text.trim());
          },
          undefined,
        );
        if (cancelled) {
          await stop(scanner);
          return;
        }
        setStatus("running");
      } catch (e) {
        if (cancelled) return;
        console.error(e);
        setStatus("error");
        const msg = e instanceof Error ? e.message : String(e);
        setError(
          /permission|notallowed/i.test(msg)
            ? "Permiso de cámara denegado. Actívalo en el navegador."
            : /notfound|no camera|requested device/i.test(msg)
              ? "No se encontró una cámara."
              : "No se pudo iniciar la cámara.",
        );
      }
    })();

    return () => {
      cancelled = true;
      if (scanner) void stop(scanner);
    };
  }, [elementId]);

  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg bg-black">
      <div id={elementId} className="size-full [&_video]:!size-full [&_video]:object-cover" />
      {status === "starting" && (
        <div className="absolute inset-0 grid place-items-center text-white/80">
          <Loader2 className="size-6 animate-spin" />
        </div>
      )}
      {status === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center text-sm text-white/90" role="alert">
          <CameraOff className="size-8" />
          {error}
        </div>
      )}
    </div>
  );
}

async function stop(scanner: Html5Qrcode) {
  try {
    if (scanner.isScanning) await scanner.stop();
    scanner.clear();
  } catch {
    // ya detenido
  }
}
