import * as socialAccountsService from './socialAccounts.service.js';

export async function listAccounts(req, res) {
  const result = await socialAccountsService.listAccounts(req.user.sub);
  return res.json({ data: result, meta: {}, error: null });
}

export async function createAccount(req, res) {
  const result = await socialAccountsService.createAccount(req.user.sub, req.body);
  return res.status(201).json({ data: result, meta: {}, error: null });
}

export async function deleteAccount(req, res) {
  const result = await socialAccountsService.deleteAccount(req.user.sub, req.params.id);
  return res.json({ data: result, meta: {}, error: null });
}
