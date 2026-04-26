import * as authService from './auth.service.js';

export async function register(req, res) {
  const result = await authService.register(req.body);
  return res.status(201).json({ data: result, meta: {}, error: null });
}

export async function login(req, res) {
  const result = await authService.login(req.body);
  return res.json({ data: result, meta: {}, error: null });
}

export async function refresh(req, res) {
  const result = await authService.refresh(req.body);
  return res.json({ data: result, meta: {}, error: null });
}

export async function logout(req, res) {
  const result = await authService.logout(req.body);
  return res.json({ data: result, meta: {}, error: null });
}

export async function me(req, res) {
  const result = await authService.me(req.user.sub);
  return res.json({ data: result, meta: {}, error: null });
}
