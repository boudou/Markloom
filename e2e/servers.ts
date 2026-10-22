// Where the suite serves the app. Several worktrees can run the suite at once, each on its own
// port (E2E_PORT) with CI=1, so none of them reuses another one's server.
const port = Number(process.env.E2E_PORT ?? 4173);

/** The plain build, as `npm run build` makes it */
export const APP_PORT = port;

/** A second build with a Google Analytics ID, as the GitHub Pages workflow makes it (#210) */
export const ANALYTICS_PORT = port + 1000;

/** A made-up measurement ID: the tests intercept every request to Google */
export const ANALYTICS_ID = 'G-E2ETEST000';

export const appURL = (serverPort: number) => `http://localhost:${serverPort}/`;
