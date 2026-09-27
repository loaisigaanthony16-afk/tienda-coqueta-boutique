import type { Repository } from "./repository";
import { DemoRepository } from "./demo-repository";

export * from "./repository";

let instance: Repository | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/**
 * Repositorio activo. Con variables de Supabase usa la base real; sin ellas,
 * la demo local. Solo se usa en el cliente.
 */
export async function getRepository(): Promise<Repository> {
  if (instance) return instance;
  if (isSupabaseConfigured()) {
    const { SupabaseRepositoryImpl: SupabaseRepository } = await import("./supabase-repository");
    instance = new SupabaseRepository();
  } else {
    instance = new DemoRepository();
  }
  return instance;
}

/** Acceso síncrono una vez inicializado (lo garantiza <AppProviders/>). */
export function repo(): Repository {
  if (!instance) throw new Error("Repositorio no inicializado");
  return instance;
}
