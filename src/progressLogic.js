'use strict';

/**
 * All "what's completed / available / locked" logic lives here.
 * The AI is never consulted for this decision — it only explains
 * a decision this module has already made.
 */

/**
 * Topologically sort certs within a domain so the path is always
 * returned in a valid prerequisite order (a cert never appears
 * before something it depends on).
 */
function topoSortCerts(certs) {
  const byId = new Map(certs.map((c) => [c.id, c]));
  const visited = new Set();
  const visiting = new Set();
  const ordered = [];

  function visit(cert) {
    if (visited.has(cert.id)) return;
    if (visiting.has(cert.id)) {
      // Defensive: a cycle in the dataset would be a data bug, not a
      // runtime state we want to crash on. Skip re-visiting it.
      return;
    }
    visiting.add(cert.id);
    for (const prereqId of cert.prerequisites) {
      const prereq = byId.get(prereqId);
      if (prereq) visit(prereq);
    }
    visiting.delete(cert.id);
    visited.add(cert.id);
    ordered.push(cert);
  }

  for (const cert of certs) visit(cert);
  return ordered;
}

/**
 * Compute the state of every cert in a domain for a given set of
 * completed cert ids.
 *
 * - completed:  the user has marked it done
 * - available:  not completed, but every prerequisite IS completed
 * - locked:     not completed, and at least one prerequisite is missing
 */
function computeDomainProgress(certs, completedSet) {
  const ordered = topoSortCerts(certs);

  return ordered.map((cert) => {
    const isCompleted = completedSet.has(cert.id);
    const prereqsMet = cert.prerequisites.every((p) => completedSet.has(p));

    let state;
    if (isCompleted) state = 'completed';
    else if (prereqsMet) state = 'available';
    else state = 'locked';

    return {
      id: cert.id,
      name: cert.name,
      description: cert.description,
      url: cert.url,
      prerequisites: cert.prerequisites,
      state,
    };
  });
}

/**
 * Given a domain's certs and the completed set BEFORE a cert was just
 * marked complete, return the cert ids that flipped from locked/absent
 * to "available" as a direct result of completing `justCompletedId`.
 */
function findNewlyAvailable(certs, completedSetAfter, justCompletedId) {
  const beforeSet = new Set(completedSetAfter);
  beforeSet.delete(justCompletedId);

  const newlyAvailable = [];
  for (const cert of certs) {
    if (completedSetAfter.has(cert.id)) continue; // already done
    const metBefore = cert.prerequisites.every((p) => beforeSet.has(p));
    const metAfter = cert.prerequisites.every((p) => completedSetAfter.has(p));
    if (!metBefore && metAfter) newlyAvailable.push(cert);
  }
  return newlyAvailable;
}

module.exports = { topoSortCerts, computeDomainProgress, findNewlyAvailable };
