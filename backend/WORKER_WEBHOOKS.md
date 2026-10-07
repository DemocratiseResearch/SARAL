# Worker webhook authentication

`POST /webhooks/worker/:service` is a service-to-service endpoint. It now
requires HMAC authentication; Firebase user tokens are not used for this route.
The gateway also rejects stale timestamps and replayed nonces.

## Required configuration

Generate a high-entropy secret once per environment:

```sh
openssl rand -hex 32
```

Store it in the deployment secret manager as `WORKER_WEBHOOK_SECRET` and inject
the **same value** into the gateway and every webhook-producing worker:

- Gateway
- `pdf-parser`, `beamer` (latex and poster workers), `ffmpeg-job`
- `script-gen` and `audio-gen`

The gateway and worker entry points fail startup if the value is absent or
shorter than 32 bytes. Do not commit secrets to
`.env`, compose files, CI logs, or this repository.

For local development, put the same generated value in the ignored gateway
`.env` and backend `.env.shared` files (or export it into every process started
by `Procfile.dev`). The webhook replay guard uses Redis `SET NX`; the gateway
fails closed if Redis is unavailable for nonce claims.

## Signature format

Workers send these headers:

```text
X-Saral-Worker-Timestamp: <Unix seconds>
X-Saral-Worker-Nonce: <32 hex characters>
X-Saral-Worker-Signature: <lowercase hex HMAC-SHA256>
```

The HMAC key is the UTF-8 byte sequence of `WORKER_WEBHOOK_SECRET`. Signed
canonical bytes are:

```text
HTTP_METHOD + "\n" + request-target + "\n" + timestamp + "\n" + nonce + "\n" + raw_body
```

`request-target` is the URL path plus optional query string (no scheme/host).
The signature binds the HTTP method, exact endpoint, time, nonce, and exact body.
The gateway accepts timestamps up to five minutes old (30 seconds future skew),
limits webhook bodies to 1 MiB, and stores each nonce for ten minutes.

## Deployment order

1. Create the secret in the secret manager; configure it for every worker and the
   gateway without putting the value in source control.
2. Deploy workers that sign webhook requests.
3. Deploy the gateway enforcement. Verify unsigned requests receive `401`, a
   valid worker callback succeeds, expired signatures fail, and replaying the
   same nonce fails.
4. Restrict the webhook route to worker network ranges/private ingress as an
   additional layer. HMAC is required even on private networking.

## Payload validation

The handler also verifies the callback's service/step match, allowed status,
existing run, and (for normal steps) that `step_id`, `run_id`, and `step_name`
refer to the same persisted pipeline step. Business-brief callbacks remain on
their dedicated handler path but still pass through the signature middleware.

## Analytics IDOR rollout note

The pipeline analytics routes authorize against the Firebase UID stored in the
Firestore run document. For legacy run documents without `user_id`, authorization
falls back to the owning paper's `paper_metadata.user_id`; if neither owner value
exists, access fails closed. Before rollout, confirm legacy paper metadata has
owner UIDs populated, and backfill from the authoritative Postgres user/paper
relationship where needed. Do not infer ownership from UUID secrecy.
