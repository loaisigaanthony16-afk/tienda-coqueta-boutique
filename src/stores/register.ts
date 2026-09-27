"use client";
import { create } from "zustand";
import { summarizeRegister, type RegisterSummary } from "@/domain/cash";
import type { CashMovement, CashRegister, Sale } from "@/domain/types";
import { repo } from "@/data";

interface RegisterState {
  loaded: boolean;
  register: CashRegister | null;
  sales: Sale[];
  movements: CashMovement[];
  summary: RegisterSummary | null;
  refresh(): Promise<void>;
}

export const useRegister = create<RegisterState>((set) => ({
  loaded: false,
  register: null,
  sales: [],
  movements: [],
  summary: null,
  async refresh() {
    const r = repo();
    const register = await r.getOpenRegister();
    if (!register) {
      set({ loaded: true, register: null, sales: [], movements: [], summary: null });
      return;
    }
    const [sales, movements] = await Promise.all([
      r.listSales({ registerId: register.id }),
      r.listCashMovements(register.id),
    ]);
    set({
      loaded: true,
      register,
      sales,
      movements,
      summary: summarizeRegister(register.openingAmount, sales, movements),
    });
  },
}));
