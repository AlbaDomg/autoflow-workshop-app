import fs from 'fs';
import path from 'path';

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const filePath = path.join(process.cwd(), 'clients-db.json');
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const clients = JSON.parse(content);
      return res.status(200).json({ success: true, count: clients.length, clients });
    }
  } catch (e) {
    console.error('Error leyendo clients-db.json en Vercel:', e);
  }

  return res.status(200).json({ success: true, count: 0, clients: [] });
}

