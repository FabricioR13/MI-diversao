/**
 * Onde os dados ficam guardados.
 *
 * O sistema funciona com dois "armazenamentos" que oferecem as mesmas operações:
 *  - PostgreSQL, quando existe DATABASE_URL (site publicado);
 *  - um arquivo local (.dados/mi-diversao.json), quando não existe — assim o
 *    projeto roda no computador sem instalar banco nenhum.
 *
 * Toda a regra de negócio (src/db/queries.ts) conversa só com esta interface.
 */

export type Table = "mi_categories" | "mi_toys" | "mi_regions" | "mi_rentals" | "mi_transactions";

export type Row = Record<string, unknown>;

/** Operações disponíveis dentro de uma leitura ou gravação. */
export interface Tx {
  /** Todas as linhas da tabela, em ordem de id. */
  all<T>(table: Table): Promise<T[]>;
  /** Insere e devolve a linha criada (com id). Informe todas as colunas. */
  insert<T>(table: Table, values: Row): Promise<T>;
  update(table: Table, id: number, values: Row): Promise<void>;
  remove(table: Table, id: number): Promise<void>;
  /** Configurações (chave → valor). */
  settings(): Promise<Record<string, string>>;
  setSetting(key: string, value: string): Promise<void>;
  /** Foto enviada pelo painel (data URL) ou null. */
  getImage(toyId: number): Promise<string | null>;
  setImage(toyId: number, data: string | null): Promise<void>;
}

export interface Store {
  kind: "postgres" | "arquivo" | "navegador";
  /** Prepara o armazenamento (cria tabelas, lê o arquivo...). */
  init(): Promise<void>;
  /** Consulta sem alterar nada. */
  read<T>(run: (tx: Tx) => Promise<T>): Promise<T>;
  /**
   * Alteração "tudo ou nada", uma de cada vez — é o que impede dois clientes
   * de reservarem o mesmo brinquedo no mesmo instante.
   */
  write<T>(run: (tx: Tx) => Promise<T>): Promise<T>;
}
