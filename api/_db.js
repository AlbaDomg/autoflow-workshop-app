import fs from 'fs';
import path from 'path';

const TMP_CLIENTS_FILE = path.join('/tmp', 'clients-db.json');
const STATIC_CLIENTS_FILE = path.join(process.cwd(), 'clients-db.json');

const TMP_ORDERS_FILE = path.join('/tmp', 'orders-db.json');
const STATIC_ORDERS_FILE = path.join(process.cwd(), 'orders-db.json');

export function getDbUrl() {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.STORAGE_DATABASE_URL ||
    process.env.STORAGE_POSTGRES_URL ||
    process.env.STORAGE_URL ||
    process.env.NEON_DATABASE_URL ||
    ''
  ).trim();
}

export function isCloudDbActive() {
  return Boolean(getDbUrl());
}

let tableInitialized = false;

async function getNeonSql() {
  const url = getDbUrl();
  if (!url) return null;
  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(url);
  if (!tableInitialized) {
    await sql`
      CREATE TABLE IF NOT EXISTS autoflow_store (
        key TEXT PRIMARY KEY,
        data JSONB NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    tableInitialized = true;
  }
  return sql;
}

function readStaticClientsFallback() {
  try {
    if (fs.existsSync(TMP_CLIENTS_FILE)) {
      const data = JSON.parse(fs.readFileSync(TMP_CLIENTS_FILE, 'utf-8'));
      if (Array.isArray(data)) return data;
    }
  } catch {}
  try {
    if (fs.existsSync(STATIC_CLIENTS_FILE)) {
      const data = JSON.parse(fs.readFileSync(STATIC_CLIENTS_FILE, 'utf-8'));
      if (Array.isArray(data)) return data;
    }
  } catch {}
  return [];
}

function readStaticOrdersFallback() {
  try {
    if (fs.existsSync(TMP_ORDERS_FILE)) {
      const data = JSON.parse(fs.readFileSync(TMP_ORDERS_FILE, 'utf-8'));
      if (Array.isArray(data)) return data;
    }
  } catch {}
  try {
    if (fs.existsSync(STATIC_ORDERS_FILE)) {
      const data = JSON.parse(fs.readFileSync(STATIC_ORDERS_FILE, 'utf-8'));
      if (Array.isArray(data)) return data;
    }
  } catch {}
  return [];
}

export async function getClientsDb() {
  try {
    const sql = await getNeonSql();
    if (sql) {
      const rows = await sql`SELECT data FROM autoflow_store WHERE key = 'clients' LIMIT 1`;
      if (rows.length > 0 && Array.isArray(rows[0].data)) {
        return rows[0].data;
      }
      const initial = readStaticClientsFallback();
      await sql`
        INSERT INTO autoflow_store (key, data, updated_at)
        VALUES ('clients', ${JSON.stringify(initial)}::jsonb, NOW())
        ON CONFLICT (key) DO NOTHING
      `;
      return initial;
    }
  } catch (err) {
    console.warn('Error leyendo clients de Neon DB, usando fallback:', err.message);
  }
  return readStaticClientsFallback();
}

export async function saveClientsDb(clients) {
  if (!Array.isArray(clients)) return;
  try {
    const sql = await getNeonSql();
    if (sql) {
      await sql`
        INSERT INTO autoflow_store (key, data, updated_at)
        VALUES ('clients', ${JSON.stringify(clients)}::jsonb, NOW())
        ON CONFLICT (key) DO UPDATE
        SET data = EXCLUDED.data, updated_at = NOW()
      `;
    }
  } catch (err) {
    console.warn('Error guardando clients en Neon DB:', err.message);
  }
  try {
    fs.writeFileSync(TMP_CLIENTS_FILE, JSON.stringify(clients, null, 2), 'utf-8');
  } catch {}
  try {
    fs.writeFileSync(STATIC_CLIENTS_FILE, JSON.stringify(clients, null, 2), 'utf-8');
  } catch {}
}

export async function getOrdersDb() {
  try {
    const sql = await getNeonSql();
    if (sql) {
      const rows = await sql`SELECT data FROM autoflow_store WHERE key = 'orders' LIMIT 1`;
      if (rows.length > 0 && Array.isArray(rows[0].data)) {
        return rows[0].data;
      }
      const initial = readStaticOrdersFallback();
      await sql`
        INSERT INTO autoflow_store (key, data, updated_at)
        VALUES ('orders', ${JSON.stringify(initial)}::jsonb, NOW())
        ON CONFLICT (key) DO NOTHING
      `;
      return initial;
    }
  } catch (err) {
    console.warn('Error leyendo orders de Neon DB, usando fallback:', err.message);
  }
  return readStaticOrdersFallback();
}

export async function saveOrdersDb(orders) {
  if (!Array.isArray(orders)) return;
  try {
    const sql = await getNeonSql();
    if (sql) {
      await sql`
        INSERT INTO autoflow_store (key, data, updated_at)
        VALUES ('orders', ${JSON.stringify(orders)}::jsonb, NOW())
        ON CONFLICT (key) DO UPDATE
        SET data = EXCLUDED.data, updated_at = NOW()
      `;
    }
  } catch (err) {
    console.warn('Error guardando orders en Neon DB:', err.message);
  }
  try {
    fs.writeFileSync(TMP_ORDERS_FILE, JSON.stringify(orders, null, 2), 'utf-8');
  } catch {}
  try {
    fs.writeFileSync(STATIC_ORDERS_FILE, JSON.stringify(orders, null, 2), 'utf-8');
  } catch {}
}
