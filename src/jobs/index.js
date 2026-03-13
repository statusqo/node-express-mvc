/**
 * Background job registry.
 * Import and wire all background jobs here so server.js stays clean.
 */

const fiscalizationRetry = require("./fiscalizationRetry.job");

const jobs = [fiscalizationRetry];

function start() {
  jobs.forEach((job) => job.start());
}

function stop() {
  jobs.forEach((job) => job.stop());
}

module.exports = { start, stop };
