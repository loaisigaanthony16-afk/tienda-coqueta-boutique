import type { Repository } from "./repository";

// Implementación real pendiente (ver supabase/schema.sql).
export class SupabaseRepository {
  constructor() {
    throw new Error("SupabaseRepository aún no está implementado");
  }
}
export const SupabaseRepositoryImpl = SupabaseRepository as unknown as new () => Repository;
