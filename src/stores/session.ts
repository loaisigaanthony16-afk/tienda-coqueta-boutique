"use client";
import { create } from "zustand";
import type { Profile } from "@/domain/types";
import { getRepository, repo } from "@/data";

interface SessionState {
  status: "loading" | "anonymous" | "authenticated";
  user: Profile | null;
  mode: "demo" | "supabase" | null;
  init(): Promise<void>;
  signIn(identifier: string, secret: string): Promise<void>;
  signOut(): Promise<void>;
}

export const useSession = create<SessionState>((set) => ({
  status: "loading",
  user: null,
  mode: null,
  async init() {
    const r = await getRepository();
    const user = await r.getCurrentUser();
    set({ user, mode: r.mode, status: user ? "authenticated" : "anonymous" });
  },
  async signIn(identifier, secret) {
    const user = await repo().signIn({ identifier, secret });
    set({ user, status: "authenticated" });
  },
  async signOut() {
    await repo().signOut();
    set({ user: null, status: "anonymous" });
  },
}));

export const useIsAdmin = () => useSession((s) => s.user?.role === "admin");
