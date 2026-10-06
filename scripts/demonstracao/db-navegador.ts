import { createLocalStore } from "@/db/store-local";
import type { Store } from "@/db/store";

/** Na demonstração os dados ficam guardados no próprio navegador. */
export const DEMO_STORAGE_KEY = "mi-diversao-demonstracao-v1";

let memory: string | null = null;
let store: Store | null = null;

export function getStore(): Store {
  if (!store) {
    store = createLocalStore("navegador", {
      load() {
        try {
          return localStorage.getItem(DEMO_STORAGE_KEY) ?? memory;
        } catch {
          return memory;
        }
      },
      save(text) {
        memory = text;
        try {
          localStorage.setItem(DEMO_STORAGE_KEY, text);
        } catch {
          /* navegador sem espaço ou em modo restrito: segue só na memória */
        }
      },
    });
  }
  return store;
}
