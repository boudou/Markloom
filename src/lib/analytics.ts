// Opt-in Google Analytics for the web version (#210). Only the GitHub Pages build sets VITE_GA_ID;
// a local or desktop build has no ID, so none of this runs and Vite drops the script address.
// gtag.js loads only after the visitor allows it. What it collects (page loads only) is set in the
// GA property; the app sends no events of its own.

const ANALYTICS_ID = import.meta.env.VITE_GA_ID;

/** Usage statistics can be offered: a production web build with an ID, never the desktop app */
export const analyticsAvailable = import.meta.env.PROD && !!ANALYTICS_ID && !window.markloomDesktop;

/** The only commands the app ever gives gtag: no events */
type GtagCommand = ['js', Date] | ['config', string];

let started = false;

// Google's snippet: gtag.js reads each call's arguments object, not an array
function gtag(..._command: GtagCommand): void {
  window.dataLayer?.push(arguments);
}

/** Loads gtag.js once; its `config` sends the one page view of this page load */
export function startAnalytics(): void {
  if (!analyticsAvailable || !ANALYTICS_ID) return;

  window[`ga-disable-${ANALYTICS_ID}`] = false;

  if (started) return;

  started = true;
  window.dataLayer = window.dataLayer ?? [];

  const script = document.createElement('script');

  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ANALYTICS_ID)}`;
  document.head.appendChild(script);
  gtag('js', new Date());
  gtag('config', ANALYTICS_ID);
}

/** Stops gtag.js from sending anything more and removes its cookies */
export function stopAnalytics(): void {
  if (!analyticsAvailable || !ANALYTICS_ID) return;

  window[`ga-disable-${ANALYTICS_ID}`] = true;

  const names = document.cookie.split(';').flatMap((cookie) => {
    const name = cookie.split('=')[0].trim();

    return /^_ga(_|$)/.test(name) ? [name] : [];
  });

  // gtag.js sets them on the widest domain it may (boudou.github.io), path /; a browser ignores the
  // domains it wouldn't have accepted, so trying each parent of the host is harmless
  const labels = location.hostname.split('.');
  const domains = labels.map((_label, index) => labels.slice(index).join('.'));

  for (const name of names) {
    const expired = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;

    document.cookie = expired;

    for (const domain of domains) {
      document.cookie = `${expired}; domain=${domain}`;
      document.cookie = `${expired}; domain=.${domain}`;
    }
  }
}
