const { getBullmq, getQueueConnection, isQueueConfigured } = require('../config/queue');
const { CHECK_INTERVAL_MS: REMINDER_EVERY_MS, runReminderCheck, startReminderJob } = require('./reminderJob');
const { CHECK_INTERVAL_MS: ABANDONMENT_EVERY_MS, runAbandonmentCheck, startAbandonmentJob } = require('./abandonmentJob');
const { CHECK_INTERVAL_MS: RECONCILIATION_EVERY_MS, runPaymentReconciliation, startReconciliationJob } = require('./reconciliationJob');

const JOB_QUEUE_NAME = 'background-jobs';

let queue = null;
let reminderWorker = null;
let abandonmentWorker = null;
let reconciliationWorker = null;

async function startQueuedBackgroundJobs() {
  const bullmq = getBullmq();
  const queueOptions = getQueueConnection();
  if (!bullmq || !queueOptions || !isQueueConfigured()) {
    console.log('  Background jobs  using in-process timers');
    startReminderJob();
    startAbandonmentJob();
    startReconciliationJob();
    return;
  }

  const { Queue, Worker } = bullmq;

  queue = new Queue(JOB_QUEUE_NAME, queueOptions);

  reminderWorker = new Worker(
    JOB_QUEUE_NAME,
    async (job) => {
      if (job.name === 'send-event-reminders') {
        await runReminderCheck();
      }
    },
    queueOptions
  );

  abandonmentWorker = new Worker(
    JOB_QUEUE_NAME,
    async (job) => {
      if (job.name === 'send-abandonment-recovery') {
        await runAbandonmentCheck();
      }
    },
    queueOptions
  );

  reconciliationWorker = new Worker(
    JOB_QUEUE_NAME,
    async (job) => {
      if (job.name === 'run-payment-reconciliation') {
        await runPaymentReconciliation();
      }
    },
    queueOptions
  );

  reminderWorker.on('error', (err) => {
    console.error('[queue] reminder worker error:', err.message);
  });
  abandonmentWorker.on('error', (err) => {
    console.error('[queue] abandonment worker error:', err.message);
  });
  reconciliationWorker.on('error', (err) => {
    console.error('[queue] reconciliation worker error:', err.message);
  });

  await queue.add(
    'send-event-reminders',
    {},
    {
      jobId: 'send-event-reminders',
      repeat: { every: REMINDER_EVERY_MS },
      removeOnComplete: 20,
      removeOnFail: 50,
    }
  );

  await queue.add(
    'send-abandonment-recovery',
    {},
    {
      jobId: 'send-abandonment-recovery',
      repeat: { every: ABANDONMENT_EVERY_MS },
      removeOnComplete: 20,
      removeOnFail: 50,
    }
  );

  await queue.add(
    'run-payment-reconciliation',
    {},
    {
      jobId: 'run-payment-reconciliation',
      repeat: { every: RECONCILIATION_EVERY_MS },
      removeOnComplete: 20,
      removeOnFail: 50,
    }
  );

  // Kick both jobs once immediately so startup behavior matches the old timers.
  await queue.add('send-event-reminders', {}, { removeOnComplete: true, removeOnFail: 10 });
  await queue.add('send-abandonment-recovery', {}, { removeOnComplete: true, removeOnFail: 10 });
  await queue.add('run-payment-reconciliation', {}, { removeOnComplete: true, removeOnFail: 10 });

  console.log('  Background jobs  running via Redis queue');
}

async function stopQueuedBackgroundJobs() {
  await Promise.allSettled([
    reminderWorker?.close(),
    abandonmentWorker?.close(),
    reconciliationWorker?.close(),
    queue?.close(),
  ]);
  reminderWorker = null;
  abandonmentWorker = null;
  reconciliationWorker = null;
  queue = null;
}

module.exports = {
  startQueuedBackgroundJobs,
  stopQueuedBackgroundJobs,
};
