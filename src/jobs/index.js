/**
 * Background job registry.
 * Import and wire all background jobs here so server.js stays clean.
 */

const jobs = [];

function start() {
  jobs.forEach((job) => job.start());
}

function stop() {
  jobs.forEach((job) => job.stop());
}

module.exports = { start, stop };
