/**
 * Normalized payment gateway error format.
 * All gateway implementations should map their errors to this shape.
 *
 * @typedef {Object} NormalizedGatewayError
 * @property {string} code - Normalized error code: card_declined, insufficient_funds, authentication_required, rate_limit, network_error, invalid_request, unknown
 * @property {string} message - Human-readable message (safe to show to user)
 * @property {string} [gatewayCode] - Original gateway error code (e.g. Stripe's card_declined)
 * @property {boolean} retryable - Whether the operation can be retried
 * @property {number} [status] - HTTP-like status for API responses (400, 402, 429, 500)
 */

const NORMALIZED_CODES = {
  CARD_DECLINED: 'card_declined',
  INSUFFICIENT_FUNDS: 'insufficient_funds',
  AUTHENTICATION_REQUIRED: 'authentication_required',
  RATE_LIMIT: 'rate_limit',
  NETWORK_ERROR: 'network_error',
  INVALID_REQUEST: 'invalid_request',
  UNAUTHORIZED: 'unauthorized',
  NOT_FOUND: 'not_found',
  UNKNOWN: 'unknown',
};

/** Stripe error codes mapped to normalized codes */
const STRIPE_CODE_MAP = {
  card_declined: NORMALIZED_CODES.CARD_DECLINED,
  insufficient_funds: NORMALIZED_CODES.INSUFFICIENT_FUNDS,
  authentication_required: NORMALIZED_CODES.AUTHENTICATION_REQUIRED,
  rate_limit: NORMALIZED_CODES.RATE_LIMIT,
  api_connection_error: NORMALIZED_CODES.NETWORK_ERROR,
  api_error: NORMALIZED_CODES.NETWORK_ERROR,
  invalid_request_error: NORMALIZED_CODES.INVALID_REQUEST,
  idempotency_key_in_use: NORMALIZED_CODES.INVALID_REQUEST,
};

/** Codes that are generally retryable */
const RETRYABLE_CODES = new Set([
  NORMALIZED_CODES.RATE_LIMIT,
  NORMALIZED_CODES.NETWORK_ERROR,
]);

/**
 * Normalize a gateway error into the shared format.
 * @param {Error} err - Raw error from gateway SDK or network
 * @param {string} [gatewayName='unknown'] - Gateway identifier for logging
 * @returns {NormalizedGatewayError}
 */
function normalizeError(err, gatewayName = 'unknown') {
  const gatewayCode = err.code || err.type || null;
  let code = NORMALIZED_CODES.UNKNOWN;
  let retryable = false;
  let status = 500;

  const stripeCode = err.code || err.decline_code;
  if (stripeCode && STRIPE_CODE_MAP[stripeCode]) {
    code = STRIPE_CODE_MAP[stripeCode];
    retryable = RETRYABLE_CODES.has(code);
  } else if (err.type === 'StripeInvalidRequestError' || err.type === 'StripeCardError') {
    if (err.code === 'rate_limit') {
      code = NORMALIZED_CODES.RATE_LIMIT;
      retryable = true;
    } else if (err.code && STRIPE_CODE_MAP[err.code]) {
      code = STRIPE_CODE_MAP[err.code];
      retryable = RETRYABLE_CODES.has(code);
    } else {
      code = NORMALIZED_CODES.INVALID_REQUEST;
    }
  }

  if (err.statusCode) {
    status = err.statusCode;
    if (status === 429) {
      code = NORMALIZED_CODES.RATE_LIMIT;
      retryable = true;
    } else if (status === 402) {
      code = code === NORMALIZED_CODES.UNKNOWN ? NORMALIZED_CODES.CARD_DECLINED : code;
    } else if (status >= 500 || err.message?.toLowerCase().includes('timeout') || err.message?.toLowerCase().includes('network')) {
      code = NORMALIZED_CODES.NETWORK_ERROR;
      retryable = true;
    }
  }

  if (err.message?.toLowerCase().includes('timeout') || err.name === 'AbortError') {
    code = NORMALIZED_CODES.NETWORK_ERROR;
    retryable = true;
    status = 504;
  }

  const message = err.message && typeof err.message === 'string'
    ? err.message
    : 'Payment failed. Please try again.';

  return {
    code,
    message,
    gatewayCode: gatewayCode || undefined,
    retryable,
    status: status >= 400 && status < 600 ? status : 500,
  };
}

/**
 * Create an Error with normalized shape attached.
 * @param {NormalizedGatewayError} normalized
 * @returns {Error}
 */
function toError(normalized) {
  const err = new Error(normalized.message);
  err.code = normalized.code;
  err.gatewayCode = normalized.gatewayCode;
  err.retryable = normalized.retryable;
  err.status = normalized.status;
  err.normalized = normalized;
  return err;
}

module.exports = {
  NORMALIZED_CODES,
  normalizeError,
  toError,
};
