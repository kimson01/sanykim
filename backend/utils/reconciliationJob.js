const { query } = require('../config/db');
const { logPlatformEvent } = require('./platformLogger');
const { isDbConnectivityError } = require('./dbErrors');

const CHECK_INTERVAL_MS = 15 * 60 * 1000;
let lastConnectivityLogAt = 0;

const MANAGED_ISSUE_TYPES = [
  'paid_order_missing_tickets',
  'transaction_amount_mismatch',
  'refunded_order_missing_ledger',
];

async function upsertIssue({ issueKey, issueType, entityType, entityId = null, severity = 'warning', summary, details = {} }) {
  await query(
    `INSERT INTO reconciliation_issues
       (issue_key, issue_type, entity_type, entity_id, severity, summary, details, status, first_seen_at, last_seen_at, resolved_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'open',NOW(),NOW(),NULL)
     ON CONFLICT (issue_key)
     DO UPDATE SET
       severity = EXCLUDED.severity,
       summary = EXCLUDED.summary,
       details = EXCLUDED.details,
       status = 'open',
       last_seen_at = NOW(),
       resolved_at = NULL`,
    [issueKey, issueType, entityType, entityId, severity, summary, JSON.stringify(details || {})]
  );
}

async function resolveMissingIssues(activeIssueKeys) {
  if (activeIssueKeys.length > 0) {
    await query(
      `UPDATE reconciliation_issues
       SET status = 'resolved',
           resolved_at = NOW()
       WHERE status = 'open'
         AND issue_type = ANY($1::text[])
         AND NOT (issue_key = ANY($2::text[]))`,
      [MANAGED_ISSUE_TYPES, activeIssueKeys]
    );
    return;
  }

  await query(
    `UPDATE reconciliation_issues
     SET status = 'resolved',
         resolved_at = NOW()
     WHERE status = 'open'
       AND issue_type = ANY($1::text[])`,
    [MANAGED_ISSUE_TYPES]
  );
}

async function runPaymentReconciliation() {
  try {
    const findings = [];

    const paidOrdersWithoutTickets = await query(
      `SELECT o.id, o.order_ref, o.total, COUNT(t.id)::int AS ticket_count
       FROM orders o
       LEFT JOIN tickets t ON t.order_id = o.id
       WHERE o.status = 'success'
       GROUP BY o.id, o.order_ref, o.total
       HAVING COUNT(t.id) = 0`
    );
    paidOrdersWithoutTickets.rows.forEach((row) => {
      findings.push({
        issueKey: `paid_order_missing_tickets:${row.id}`,
        issueType: 'paid_order_missing_tickets',
        entityType: 'order',
        entityId: row.id,
        severity: 'error',
        summary: `Paid order ${row.order_ref} has no issued tickets`,
        details: {
          order_ref: row.order_ref,
          total: Number(row.total || 0),
          ticket_count: Number(row.ticket_count || 0),
        },
      });
    });

    const amountMismatches = await query(
      `SELECT o.id, o.order_ref, o.total, t.txn_ref, t.amount
       FROM transactions t
       JOIN orders o ON o.id = t.order_id
       WHERE t.status = 'success'
         AND o.status = 'success'
         AND t.amount <> o.total`
    );
    amountMismatches.rows.forEach((row) => {
      findings.push({
        issueKey: `transaction_amount_mismatch:${row.txn_ref}`,
        issueType: 'transaction_amount_mismatch',
        entityType: 'order',
        entityId: row.id,
        severity: 'warning',
        summary: `Transaction ${row.txn_ref} amount does not match order ${row.order_ref}`,
        details: {
          order_ref: row.order_ref,
          txn_ref: row.txn_ref,
          order_total: Number(row.total || 0),
          transaction_amount: Number(row.amount || 0),
        },
      });
    });

    const refundedMissingLedger = await query(
      `SELECT o.id, o.order_ref
       FROM orders o
       LEFT JOIN revenue_ledger rl
         ON rl.order_id = o.id
        AND rl.type = 'refund'
       WHERE o.status = 'refunded'
       GROUP BY o.id, o.order_ref
       HAVING COUNT(rl.id) = 0`
    );
    refundedMissingLedger.rows.forEach((row) => {
      findings.push({
        issueKey: `refunded_order_missing_ledger:${row.id}`,
        issueType: 'refunded_order_missing_ledger',
        entityType: 'order',
        entityId: row.id,
        severity: 'error',
        summary: `Refunded order ${row.order_ref} has no refund ledger entry`,
        details: {
          order_ref: row.order_ref,
        },
      });
    });

    for (const finding of findings) {
      await upsertIssue(finding);
    }

    await resolveMissingIssues(findings.map((f) => f.issueKey));

    await logPlatformEvent({
      actorRole: 'system',
      domain: 'finance',
      eventType: 'payment_reconciliation_completed',
      entityType: 'reconciliation',
      summary: `Payment reconciliation completed with ${findings.length} open issue(s)`,
      payload: {
        issue_count: findings.length,
        issue_types: [...new Set(findings.map((f) => f.issueType))],
      },
    }).catch(() => {});
  } catch (err) {
    if (isDbConnectivityError(err)) {
      const now = Date.now();
      if (now - lastConnectivityLogAt > 60 * 1000) {
        console.error('[reconciliationJob] DB unavailable:', err.message);
        lastConnectivityLogAt = now;
      }
      return;
    }
    console.error('[reconciliationJob] error:', err.message);
    await logPlatformEvent({
      actorRole: 'system',
      domain: 'finance',
      eventType: 'payment_reconciliation_failed',
      entityType: 'reconciliation',
      summary: 'Payment reconciliation failed',
      severity: 'error',
      payload: { reason: err.message },
    }).catch(() => {});
  }
}

function startReconciliationJob() {
  console.log('  Reconciliation job running every 15 min');
  runPaymentReconciliation();
  setInterval(runPaymentReconciliation, CHECK_INTERVAL_MS);
}

module.exports = {
  CHECK_INTERVAL_MS,
  MANAGED_ISSUE_TYPES,
  runPaymentReconciliation,
  startReconciliationJob,
};
