# Tienda Coqueta Boutique · POS + ERP

Punto de venta e inventario para boutique de ropa y accesorios. Minimalista, rápido y pensado para pantalla táctil, teclado y lector de códigos.

## Módulos

| Ruta | Módulo | Rol |
| --- | --- | --- |
| `/pos` | Terminal de venta: escáner USB/cámara, carrito, descuentos, cobro en efectivo, tarjeta, transferencia o mixto | Todos |
| `/caja` | Apertura obligatoria, entradas/salidas, arqueo en vivo, corte X y cierre Z | Todos |
| `/ventas` | Historial, reimpresión y anulación (solo admin) | Todos |
| `/inventario` | Productos con matriz talla × color, SKU/EAN‑13 automáticos, ajustes de stock, etiquetas | Admin edita |
| `/reportes` | KPIs, márgenes, top productos, exportación a Excel/PDF | Admin |
| `/ajustes` | Impresora térmica ESC/POS (Bluetooth, USB serial o navegador), lector, datos demo | Todos |

## Arranque rápido

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # pruebas del dominio
```

Sin variables de entorno funciona en **modo demo**: todo vive en el navegador (localStorage) con 27 productos y 30 días de ventas de ejemplo.

- PIN admin: `1234`
- PIN caja: `0000`

Para producción con Supabase, ver [`supabase/README.md`](supabase/README.md) y copiar `.env.example` a `.env.local`.

## Atajos de teclado

| Tecla | Acción |
| --- | --- |
| `Ctrl/Cmd + K` | Buscar producto o acción |
| `F1` `F2` `F3` `F4` `F6` `F7` | Vender, Caja, Ventas, Inventario, Reportes, Ajustes |
| `F9` o `Ctrl + Enter` | Cobrar |
| `Enter` | Confirmar cobro / nueva venta |

## Arquitectura

```
src/
  domain/      Lógica pura en centavos: dinero, precios, pagos, arqueo, códigos (con pruebas)
  data/        Contrato Repository + implementación demo (localStorage) y Supabase
  stores/      Estado con Zustand: sesión, catálogo, caja, carrito
  components/  ui/ (estilo shadcn), shell/, pos/, inventory/, cash/, reports/, sales/, settings/
  lib/         config de la tienda, formato, impresión ESC/POS, exportación, analítica
supabase/      schema.sql (tablas, triggers, RLS, RPC), seed.sql
```

Reglas clave:

- Todo el dinero se maneja en **centavos enteros** con redondeo "mitad lejos de cero", igual que PostgreSQL.
- Los precios incluyen **IVA 15 %** (configurable en `src/lib/config.ts`).
- La venta es **atómica**: el servidor recalcula precios, valida stock y pagos, y descuenta inventario en una sola transacción.
- Una venta anulada devuelve el stock y sale del arqueo.
