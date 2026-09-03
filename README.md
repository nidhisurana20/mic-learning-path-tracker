# MIC Learning Path Tracker — Backend (Option B, Python/Flask)

Stage 2 submission — 1st Year / Freshers track, Backend Only.

This is a direct port of the Node/Express version to Python/Flask — same
architecture, same logic, same endpoints, same behavior. The brief
explicitly allows either ("Node/Express, Flask, or your choice").

## What this is

An API that tracks a student's progress through free Microsoft certification
paths (Cloud, AI/Data, Security), computes what's `completed` / `available` /
`locked` from a prerequisite graph, and calls an AI API to explain (not
choose) the next step.

## Tech stack

- Python 3 + Flask
- In-memory storage (a plain `dict` per user) — no DB required per the brief
  for Option B. Swappable for a JSON file or real DB later without touching
  the prerequisite logic, since storage is isolated behind `progress_service.py`.
- No frontend framework — this is API-only, demoed via Postman/curl.

## Project structure

```
app.py                          - Flask app entrypoint
routes/api.py                    - all HTTP endpoints (Flask Blueprint)
services/progress_service.py     - prerequisite/locking logic (pure functions, no AI)
services/ai_service.py           - server-side AI call + fallback
data/cert_data.py                 - hand-compiled dataset: domains, certs, prerequisites
postman_collection.json           - example requests for every endpoint
```

## Endpoints

| Method | Path | What it does |
|---|---|---|
| GET | `/api/domains` | List domains (Cloud, AI/Data, Security) |
| GET | `/api/domains/<domain_id>/certs` | Raw cert list for a domain |
| GET | `/api/users/<user_id>/domains/<domain_id>/progress` | Full path with computed status per cert |
| POST | `/api/users/<user_id>/certs/<cert_id>/complete` | Mark a cert complete (only if currently `available`); recomputes what's now unlocked |
| POST | `/api/users/<user_id>/domains/<domain_id>/explain` (body: `{ "goal": "..." }`) | Finds the next available cert in code, asks the AI to explain why, returns `{ cert_id, explanation }` |

## Design decisions / tradeoffs

**Available/locked logic lives entirely in `progress_service.py`.** A cert
is `available` only when every id in its `prerequisites` list is in the
user's completed set; otherwise it's `locked` (or `completed` if already
done). The AI is never consulted for this — `ai_service.py` only receives a
cert that's already been decided and is asked to explain it.

**Why in-memory storage:** the brief explicitly allows it for Option B, and
it keeps the submission focused on the prerequisite logic and the AI
integration rather than a persistence layer. The store is a plain
`dict[user_id, set[cert_id]]`, isolated behind `get_completed_set` /
`mark_cert_complete` — swapping in SQLite or a JSON file later is a
localized change, not a rewrite.

**AI provider is not hard-coded.** `ai_service.py` calls whatever
OpenAI-compatible chat-completions endpoint is set in `.env`
(`AI_API_URL` / `AI_API_KEY` / `AI_MODEL`), so it works with OpenAI directly
or any Gemini/other proxy that speaks the same request shape.

**Failure handling:** the AI call uses `requests`' built-in `timeout=8`
parameter, and every failure path — no API key configured, network error,
timeout, non-200 response, empty response — is caught by a single broad
`except Exception` and falls through to a plain deterministic
`fallback_explanation()`. The endpoint always returns a 200 with usable
JSON, never a raw 500 or a hang.

**Ordering:** within a domain, certs are shown sorted by number of
prerequisites (fewest first), which is a stable and correct topological
order for this dataset since it's a shallow DAG (max depth 2).

## Running it

```bash
python3 -m venv venv
source venv/bin/activate       # on Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env            # optional: add your own AI_API_KEY
python3 app.py                  # listens on :3000 (or $PORT)
```

Without an `AI_API_KEY` set, the `/explain` endpoint still works — it just
always returns the fallback explanation, which is intentional (see failure
handling above) rather than an error.

## Verified manually

```
GET  /api/domains                                      -> 3 domains
GET  /api/domains/cloud/certs                           -> 4 certs, AZ-900 root
GET  /api/users/alice/domains/cloud/progress            -> AZ-900 available, rest locked
POST /api/users/alice/certs/az-900/complete             -> 200, AZ-104 & AZ-204 flip to available
POST /api/users/alice/certs/az-305/complete             -> 409, "Prerequisites not met" (still locked)
POST /api/users/alice/domains/cloud/explain             -> 200, { cert_id: "az-104", explanation, source: "fallback (no API key configured)" }
GET  /api/domains/blockchain/certs                       -> 404, unknown domain
```

## What I'd add with more time

- A real topological sort instead of prerequisite-count ordering, for a
  deeper/branchier dataset.
- Persistent storage (SQLite) so progress survives a server restart.
- Multi-domain progress in a single view (listed as "nice to have" in the brief).
