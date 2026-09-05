# Publication metrics API

Branchpoint uses a private Vercel serverless endpoint to record publication and content metrics.

## Environment variables

Configure these in the Branchpoint Vercel project:

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY` — server-side Supabase secret/service key; never expose this to browsers
- `BRANCHPOINT_METRICS_TOKEN` — random bearer token used to protect the endpoint

## Record a snapshot

```bash
curl -X POST https://branchpoint.space/api/metrics \
  -H "Authorization: Bearer $BRANCHPOINT_METRICS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "publicationSlug": "branchpoint",
    "contentSlug": "indias-rocket-launch-wasnt-the-story",
    "platform": "substack",
    "followers": 1,
    "views": 0,
    "likes": 0,
    "comments": 0,
    "shares": 0
  }'
```

## Read recent snapshots

```bash
curl "https://branchpoint.space/api/metrics?publication=branchpoint" \
  -H "Authorization: Bearer $BRANCHPOINT_METRICS_TOKEN"
```

The database migration intentionally creates no public RLS policies. Reads and writes go through the server-side endpoint only.
