"use client";
import * as React from "react";

export interface BarcodeScannerOptions {
  /** Desactiva la escucha (p. ej. con un diálogo abierto). */
  enabled?: boolean;
  /** Largo mínimo del código para considerarlo un escaneo. */
  minLength?: number;
  /** Máximo de ms entre teclas para que cuente como ráfaga de lector. */
  maxInterval?: number;
}

/**
 * Atributo que marca un input donde SÍ se aceptan escaneos (el buscador del
 * POS). En cualquier otro campo de texto la ráfaga se ignora.
 */
export const SCANNER_INPUT_ATTR = "data-scanner-input";

function isTextField(el: Element | null): el is HTMLElement {
  if (!el || !(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLSelectElement) return true;
  if (el instanceof HTMLInputElement) {
    const t = el.type;
    return !["button", "checkbox", "radio", "submit", "reset", "range", "color", "file", "image"].includes(t);
  }
  return false;
}

/**
 * Detecta lectores USB/HID tipo "teclado" (keyboard wedge): escriben el
 * código como una ráfaga de teclas muy rápidas (< ~35 ms entre caracteres)
 * y terminan con Enter. Llama a `onScan(code)` y consume ese Enter para que
 * no dispare otras acciones.
 */
export function useBarcodeScanner(onScan: (code: string) => void, opts: BarcodeScannerOptions = {}) {
  const { enabled = true, minLength = 6, maxInterval = 35 } = opts;
  const cb = React.useRef(onScan);
  React.useEffect(() => {
    cb.current = onScan;
  }, [onScan]);

  React.useEffect(() => {
    if (!enabled) return;
    let buffer = "";
    let last = 0;
    // El Enter puede llegar un poco más tarde que los caracteres.
    const enterGrace = Math.max(maxInterval * 3, 100);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) {
        buffer = "";
        return;
      }
      const target = e.target as Element | null;
      if (isTextField(target) && !target.hasAttribute(SCANNER_INPUT_ATTR)) {
        buffer = "";
        return;
      }
      const t = e.timeStamp || performance.now();
      const gap = t - last;

      if (e.key === "Enter") {
        const code = buffer;
        buffer = "";
        if (code.length >= minLength && gap <= enterGrace) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          cb.current(code);
        }
        return;
      }
      if (e.key.length !== 1) {
        if (e.key !== "Shift") buffer = "";
        return;
      }
      buffer = gap <= maxInterval ? buffer + e.key : e.key;
      last = t;
    };

    // Fase de captura en window: corre antes que los manejadores de React.
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [enabled, minLength, maxInterval]);
}
