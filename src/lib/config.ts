/** Configuración de negocio. Un solo lugar para nombre, moneda e impuestos. */
export const STORE = {
  name: "Tienda Coqueta Boutique",
  shortName: "Coqueta",
  legalName: "Tienda Coqueta Boutique",
  taxId: "RUC J0000000000000",
  address: "Managua, Nicaragua",
  phone: "+505 0000 0000",
  currency: "USD",
  locale: "es-NI",
  /** Tasa de IVA en puntos básicos (1500 = 15%). */
  taxRateBps: 1500,
  /** Los precios de etiqueta ya incluyen IVA. */
  pricesIncludeTax: true,
  receiptFooter: "¡Gracias por tu compra! Cambios dentro de 15 días con ticket.",
  /** Denominaciones para atajos de efectivo, en centavos. */
  cashDenominations: [100, 500, 1000, 2000, 5000, 10000],
  lowStockDefault: 3,
} as const;
