import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../bot/config.js';
import { configureLogger, info, warn, error as logError } from '../bot/logger.js';
import { createMemory } from '../bot/memory.js';
import { createCancellation } from '../bot/cancellation.js';
import { createDashboardRequestHandler } from './dashboardRoutes.js';
import { refusePublicBindingIfUnsafe } from './dashboardSecurity.js';

function logWith(logger, level, ...args) {
  const fn = logger?.[level] || console[level] || console.log;
  fn(...args);
}

export async function startDashboard(context = {}) {
  const config = context.config || context.bot?.mcaiConfig || loadConfig();
  if (config.dashboardEnabled === false) {
    logWith(context.logger, 'info', '[dashboard] disabled');
    return null;
  }

  try {
    refusePublicBindingIfUnsafe(config);
  } catch (error) {
    logWith(context.logger, 'warn', `[dashboard] not started: ${error.message}`);
    return null;
  }

  const host = config.dashboardHost || '127.0.0.1';
  const port = Number(config.dashboardPort || 8787);
  const memory = context.memory || createMemory(config.memoryPath);
  const cancellation = context.cancellation || context.bot?.mcaiCancellation || createCancellation();
  const handler = createDashboardRequestHandler({
    ...context,
    config,
    memory,
    cancellation,
    logger: context.logger || { info, warn, error: logError }
  });
  const server = http.createServer(handler);

  let listenError = null;
  server.on('error', (error) => {
    listenError = error;
    // The launcher normally stops a standalone dashboard before the bot binds.
    if (error?.code === 'EADDRINUSE') {
      logWith(context.logger, 'warn', `[dashboard] port ${host}:${port} is already in use; live bot telemetry is unavailable until the standalone dashboard is stopped and TJ is restarted.`);
      return;
    }
    logWith(context.logger, 'warn', `[dashboard] startup/runtime failure: ${error.message}`);
  });

  await new Promise((resolve) => {
    server.listen(port, host, () => {
      logWith(context.logger, 'info', `[dashboard] local dashboard running at http://${host}:${port}`);
      resolve();
    });
    server.once('error', () => resolve());
  });

  if (listenError?.code === 'EADDRINUSE') {
    try { server.close(); } catch { /* ignore */ }
    return null;
  }

  return server;
}

async function main() {
  const config = loadConfig();
  configureLogger(config);
  await startDashboard({ config, logger: { info, warn, error: logError } });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    logError('[dashboard] failed:', error.stack || error.message);
    process.exitCode = 1;
  });
}
