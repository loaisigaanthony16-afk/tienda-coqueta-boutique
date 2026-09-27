"use client";
import * as React from "react";
import type { Profile } from "@/domain/types";
import { repo } from "@/data";

let cache: Profile[] | null = null;

/** Devuelve una función id → nombre del cajero (con caché en memoria). */
export function useCashierName(): (id: string) => string {
  const [profiles, setProfiles] = React.useState<Profile[] | null>(cache);
  React.useEffect(() => {
    if (cache) return;
    let alive = true;
    repo()
      .listProfiles()
      .then((p) => {
        cache = p;
        if (alive) setProfiles(p);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return React.useMemo(() => {
    const map = new Map((profiles ?? []).map((p) => [p.id, p.fullName]));
    return (id: string) => map.get(id) ?? "—";
  }, [profiles]);
}
