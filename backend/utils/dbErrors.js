// utils/dbErrors.js
// Small helpers to classify transient DB connectivity failures.

const DB_CONNECTIVITY_PATTERNS = [
  'connection terminated due to connection timeout',
  'connect etimedout',
  'connection timeout',
  'connection terminated unexpectedly',
  'getaddrinfo enotfound',
  'connect econnrefused',
  'the server does not support ssl connections',
];

const DB_CONNECTIVITY_CODES = new Set([
  'ETIMEDOUT',
  'ECONNREFUSED',
  'ENOTFOUND',
]);

function isDbConnectivityError(err) {
  if (!err) return false;
  if (err.code && DB_CONNECTIVITY_CODES.has(err.code)) return true;
  const msg = String(err.message || '').toLowerCase();
  return DB_CONNECTIVITY_PATTERNS.some((p) => msg.includes(p));
}

module.exports = { isDbConnectivityError };

