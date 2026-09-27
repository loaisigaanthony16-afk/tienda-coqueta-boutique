"use client";
import * as React from "react";
import { Database, RotateCcw } from "lucide-react";
import { repo } from "@/data";
import { useSession } from "@/stores/session";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** Solo en modo demo: restablece los datos de ejemplo guardados en este navegador. */
export function DataCard() {
  const mode = useSession((s) => s.mode);
  if (mode !== "demo") return null;

  function reset() {
    (repo() as unknown as { reset(): void }).reset();
    location.reload();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="size-4 text-muted-foreground" /> Datos
        </CardTitle>
        <CardDescription>
          Modo demostración: los productos, ventas y cajas se guardan solo en este navegador.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" className="text-destructive hover:text-destructive">
              <RotateCcw /> Restablecer datos de demostración
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Restablecer los datos de demostración?</AlertDialogTitle>
              <AlertDialogDescription>
                Se borrarán todas las ventas, movimientos de caja y cambios de inventario hechos en este
                navegador, y se cargará de nuevo el catálogo de ejemplo. No se puede deshacer.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction className={buttonVariants({ variant: "destructive" })} onClick={reset}>
                Restablecer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
