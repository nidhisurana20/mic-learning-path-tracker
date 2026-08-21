'use strict';

const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'user-progress.json');

function readDb() {
  if (!fs.existsSync(DB_PATH)) return { users: {} };
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    return raw.trim() ? JSON.parse(raw) : { users: {} };
  } catch (err) {
    // A corrupt file shouldn't crash the whole API — start fresh but
    // don't silently overwrite the old file until something is written.
    console.error('Failed to parse user-progress.json, starting empty:', err.message);
    return { users: {} };
  }
}

function writeDb(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function getUser(db, userId) {
  if (!db.users[userId]) {
    db.users[userId] = { completed: [], goal: null };
  }
  return db.users[userId];
}

function getCompletedSet(userId) {
  const db = readDb();
  const user = getUser(db, userId);
  return new Set(user.completed);
}

function getGoal(userId) {
  const db = readDb();
  return getUser(db, userId).goal;
}

function setGoal(userId, goal) {
  const db = readDb();
  const user = getUser(db, userId);
  user.goal = goal;
  writeDb(db);
}

/**
 * Marks a cert complete for a user. Returns { ok, reason?, completedSet }.
 * Refuses to mark anything that isn't currently "available" — this is
 * enforced server-side, not just left to the client to behave.
 */
function markComplete(userId, certId, isAvailableFn) {
  const db = readDb();
  const user = getUser(db, userId);
  const completedSet = new Set(user.completed);

  if (completedSet.has(certId)) {
    return { ok: false, reason: 'already_completed', completedSet };
  }
  if (!isAvailableFn(completedSet)) {
    return { ok: false, reason: 'not_available', completedSet };
  }

  completedSet.add(certId);
  user.completed = Array.from(completedSet);
  writeDb(db);
  return { ok: true, completedSet };
}

module.exports = { getCompletedSet, getGoal, setGoal, markComplete };
