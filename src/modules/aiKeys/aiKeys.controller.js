import * as aiKeysService from './aiKeys.service.js';

export async function getAiKeys(req, res) {
  const result = await aiKeysService.getAiKeys(req.user.sub);
  return res.json({ data: result, meta: {}, error: null });
}

export async function upsertAiKeys(req, res) {
  const result = await aiKeysService.upsertAiKeys(req.user.sub, req.body);
  return res.json({ data: result, meta: {}, error: null });
}
