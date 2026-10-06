import { Pool } from "pg";
import { SCHEMA_STATEMENTS } from "@/db/schema";
import type { Row, Store, Table, Tx } from "@/db/store";

type Executor = {
  query: (sql: string, values?: unknown[]) => Promise<{ rows: unknown[] }>;
};

/** A coluna image_data (foto em texto, pesada) fica de fora das listagens. */
const COLUMNS: Record<Table, string> = {
  mi_categories: "*",
  mi_toys:
    "id, category_id, name, detail, description, bonus, price_cents, stock, image_url, component_ids, available, featured, position, created_at",
  mi_regions: "*",
  mi_rentals: "*",
  mi_transactions: "*",
};

const JSON_COLUMNS = new Set(["component_ids", "items"]);

function param(column: string, value: unknown) {
  return JSON_COLUMNS.has(column) ? JSON.stringify(value) : value;
}

function cast(column: string) {
  return JSON_COLUMNS.has(column) ? "::jsonb" : "";
}

function txFor(executor: Executor): Tx {
  return {
    async all<T>(table: Table) {
      const result = await executor.query(`SELECT ${COLUMNS[table]} FROM ${table} ORDER BY id`);
      return result.rows as T[];
    },
    async insert<T>(table: Table, values: Row) {
      const columns = Object.keys(values);
      const marks = columns.map((column, index) => `$${index + 1}${cast(column)}`);
      const result = await executor.query(
        `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${marks.join(", ")}) RETURNING ${COLUMNS[table]}`,
        columns.map((column) => param(column, values[column])),
      );
      return result.rows[0] as T;
    },
    async update(table: Table, id: number, values: Row) {
      const columns = Object.keys(values);
      if (columns.length === 0) return;
      const sets = columns.map((column, index) => `${column} = $${index + 2}${cast(column)}`);
      await executor.query(`UPDATE ${table} SET ${sets.join(", ")} WHERE id = $1`, [
        id,
        ...columns.map((column) => param(column, values[column])),
      ]);
    },
    async remove(table: Table, id: number) {
      await executor.query(`DELETE FROM ${table} WHERE id = $1`, [id]);
    },
    async settings() {
      const result = await executor.query("SELECT key, value FROM mi_settings");
      const map: Record<string, string> = {};
      for (const row of result.rows as { key: string; value: string }[]) map[row.key] = row.value;
      return map;
    },
    async setSetting(key: string, value: string) {
      await executor.query(
        `INSERT INTO mi_settings (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [key, value],
      );
    },
    async getImage(toyId: number) {
      const result = await executor.query("SELECT image_data FROM mi_toys WHERE id = $1", [toyId]);
      const row = result.rows[0] as { image_data: string | null } | undefined;
      return row?.image_data ?? null;
    },
    async setImage(toyId: number, data: string | null) {
      await executor.query("UPDATE mi_toys SET image_data = $2 WHERE id = $1", [toyId, data]);
    },
  };
}

export function createPostgresStore(databaseUrl: string): Store {
  const pool = new Pool({ connectionString: databaseUrl, max: 5 });
  const poolExecutor = pool as unknown as Executor;

  async function transaction<T>(run: (executor: Executor) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    const executor = client as unknown as Executor;
    try {
      await executor.query("BEGIN");
      // uma alteração por vez (vale também entre vários servidores)
      await executor.query("SELECT pg_advisory_xact_lock(20261004)");
      const result = await run(executor);
      await executor.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await executor.query("ROLLBACK");
      } catch {
        /* conexão já perdida */
      }
      throw error;
    } finally {
      client.release();
    }
  }

  return {
    kind: "postgres",
    async init() {
      await transaction(async (executor) => {
        for (const statement of SCHEMA_STATEMENTS) await executor.query(statement);
      });
    },
    read(run) {
      return run(txFor(poolExecutor));
    },
    write(run) {
      return transaction((executor) => run(txFor(executor)));
    },
  };
}
