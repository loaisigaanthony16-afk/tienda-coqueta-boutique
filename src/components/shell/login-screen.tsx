"use client";
import * as React from "react";
import { Delete, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { Profile } from "@/domain/types";
import { repo } from "@/data";
import { useSession } from "@/stores/session";
import { STORE } from "@/lib/config";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginScreen() {
  const mode = useSession((s) => s.mode);
  return (
    <div className="grid min-h-dvh place-items-center bg-muted/40 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-brand text-lg font-semibold text-brand-foreground">
            C
          </div>
          <h1 className="text-xl font-semibold tracking-tight">{STORE.name}</h1>
          <p className="text-sm text-muted-foreground">Punto de venta</p>
        </div>
        {mode === "supabase" ? <PasswordLogin /> : <PinLogin />}
      </div>
    </div>
  );
}

function PinLogin() {
  const signIn = useSession((s) => s.signIn);
  const [profiles, setProfiles] = React.useState<Profile[]>([]);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [pin, setPin] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(false);

  React.useEffect(() => {
    repo().listProfiles().then((p) => {
      setProfiles(p);
      if (p.length === 1) setSelected(p[0].id);
    });
  }, []);

  const submit = React.useCallback(
    async (value: string) => {
      if (!selected) return;
      setBusy(true);
      try {
        await signIn(selected, value);
      } catch {
        setError(true);
        setPin("");
        setTimeout(() => setError(false), 400);
      } finally {
        setBusy(false);
      }
    },
    [selected, signIn],
  );

  const press = React.useCallback(
    (d: string) => {
      if (busy) return;
      setPin((p) => {
        const next = (p + d).slice(0, 4);
        if (next.length === 4) void submit(next);
        return next;
      });
    },
    [busy, submit],
  );

  React.useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") setPin((p) => p.slice(0, -1));
      else if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, press]);

  if (!selected) {
    return (
      <div className="grid gap-2">
        <p className="mb-1 text-center text-sm text-muted-foreground">¿Quién atiende?</p>
        {profiles.map((p) => (
          <Button key={p.id} variant="outline" size="xl" className="justify-start bg-background" onClick={() => setSelected(p.id)}>
            <span className="grid size-8 place-items-center rounded-full bg-muted text-sm font-semibold">
              {p.fullName[0]}
            </span>
            <span className="flex-1 text-left">{p.fullName}</span>
            <span className="text-xs text-muted-foreground">{p.role === "admin" ? "Admin" : "Caja"}</span>
          </Button>
        ))}
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Modo demo · PIN admin 1234 · caja 0000
        </p>
      </div>
    );
  }

  const who = profiles.find((p) => p.id === selected);
  return (
    <div className="grid gap-6">
      <div className="text-center">
        <button className="text-sm text-muted-foreground underline-offset-4 hover:underline" onClick={() => { setSelected(null); setPin(""); }}>
          {who?.fullName} · cambiar
        </button>
        <div className="mt-4 flex justify-center gap-3">
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={cn(
                "size-3.5 rounded-full border-2 transition-colors",
                i < pin.length ? "border-foreground bg-foreground" : "border-border",
                error && "border-destructive bg-destructive",
              )}
            />
          ))}
        </div>
        {error && <p className="mt-2 text-xs text-destructive">PIN incorrecto</p>}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <Button key={d} variant="outline" size="xl" className="h-16 bg-background text-xl tabular" onClick={() => press(d)}>
            {d}
          </Button>
        ))}
        <div />
        <Button variant="outline" size="xl" className="h-16 bg-background text-xl" onClick={() => press("0")}>0</Button>
        <Button variant="ghost" size="xl" className="h-16" aria-label="Borrar" onClick={() => setPin((p) => p.slice(0, -1))}>
          {busy ? <Loader2 className="animate-spin" /> : <Delete className="size-5" />}
        </Button>
      </div>
    </div>
  );
}

function PasswordLogin() {
  const signIn = useSession((s) => s.signIn);
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  return (
    <form
      className="grid gap-4 rounded-xl border bg-background p-6"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await signIn(email.trim(), password);
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "No se pudo iniciar sesión");
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="grid gap-2">
        <Label htmlFor="email">Correo</Label>
        <Input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="password">Contraseña</Label>
        <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <Button type="submit" size="lg" disabled={busy}>
        {busy && <Loader2 className="animate-spin" />} Entrar
      </Button>
    </form>
  );
}
