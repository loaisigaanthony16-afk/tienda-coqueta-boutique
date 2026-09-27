"use client";
import { LogOut, UserRound } from "lucide-react";
import { useSession } from "@/stores/session";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoRow } from "./shared";

const ROLE_LABEL = { admin: "Administración", cashier: "Caja" } as const;

export function SessionCard() {
  const user = useSession((s) => s.user);
  const mode = useSession((s) => s.mode);
  const signOut = useSession((s) => s.signOut);
  if (!user) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserRound className="size-4 text-muted-foreground" /> Sesión
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <dl className="divide-y">
          <InfoRow label="Usuario" value={user.fullName} />
          <InfoRow
            label="Rol"
            value={<Badge variant={user.role === "admin" ? "brand" : "secondary"}>{ROLE_LABEL[user.role]}</Badge>}
          />
          <InfoRow label="Datos" value={mode === "demo" ? "Demostración (local)" : "Supabase (en la nube)"} />
        </dl>
        <Button variant="outline" className="self-start" onClick={() => void signOut()}>
          <LogOut /> Cerrar sesión
        </Button>
      </CardContent>
    </Card>
  );
}
