import { createFileStore } from "@/db/store-file";
import { createPostgresStore } from "@/db/store-postgres";
import type { Store } from "@/db/store";

const globalForDb = globalThis as typeof globalThis & {
  __miDiversaoStore?: Store;
};

/**
 * Com DATABASE_URL usa PostgreSQL; sem ela, um arquivo local.
 * Criado só no primeiro uso, para o build não precisar de banco.
 */
export function getStore(): Store {
  if (!globalForDb.__miDiversaoStore) {
    const databaseUrl = process.env.DATABASE_URL;
    globalForDb.__miDiversaoStore = databaseUrl
      ? createPostgresStore(databaseUrl)
      : createFileStore();
  }
  return globalForDb.__miDiversaoStore;
}
