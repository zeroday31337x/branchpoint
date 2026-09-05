const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const METRICS_TOKEN = process.env.BRANCHPOINT_METRICS_TOKEN;

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function authorized(req) {
  if (!METRICS_TOKEN) return false;
  const auth = req.headers.authorization || '';
  return auth === `Bearer ${METRICS_TOKEN}`;
}

async function sb(path, options = {}) {
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    throw new Error('Supabase server configuration is missing');
  }

  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_SECRET_KEY,
      Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = new Error(body?.message || body?.hint || `Supabase request failed: ${response.status}`);
    error.status = response.status;
    error.details = body;
    throw error;
  }
  return body;
}

async function getPublication(slug) {
  const rows = await sb(`publications?slug=eq.${encodeURIComponent(slug)}&select=id,slug,title,kind,canonical_url`, {
    method: 'GET',
    headers: { Prefer: '' }
  });
  return rows?.[0] || null;
}

async function getContentItem(publicationId, slug) {
  if (!slug) return null;
  const rows = await sb(
    `content_items?publication_id=eq.${publicationId}&slug=eq.${encodeURIComponent(slug)}&select=id,slug,title`,
    { method: 'GET', headers: { Prefer: '' } }
  );
  return rows?.[0] || null;
}

export default async function handler(req, res) {
  if (!authorized(req)) {
    return json(res, 401, { ok: false, error: 'Unauthorized' });
  }

  try {
    if (req.method === 'GET') {
      const publicationSlug = req.query?.publication || 'branchpoint';
      const publication = await getPublication(publicationSlug);
      if (!publication) return json(res, 404, { ok: false, error: 'Publication not found' });

      const metrics = await sb(
        `metric_snapshots?publication_id=eq.${publication.id}&select=*&order=captured_at.desc&limit=100`,
        { method: 'GET', headers: { Prefer: '' } }
      );

      return json(res, 200, { ok: true, publication, metrics });
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      return json(res, 405, { ok: false, error: 'Method not allowed' });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const publicationSlug = body.publicationSlug || 'branchpoint';
    const publication = await getPublication(publicationSlug);
    if (!publication) return json(res, 404, { ok: false, error: 'Publication not found' });

    const content = await getContentItem(publication.id, body.contentSlug);

    const allowed = [
      'followers', 'subscribers', 'views', 'impressions', 'likes', 'comments',
      'shares', 'saves', 'clicks', 'conversions', 'revenue_cents'
    ];

    const row = {
      publication_id: publication.id,
      content_item_id: content?.id || null,
      platform: String(body.platform || 'substack').toLowerCase(),
      captured_at: body.capturedAt || new Date().toISOString(),
      metadata: body.metadata || {}
    };

    for (const key of allowed) {
      if (body[key] !== undefined && body[key] !== null) row[key] = Number(body[key]);
    }

    const inserted = await sb('metric_snapshots', {
      method: 'POST',
      body: JSON.stringify(row)
    });

    return json(res, 201, { ok: true, metric: inserted?.[0] || inserted });
  } catch (error) {
    console.error(error);
    return json(res, error.status || 500, {
      ok: false,
      error: error.message || 'Internal server error'
    });
  }
}
