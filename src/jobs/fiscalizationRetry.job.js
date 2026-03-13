/**
 * Background job: automatically retry failed fiscalisations.
 *
 * Croatian fiscal law requires every invoice to be fiscalised even if the FINA
 * (Tax Administration) system is temporarily unavailable. This job runs on a
 * regular interval and retries any invoice with fiscalizationStatus 'failed'
 * or 'pending' (the latter covers app-crash scenarios where the first attempt
 * never ran).
 *
 * Retry policy:
 *   - Interval:  5 minutes
 *   - Min age:   60 seconds  (avoids racing with in-flight first attempts)
 *   - Max age:   7 days      (after a week, manual review is warranted)
 *   - Concurrency: sequential — one invoice at a time to avoid bursting FINA
 */

const logger = require("../config/logger");
const invoiceRepo = require("../repos/invoice.repo");
const orderRepo = require("../repos/order.repo");
const { fiscalizeAndUpdatePdf } = require("../services/invoice.service");

const INTERVAL_MS   = 5 * 60 * 1_000; // 5 minutes
const MIN_AGE_SECS  = 60;             // ignore invoices younger than this
const MAX_AGE_DAYS  = 7;              // stop retrying invoices older than this

let _timer    = null;
let _running  = false; // prevent overlapping runs

/**
 * Run one pass: find all retryable invoices and attempt fiscalisation on each.
 */
async function run() {
  if (_running) {
    logger.debug("Fiscalisation retry job: previous run still in progress — skipping");
    return;
  }
  _running = true;

  try {
    const invoices = await invoiceRepo.findFailedFiscalizations({
      minAgeSeconds: MIN_AGE_SECS,
      maxAgeDays:    MAX_AGE_DAYS,
    });

    if (invoices.length === 0) {
      logger.debug("Fiscalisation retry job: nothing to retry");
      return;
    }

    logger.info(`Fiscalisation retry job: ${invoices.length} invoice(s) to retry`);

    for (const invoice of invoices) {
      try {
        const order = await orderRepo.findById(invoice.orderId);
        if (!order) {
          logger.warn("Fiscalisation retry: order not found for invoice", {
            invoiceId: invoice.id,
            orderId:   invoice.orderId,
          });
          continue;
        }

        const rawLines = await orderRepo.getLines(order.id);
        const lines = (rawLines || []).map((l) => ({
          title:    l.title,
          quantity: l.quantity,
          price:    l.price,
          vatRate:  l.vatRate != null ? Number(l.vatRate) : null,
        }));

        const orderPlain = order.get ? order.get({ plain: true }) : order;

        logger.info("Fiscalisation retry: attempting", {
          invoiceId:     invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          status:        invoice.fiscalizationStatus,
        });

        const { fiskalResult } = await fiscalizeAndUpdatePdf(invoice, orderPlain, lines);

        if (fiskalResult && fiskalResult.success) {
          logger.info("Fiscalisation retry: succeeded", {
            invoiceId:     invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            jir:           fiskalResult.jir,
          });
        } else {
          logger.warn("Fiscalisation retry: still failing", {
            invoiceId:     invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            error:         fiskalResult && fiskalResult.error,
          });
        }
      } catch (err) {
        // Per-invoice errors must not abort the loop — log and continue.
        logger.error("Fiscalisation retry: unexpected error for invoice", {
          invoiceId: invoice.id,
          error:     err.message,
        });
      }
    }
  } catch (err) {
    logger.error("Fiscalisation retry job: failed to query invoices", { error: err.message });
  } finally {
    _running = false;
  }
}

/**
 * Start the retry job. No-op if already started.
 */
function start() {
  if (_timer) return;
  logger.info(`Fiscalisation retry job: started (interval ${INTERVAL_MS / 1000}s)`);
  // Run immediately on startup to catch any invoices left over from before the last restart.
  run().catch(() => {});
  _timer = setInterval(() => run().catch(() => {}), INTERVAL_MS);
}

/**
 * Stop the retry job cleanly (called on SIGTERM/SIGINT).
 */
function stop() {
  if (!_timer) return;
  clearInterval(_timer);
  _timer = null;
  logger.info("Fiscalisation retry job: stopped");
}

module.exports = { start, stop, run };
