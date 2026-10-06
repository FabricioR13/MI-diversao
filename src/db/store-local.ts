import type { Row, Store, Table, Tx } from "@/db/store";

/**
 * Armazenamento simples em memória, gravado como um único texto JSON.
 * Quem decide onde esse texto mora é a "persistência": um arquivo no
 * computador (store-file.ts) ou o próprio navegador (demonstração).
 */

export type Persistence = {
  load(): string | null;
  save(text: string): void;
  /** Muda quando o conteúdo foi alterado por fora (ex.: data de modificação do arquivo). */
  stamp?(): number;
};

type Data = {
  seq: Record<string, number>;
  tables: Record<Table, Row[]>;
  settings: Record<string, string>;
  images: Record<string, string>;
};

const TABLES: Table[] = ["mi_categories", "mi_toys", "mi_regions", "mi_rentals", "mi_transactions"];

function emptyData(): Data {
  return {
    seq: {},
    tables: {
      mi_categories: [],
      mi_toys: [],
      mi_regions: [],
      mi_rentals: [],
      mi_transactions: [],
    },
    settings: {},
    images: {},
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function parse(text: string | null): Data {
  const data = emptyData();
  if (!text) return data;
  try {
    const saved = JSON.parse(text) as Partial<Data>;
    if (saved.seq) data.seq = saved.seq;
    if (saved.settings) data.settings = saved.settings;
    if (saved.images) data.images = saved.images;
    for (const table of TABLES) {
      const rows = saved.tables?.[table];
      if (Array.isArray(rows)) data.tables[table] = rows;
    }
  } catch {
    /* arquivo corrompido: começa do zero (os dados iniciais são recriados) */
  }
  return data;
}

export function createLocalStore(kind: "arquivo" | "navegador", persistence: Persistence): Store {
  let data: Data | null = null;
  let seenStamp = -1;
  let queue: Promise<unknown> = Promise.resolve();

  function current(): Data {
    const stamp = persistence.stamp ? persistence.stamp() : 0;
    if (!data || stamp !== seenStamp) {
      data = parse(persistence.load());
      seenStamp = stamp;
    }
    return data;
  }

  function txFor(target: Data): Tx {
    return {
      async all<T>(table: Table) {
        return clone(target.tables[table]).sort((a, b) => Number(a.id) - Number(b.id)) as T[];
      },
      async insert<T>(table: Table, values: Row) {
        const id = (target.seq[table] ?? 0) + 1;
        target.seq[table] = id;
        const row: Row = { id, ...clone(values) };
        if (table !== "mi_categories" && table !== "mi_regions" && row.created_at === undefined) {
          row.created_at = new Date().toISOString();
        }
        target.tables[table].push(row);
        return clone(row) as T;
      },
      async update(table: Table, id: number, values: Row) {
        const row = target.tables[table].find((r) => r.id === id);
        if (row) Object.assign(row, clone(values));
      },
      async remove(table: Table, id: number) {
        target.tables[table] = target.tables[table].filter((r) => r.id !== id);
        if (table === "mi_toys") delete target.images[String(id)];
      },
      async settings() {
        return { ...target.settings };
      },
      async setSetting(key: string, value: string) {
        target.settings[key] = value;
      },
      async getImage(toyId: number) {
        return target.images[String(toyId)] ?? null;
      },
      async setImage(toyId: number, image: string | null) {
        if (image) target.images[String(toyId)] = image;
        else delete target.images[String(toyId)];
      },
    };
  }

  return {
    kind,
    async init() {
      current();
    },
    read(run) {
      return run(txFor(current()));
    },
    write<T>(run: (tx: Tx) => Promise<T>): Promise<T> {
      const job = queue.then(async () => {
        const target = current();
        const backup = JSON.stringify(target);
        try {
          const result = await run(txFor(target));
          persistence.save(JSON.stringify(target));
          seenStamp = persistence.stamp ? persistence.stamp() : 0;
          return result;
        } catch (error) {
          data = parse(backup);
          throw error;
        }
      });
      queue = job.catch(() => undefined);
      return job;
    },
  };
}
