import { getStats } from './dashboard.service.js';

export async function stats(req, res) {
  const data = await getStats(req.user.id);
  return res.json({ data, meta: {}, error: null });
}
