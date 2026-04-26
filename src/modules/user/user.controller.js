import * as userService from './user.service.js';

export async function getProfile(req, res) {
  const result = await userService.getProfile(req.user.sub);
  return res.json({ data: result, meta: {}, error: null });
}

export async function updateProfile(req, res) {
  const result = await userService.updateProfile(req.user.sub, req.body);
  return res.json({ data: result, meta: {}, error: null });
}
