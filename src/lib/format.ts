import { STORE } from "./config";

const dateTime = new Intl.DateTimeFormat(STORE.locale, { dateStyle: "short", timeStyle: "short" });
const dateOnly = new Intl.DateTimeFormat(STORE.locale, { day: "2-digit", month: "short", year: "numeric" });
const timeOnly = new Intl.DateTimeFormat(STORE.locale, { hour: "2-digit", minute: "2-digit" });

export const formatDateTime = (iso: string) => dateTime.format(new Date(iso));
export const formatDate = (iso: string) => dateOnly.format(new Date(iso));
export const formatTime = (iso: string) => timeOnly.format(new Date(iso));

/** Rango [inicio del día, inicio del día siguiente) en hora local, en ISO. */
export function dayRange(d = new Date(), days = 1) {
  const from = new Date(d);
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + days);
  return { from: from.toISOString(), to: to.toISOString() };
}

export function variantLabel(v: { size: string | null; color: string | null }) {
  return [v.size, v.color].filter(Boolean).join(" / ");
}
