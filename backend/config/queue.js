require('dotenv').config();

const REDIS_URL = (process.env.REDIS_URL || '').trim();

let bullmq = null;
let warnedMissingPackage = false;

try {
  bullmq = require('bullmq');
} catch (_) {
  bullmq = null;
}

function isQueueConfigured() {
  return Boolean(REDIS_URL) && Boolean(bullmq);
}

function getQueueConnection() {
  if (!REDIS_URL) return null;
  return { connection: { url: REDIS_URL } };
}

function getBullmq() {
  if (bullmq) return bullmq;
  if (!warnedMissingPackage) {
    console.warn('[queue] bullmq package not installed; using in-process background jobs');
    warnedMissingPackage = true;
  }
  return null;
}

module.exports = {
  isQueueConfigured,
  getQueueConnection,
  getBullmq,
};
