import * as postsService from './posts.service.js';

export async function publish(req, res) {
  const result = await postsService.publishPost(req.user.sub, req.body);
  return res.status(201).json({ data: result, meta: {}, error: null });
}

export async function schedule(req, res) {
  const result = await postsService.schedulePost(req.user.sub, req.body);
  return res.status(201).json({ data: result, meta: {}, error: null });
}

export async function list(req, res) {
  const { page, limit, status, platform, from, to } = req.query;
  const result = await postsService.listPosts(req.user.sub, { page, limit, status, platform, from, to });
  return res.json({
    data: result.posts,
    meta: { total: result.total, page, limit },
    error: null,
  });
}

export async function getOne(req, res) {
  const result = await postsService.getPost(req.user.sub, req.params.id);
  return res.json({ data: result, meta: {}, error: null });
}

export async function retry(req, res) {
  const result = await postsService.retryPost(req.user.sub, req.params.id);
  return res.json({ data: result, meta: {}, error: null });
}

export async function remove(req, res) {
  const result = await postsService.deletePost(req.user.sub, req.params.id);
  return res.json({ data: result, meta: {}, error: null });
}
