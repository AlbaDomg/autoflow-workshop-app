import webhookHandler from './n8n-webhook.js';

export default async function handler(req, res) {
  return webhookHandler(req, res);
}
