import fs from "node:fs";
import path from "node:path";
import { createLocalStore } from "@/db/store-local";
import type { Store } from "@/db/store";

/**
 * Guarda tudo em .dados/mi-diversao.json, dentro da pasta do projeto.
 * Bom para testar e demonstrar no computador. Para publicar o site na
 * internet use o PostgreSQL (DATABASE_URL): hospedagens como a Vercel não
 * guardam arquivos entre um acesso e outro.
 */
export function createFileStore(): Store {
  const folder = path.join(process.cwd(), ".dados");
  const file = path.join(folder, "mi-diversao.json");

  return createLocalStore("arquivo", {
    load() {
      try {
        return fs.readFileSync(file, "utf8");
      } catch {
        return null;
      }
    },
    save(text) {
      fs.mkdirSync(folder, { recursive: true });
      const temporary = `${file}.tmp`;
      fs.writeFileSync(temporary, text, "utf8");
      fs.renameSync(temporary, file);
    },
    stamp() {
      try {
        return fs.statSync(file).mtimeMs;
      } catch {
        return 0;
      }
    },
  });
}
