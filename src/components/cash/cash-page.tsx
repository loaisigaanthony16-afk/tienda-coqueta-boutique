"use client";
import * as React from "react";
import { toast } from "sonner";
import { History, Wallet } from "lucide-react";
import { useRegister } from "@/stores/register";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CloseRegisterDialog, type CloseSnapshot } from "./close-register-dialog";
import { OpenRegisterView } from "./open-register";
import { RegisterDashboard } from "./register-dashboard";
import { RegisterHistory } from "./register-history";
import { errorMessage, useProfileNames } from "./shared";

/** Pantalla /caja: apertura, arqueo en vivo, movimientos, cortes X/Z e historial. */
export function CashPage() {
  const loaded = useRegister((s) => s.loaded);
  const register = useRegister((s) => s.register);
  const refresh = useRegister((s) => s.refresh);
  const nameOf = useProfileNames();
  const [tab, setTab] = React.useState("caja");
  const [closing, setClosing] = React.useState<CloseSnapshot | null>(null);
  const [preparing, setPreparing] = React.useState(false);

  const cashierName = register ? nameOf(register.openedBy) : "";

  // Refresca al entrar para ver ventas hechas en otras pestañas/equipos.
  React.useEffect(() => {
    void refresh().catch(() => undefined);
  }, [refresh]);

  const requestClose = async () => {
    setPreparing(true);
    try {
      await refresh();
      const s = useRegister.getState();
      if (!s.register || !s.summary) {
        toast.info("La caja ya está cerrada.");
        return;
      }
      setClosing({ register: s.register, summary: s.summary, cashierName: nameOf(s.register.openedBy) });
    } catch (e) {
      toast.error("No se pudo preparar el cierre", { description: errorMessage(e) });
    } finally {
      setPreparing(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 md:p-6">
      <Tabs value={tab} onValueChange={setTab} className="gap-5">
        <TabsList className="h-10 self-center sm:self-start">
          <TabsTrigger value="caja" className="px-4">
            <Wallet /> Caja
          </TabsTrigger>
          <TabsTrigger value="historial" className="px-4">
            <History /> Historial
          </TabsTrigger>
        </TabsList>

        <TabsContent value="caja">
          {!loaded ? (
            <div className="mx-auto flex w-full max-w-xl flex-col gap-3">
              <Skeleton className="h-72" />
              <Skeleton className="h-16" />
            </div>
          ) : register ? (
            <RegisterDashboard cashierName={cashierName} onRequestClose={requestClose} closing={preparing} />
          ) : (
            <OpenRegisterView />
          )}
        </TabsContent>

        <TabsContent value="historial">
          <RegisterHistory reloadKey={register?.id ?? "none"} />
        </TabsContent>
      </Tabs>

      {closing && (
        <CloseRegisterDialog key={closing.register.id} snapshot={closing} onClose={() => setClosing(null)} />
      )}
    </div>
  );
}
