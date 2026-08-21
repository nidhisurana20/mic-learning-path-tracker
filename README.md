# MIC Learning Path Tracker — Backend (Option B)

Stage 2, 1st Year (Fresher) submission — **Option B: Backend Only**.

A REST API that tracks free Microsoft certification/learning paths across three
domains (Cloud, AI/Data, Security), computes each cert's state
(`completed` / `available` / `locked`) from a prerequisite graph, lets a user
mark an available cert complete (recomputing what unlocks), and calls an AI
API server-side to explain *why* the newly-available step comes next.

## Tech stack

- **Node.js (v18+) with the built-in `http` module — no framework, no
  dependencies to install.** I chose this deliberately over Express: the
  brief only needs a handful of routes, and skipping `npm install`
  entirely means the grader can run this with zero setup and no risk of a
  flaky install. The tradeoff is I hand-rolled routing/body-parsing
  (`server.js`) instead of getting it from Express — worth calling out
  since Express would normally be the faster way to build this.
- **Storage:** a single JSON file (`data/user-progress.json`), read/written
  synchronously per request. Fine for a take-home; a real system would use
  SQLite/Postgres so writes aren't a full-file rewrite.
- **AI:** calls OpenAI's `chat/completions` or Gemini's `generateContent`
  directly via `fetch` (both built into Node 18+), selected by
  `AI_PROVIDER`. No SDK needed for either.

## Project layout

```
server.js              # HTTP server + routing + all endpoint handlers
src/progressLogic.js    # prerequisite graph -> completed/available/locked (pure functions, no AI)
src/store.js             # JSON-file persistence for per-user completed certs + goal
src/aiClient.js           # server-side-only AI call, prompt building, fallback on failure
data/certs.json            # researched dataset: 3 domains, 12 certs, prerequisites, real MS Learn URLs
data/user-progress.json     # per-user state (starts empty)
postman_collection.json      # every endpoint with example requests/responses
```

## Run it

```bash
node server.js
# MIC Learning Path Tracker API listening on http://localhost:3000
```

To get real AI explanations instead of the fallback text, set an API key
first (see `.env.example`):

```bash
OPENAI_API_KEY=sk-... node server.js
# or
AI_PROVIDER=gemini GEMINI_API_KEY=... node server.js
```

Without a key set, the server still runs fine — `/api/ai/explain` just
returns `"source": "fallback"` instead of `"source": "ai"`.

## Endpoints

| Method | Path | What it does |
|---|---|---|
| GET | `/api/domains` | List the 3 domains |
| GET | `/api/domains/:domainId/certs` | Certs in that domain, prerequisite-ordered (no user context — shows the path shape) |
| GET | `/api/users/:userId/progress/:domainId` | That user's completed/available/locked state for one domain |
| GET | `/api/users/:userId/progress` | Same, across all domains at once |
| PUT | `/api/users/:userId/goal` | Store a free-text goal (used as extra AI context) |
| POST | `/api/users/:userId/complete` | Mark an *available* cert complete; recomputes and returns what's newly unlocked |
| POST | `/api/ai/explain` | AI explains why a specific already-available cert is next |

Full example requests/responses for each are in `postman_collection.json` —
import it directly into Postman, or read it as plain docs.

## Design decisions (the things I'd be asked to defend in interview)

**1. The AI never decides the path — my code does, always.**
`progressLogic.js` has zero knowledge of AI and is pure, testable logic: a
cert is `available` iff every id in its `prerequisites` array is in the
user's completed set, and not itself already completed; otherwise it's
`locked` (or `completed`). `/api/ai/explain` re-derives this same check
server-side before calling the AI — it does **not** trust a client-supplied
"this cert is available" claim. The AI is only ever handed a cert my code
already picked, plus what the user just finished and their stated goal, and
asked to write 1–2 encouraging sentences about it. The prompt in
`aiClient.js` explicitly tells it not to suggest a different certification.

**2. Mark-complete is enforced server-side, not just hidden in the UI.**
`POST /complete` checks `isAvailableFn` against the stored completed set at
write time. Trying to complete a locked cert returns `400`; completing an
already-completed cert returns `409`. A malicious or buggy client can't
skip ahead by just calling the endpoint with any cert id.

**3. Prerequisites can be a list, not just a single parent.**
`DP-100` (Azure Data Scientist) requires *both* `DP-900` and `AI-900`.
`SC-100` (Cybersecurity Architect) requires *both* `SC-200` and `SC-300`.
`computeDomainProgress` checks `.every()` over the prerequisite array, so
multi-parent unlocking works, and the topological sort in `topoSortCerts`
guarantees a cert is never listed before something it depends on, even
though the dataset itself only needs to be internally consistent (not
manually pre-sorted).

**4. AI failure never breaks the endpoint.**
`explainStep()` in `aiClient.js` wraps the actual HTTP call in try/catch
with an 8-second timeout (`AbortSignal.timeout`, configurable via
`AI_TIMEOUT_MS`). On any failure — no API key, timeout, non-200 response,
empty content — it logs the reason server-side and returns a plain
templated fallback explanation with `"source": "fallback"` instead of a
500. The client always gets a usable 200 response.

**5. API key never reaches the client.**
The AI call happens entirely inside `aiClient.js`, run from the server
process, reading the key from `process.env`. It's never included in any
response body sent to a client.

## The dataset

Compiled from real, currently-free Microsoft Learn certifications
(`data/certs.json`), grouped into three domains with realistic prerequisite
chains:

- **Cloud:** AZ-900 → (AZ-104 or AZ-204) → AZ-305
- **AI/Data:** AI-900 and DP-900 (independent roots) → AI-102 (needs AI-900) and DP-100 (needs both DP-900 *and* AI-900)
- **Security:** SC-900 → (SC-200 and SC-300) → SC-100 (needs both)

Each entry has an `id`, `name`, `description`, real `url` to the Microsoft
Learn certification page, and a `prerequisites` array of other cert ids.

## What I'd do next with more time

- Move storage from a JSON file to SQLite — mainly to get real concurrent-
  write safety, which this take-home doesn't require but a live version
  would.
- Cache AI explanations per (user, cert) pair so re-fetching progress
  doesn't re-call the AI API for a step already explained.
- Add basic request validation middleware instead of repeating the same
  checks in each handler, and a couple of unit tests for
  `progressLogic.js` (it's pure functions, so it's the cheapest part of
  this to test properly).
