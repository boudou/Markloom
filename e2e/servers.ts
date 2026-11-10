// Where the suite serves the app. Several worktrees can run the suite at once, each on its own
// port (E2E_PORT) with CI=1, so none of them reuses another one's server.
import { connect } from 'node:net';

const port = Number(process.env.E2E_PORT ?? 4173);

/** The plain build, as `npm run build` makes it */
export const APP_PORT = port;

/**
 * A second build with a Google Analytics ID, as the GitHub Pages workflow makes it (#210). It sits
 * 2000 above the app, not 1000: 4173 + 1000 is Vite's dev-server port, and a dev server running
 * there stopped the suite (#219). Not 1 above either: parallel runs take neighbouring E2E_PORTs.
 */
export const ANALYTICS_PORT = Number(process.env.E2E_ANALYTICS_PORT ?? port + 2000);

/** A made-up measurement ID: the tests intercept every request to Google */
export const ANALYTICS_ID = 'G-E2ETEST000';

export const appURL = (serverPort: number) => `http://localhost:${serverPort}/`;

/** Whether something answers on the port at that address, as Playwright probes it */
function answers(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ port, host });
    socket.setTimeout(1000);
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

/**
 * Stops the run before the long build when a server's port is taken, naming the port, the server
 * that needs it and how to move it. Playwright's own message names only the address, after the
 * config loaded, and without CI it reuses whatever answers there, even a dev server.
 */
export async function assertPortsFree(servers: readonly SuiteServer[]): Promise<void> {
  const busy = await Promise.all(
    servers.map(async (entry) => (await answers(entry.port, '127.0.0.1')) || (await answers(entry.port, '::1')))
  );

  const lines = servers.flatMap((entry, index) =>
    busy[index] ? [`  port ${entry.port}: needed by ${entry.server}; set ${entry.variable} to another port`] : []
  );

  if (lines.length === 0) return;

  throw new Error(`The e2e servers' ports are in use by another program (a dev server, or another run's preview):\n${lines.join('\n')}`);
}

export interface SuiteServer {
  port: number;
  /** What the suite serves there, for the message */
  server: string;
  /** The environment variable that moves it */
  variable: string;
}
