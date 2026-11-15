import fs from 'fs';
import path from 'path';

const TMP_CLIENTS_FILE = path.join('/tmp', 'clients-db.json');
const STATIC_CLIENTS_FILE = path.join(process.cwd(), 'clients-db.json');

const TMP_ORDERS_FILE = path.join('/tmp', 'orders-db.json');
const STATIC_ORDERS_FILE = path.join(process.cwd(), 'orders-db.json');

export function getClientsDb() {
  try {
    if (fs.existsSync(TMP_CLIENTS_FILE)) {
      const data = JSON.parse(fs.readFileSync(TMP_CLIENTS_FILE, 'utf-8'));
      if (Array.isArray(data)) return data;
    }
  } catch (e) {
    // ignore
  }

  try {
    if (fs.existsSync(STATIC_CLIENTS_FILE)) {
      const data = JSON.parse(fs.readFileSync(STATIC_CLIENTS_FILE, 'utf-8'));
      if (Array.isArray(data)) return data;
    }
  } catch (e) {
    // ignore
  }

  return [];
}

export function saveClientsDb(clients) {
  if (!Array.isArray(clients)) return;
  try {
    fs.writeFileSync(TMP_CLIENTS_FILE, JSON.stringify(clients, null, 2), 'utf-8');
  } catch (e) {
    // ignore
  }
  try {
    fs.writeFileSync(STATIC_CLIENTS_FILE, JSON.stringify(clients, null, 2), 'utf-8');
  } catch (e) {
    // ignore
  }
}

export function getOrdersDb() {
  try {
    if (fs.existsSync(TMP_ORDERS_FILE)) {
      const data = JSON.parse(fs.readFileSync(TMP_ORDERS_FILE, 'utf-8'));
      if (Array.isArray(data)) return data;
    }
  } catch (e) {
    // ignore
  }

  try {
    if (fs.existsSync(STATIC_ORDERS_FILE)) {
      const data = JSON.parse(fs.readFileSync(STATIC_ORDERS_FILE, 'utf-8'));
      if (Array.isArray(data)) return data;
    }
  } catch (e) {
    // ignore
  }

  return [];
}

export function saveOrdersDb(orders) {
  if (!Array.isArray(orders)) return;
  try {
    fs.writeFileSync(TMP_ORDERS_FILE, JSON.stringify(orders, null, 2), 'utf-8');
  } catch (e) {
    // ignore
  }
  try {
    fs.writeFileSync(STATIC_ORDERS_FILE, JSON.stringify(orders, null, 2), 'utf-8');
  } catch (e) {
    // ignore
  }
}

