'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const { computeDomainProgress, findNewlyAvailable } = require('./src/progressLogic');
const store = require('./src/store');
const { explainStep } = require('./src/aiClient');

const PORT = process.env.PORT || 3000;
const { domains, certs } = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'data', 'certs.json'), 'utf8')
);

const certById = new Map(certs.map((c) => [c.id, c]));
const certsByDomain = (domainId) => certs.filter((c) => c.domain === domainId);

// ---------- tiny helpers (no framework, so we roll our own) ----------

function send(res, status, body) {
  const json = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(json),
  });
  res.end(json);
}

function notFound(res, msg = 'Not found') {
  send(res, 404, { error: msg });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      if (!raw.trim()) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

// Matches "/api/users/:userId/progress/:domainId" style routes.
function matchRoute(pattern, pathname) {
  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = pathname.split('/').filter(Boolean);
  if (patternParts.length !== pathParts.length) return null;

  const params = {};
  for (let i = 0; i < patternParts.length; i++) {
    const p = patternParts[i];
    if (p.startsWith(':')) {
      params[p.slice(1)] = decodeURIComponent(pathParts[i]);
    } else if (p !== pathParts[i]) {
      return null;
    }
  }
  return params;
}

// ---------- route handlers ----------

function handleGetDomains(req, res) {
  send(res, 200, { domains });
}

function handleGetDomainCerts(req, res, params) {
  const { domainId } = params;
  if (!domains.some((d) => d.id === domainId)) {
    return notFound(res, `Unknown domain "${domainId}"`);
  }
  const domainCerts = certsByDomain(domainId);
  const emptyProgress = computeDomainProgress(domainCerts, new Set());
  // Without a user context this just shows the path shape (all locked
  // except the roots) — progress endpoints below apply a real user.
  send(res, 200, { domainId, certs: emptyProgress });
}

function handleGetUserDomainProgress(req, res, params) {
  const { userId, domainId } = params;
  if (!domains.some((d) => d.id === domainId)) {
    return notFound(res, `Unknown domain "${domainId}"`);
  }
  const domainCerts = certsByDomain(domainId);
  const completedSet = store.getCompletedSet(userId);
  const progress = computeDomainProgress(domainCerts, completedSet);
  send(res, 200, { userId, domainId, goal: store.getGoal(userId), certs: progress });
}

function handleGetUserAllProgress(req, res, params) {
  const { userId } = params;
  const completedSet = store.getCompletedSet(userId);
  const byDomain = domains.map((d) => ({
    domainId: d.id,
    domainName: d.name,
    certs: computeDomainProgress(certsByDomain(d.id), completedSet),
  }));
  send(res, 200, { userId, goal: store.getGoal(userId), domains: byDomain });
}

async function handleSetGoal(req, res, params) {
  const { userId } = params;
  const body = await readBody(req);
  if (!body.goal || typeof body.goal !== 'string') {
    return send(res, 400, { error: '"goal" (string) is required' });
  }
  store.setGoal(userId, body.goal);
  send(res, 200, { userId, goal: body.goal });
}

async function handleMarkComplete(req, res, params) {
  const { userId } = params;
  const body = await readBody(req);
  const { certId } = body;

  if (!certId || !certById.has(certId)) {
    return send(res, 400, { error: `"certId" is required and must be a known cert id` });
  }

  const cert = certById.get(certId);
  const domainCerts = certsByDomain(cert.domain);

  const isAvailableFn = (completedSetBefore) => {
    if (completedSetBefore.has(certId)) return false;
    return cert.prerequisites.every((p) => completedSetBefore.has(p));
  };

  const result = store.markComplete(userId, certId, isAvailableFn);

  if (!result.ok) {
    const status = result.reason === 'already_completed' ? 409 : 400;
    return send(res, status, {
      error:
        result.reason === 'already_completed'
          ? `"${certId}" is already marked complete for this user.`
          : `"${certId}" is not currently available for this user (prerequisites not met, or it's already locked/completed).`,
      reason: result.reason,
    });
  }

  const newlyAvailable = findNewlyAvailable(domainCerts, result.completedSet, certId);
  const progress = computeDomainProgress(domainCerts, result.completedSet);

  send(res, 200, {
    userId,
    completedCertId: certId,
    domainId: cert.domain,
    newlyAvailable: newlyAvailable.map((c) => ({ id: c.id, name: c.name })),
    progress,
  });
}

async function handleAiExplain(req, res) {
  const body = await readBody(req);
  const { userId, certId, goal } = body;

  if (!userId || !certId) {
    return send(res, 400, { error: '"userId" and "certId" are required' });
  }
  const cert = certById.get(certId);
  if (!cert) {
    return send(res, 400, { error: `Unknown certId "${certId}"` });
  }

  // Server re-derives the state itself rather than trusting the client's
  // claim that this cert is "available" — same rule as /complete.
  const completedSet = store.getCompletedSet(userId);
  if (completedSet.has(certId)) {
    return send(res, 409, { error: `"${certId}" is already completed for this user.` });
  }
  const prereqsMet = cert.prerequisites.every((p) => completedSet.has(p));
  if (!prereqsMet) {
    return send(res, 400, {
      error: `"${certId}" is not yet available for this user — prerequisites aren't complete.`,
    });
  }

  const fromCertId = cert.prerequisites[cert.prerequisites.length - 1];
  const fromCert = fromCertId ? certById.get(fromCertId) : null;
  const effectiveGoal = goal || store.getGoal(userId);

  const { explanation, source } = await explainStep({ cert, fromCert, goal: effectiveGoal });

  send(res, 200, { cert_id: cert.id, explanation, source });
}

// ---------- router table ----------

const routes = [
  { method: 'GET', pattern: '/api/domains', handler: handleGetDomains },
  { method: 'GET', pattern: '/api/domains/:domainId/certs', handler: handleGetDomainCerts },
  {
    method: 'GET',
    pattern: '/api/users/:userId/progress/:domainId',
    handler: handleGetUserDomainProgress,
  },
  { method: 'GET', pattern: '/api/users/:userId/progress', handler: handleGetUserAllProgress },
  { method: 'PUT', pattern: '/api/users/:userId/goal', handler: handleSetGoal },
  { method: 'POST', pattern: '/api/users/:userId/complete', handler: handleMarkComplete },
  { method: 'POST', pattern: '/api/ai/explain', handler: handleAiExplain },
];

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, `http://${req.headers.host}`);

  if (pathname === '/health') return send(res, 200, { ok: true });

  for (const route of routes) {
    if (route.method !== req.method) continue;
    const params = matchRoute(route.pattern, pathname);
    if (!params) continue;

    try {
      await route.handler(req, res, params);
    } catch (err) {
      console.error('Unhandled route error:', err);
      send(res, 500, { error: 'Internal server error', detail: err.message });
    }
    return;
  }

  notFound(res, `No route for ${req.method} ${pathname}`);
});

server.listen(PORT, () => {
  console.log(`MIC Learning Path Tracker API listening on http://localhost:${PORT}`);
  console.log(`AI provider: ${(process.env.AI_PROVIDER || 'openai')} (set OPENAI_API_KEY / GEMINI_API_KEY to enable real AI explanations)`);
});

module.exports = server;
