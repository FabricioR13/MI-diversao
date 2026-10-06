/**
 * Estrutura do banco (PostgreSQL).
 * As tabelas são criadas sozinhas na primeira vez que o site roda (ver seed.ts),
 * então não é preciso rodar migração manualmente.
 *
 * Datas de reserva são guardadas como texto AAAA-MM-DD para não sofrer com fuso horário.
 */
export const SCHEMA_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS mi_categories (
    id SERIAL PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    emoji TEXT NOT NULL DEFAULT '🎈',
    description TEXT NOT NULL DEFAULT '',
    position INTEGER NOT NULL DEFAULT 0
  )`,

  `CREATE TABLE IF NOT EXISTS mi_toys (
    id SERIAL PRIMARY KEY,
    category_id INTEGER NOT NULL REFERENCES mi_categories(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    bonus TEXT NOT NULL DEFAULT '',
    price_cents INTEGER NOT NULL,
    stock INTEGER NOT NULL DEFAULT 1,
    image_url TEXT NOT NULL DEFAULT '',
    image_data TEXT,
    component_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    available BOOLEAN NOT NULL DEFAULT TRUE,
    featured BOOLEAN NOT NULL DEFAULT FALSE,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS mi_regions (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    fee_cents INTEGER NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    position INTEGER NOT NULL DEFAULT 0
  )`,

  `CREATE TABLE IF NOT EXISTS mi_rentals (
    id SERIAL PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    customer_name TEXT NOT NULL,
    phone TEXT NOT NULL DEFAULT '',
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    days INTEGER NOT NULL DEFAULT 1,
    fulfillment TEXT NOT NULL DEFAULT 'entrega',
    region_name TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    neighborhood TEXT NOT NULL DEFAULT '',
    reference TEXT NOT NULL DEFAULT '',
    delivery_time TEXT NOT NULL DEFAULT '09:00',
    return_time TEXT NOT NULL DEFAULT '21:00',
    custom_times BOOLEAN NOT NULL DEFAULT FALSE,
    payment_method TEXT NOT NULL DEFAULT 'pix',
    notes TEXT NOT NULL DEFAULT '',
    subtotal_cents INTEGER NOT NULL DEFAULT 0,
    delivery_fee_cents INTEGER NOT NULL DEFAULT 0,
    discount_cents INTEGER NOT NULL DEFAULT 0,
    total_cents INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pendente',
    source TEXT NOT NULL DEFAULT 'site',
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,

  `CREATE INDEX IF NOT EXISTS mi_rentals_period_idx ON mi_rentals (start_date, end_date)`,

  `CREATE TABLE IF NOT EXISTS mi_transactions (
    id SERIAL PRIMARY KEY,
    kind TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    date TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT '',
    rental_id INTEGER REFERENCES mi_rentals(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS mi_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT ''
  )`,
];
