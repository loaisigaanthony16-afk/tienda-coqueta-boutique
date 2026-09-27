"use client";
import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

export function toggleTheme() {
  const dark = document.documentElement.classList.toggle("dark");
  try {
    localStorage.setItem("coqueta.theme", dark ? "dark" : "light");
  } catch {}
}

export function ThemeToggle() {
  return (
    <Button variant="ghost" size="icon" aria-label="Cambiar tema" onClick={toggleTheme}>
      <Sun className="hidden dark:block" />
      <Moon className="dark:hidden" />
    </Button>
  );
}
