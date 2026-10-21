// Copy buttons on preview code blocks, after interior.dev's copy button: the icon crossfades
// to a check that draws itself, the label swaps in place, and the result is announced.
// The preview is set as HTML, so buttons are added to each <pre> after it renders.

const RESET_AFTER = 2000;

const resets = new WeakMap<HTMLButtonElement, number>();

const BUTTON_HTML = `
  <span class="code-copy-icons" aria-hidden="true">
    <svg class="code-copy-icon" data-for="idle" viewBox="0 0 14 14"><path d="M9.6 5.1V3.7A1.7 1.7 0 0 0 7.9 2H3.7A1.7 1.7 0 0 0 2 3.7v4.2a1.7 1.7 0 0 0 1.7 1.7h1.4"/><rect x="5.1" y="5.1" width="6.9" height="6.9" rx="1.7"/></svg>
    <svg class="code-copy-icon" data-for="copied" viewBox="0 0 14 14"><path class="code-copy-check" pathLength="1" d="M2.9 7.4 5.6 10.1 11.1 4"/></svg>
    <svg class="code-copy-icon" data-for="error" viewBox="0 0 14 14"><path d="M3.6 3.6 10.4 10.4"/><path d="M10.4 3.6 3.6 10.4"/></svg>
  </span>
  <span class="code-copy-labels" aria-hidden="true">
    <span data-for="idle">Copy</span><span data-for="copied">Copied</span><span data-for="error">Failed</span>
  </span>`;

// For contexts without the async clipboard API (or where it is refused)
function writeFallback(text: string): boolean {
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
  document.body.appendChild(area);
  const selection = document.getSelection();
  const previous = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
  area.select();
  let ok = false;

  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }

  area.remove();

  if (selection && previous) {
    selection.removeAllRanges();
    selection.addRange(previous);
  }

  return ok;
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);

      return true;
    }
  } catch {
    // fall through to the fallback
  }

  try {
    return writeFallback(text);
  } catch {
    return false;
  }
}

/** Give every code block under `root` a copy button (idempotent). */
export function addCopyButtons(root: HTMLElement): void {
  for (const pre of root.querySelectorAll<HTMLPreElement>('pre')) {
    if (!pre.querySelector(':scope > code') || pre.querySelector(':scope > .code-copy')) continue;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'code-copy';
    button.dataset.state = 'idle';
    button.setAttribute('aria-label', 'Copy code');
    button.innerHTML = BUTTON_HTML;
    pre.appendChild(button);
  }
}

/** Delegated click handler for the preview; `announce` reports the result to screen readers. */
export async function handleCopyClick(event: MouseEvent, announce: (message: string) => void): Promise<void> {
  // SAFETY: click events fire on elements (never text nodes), and only Element.closest is used.
  const button = (event.target as Element | null)?.closest<HTMLButtonElement>('.code-copy');

  if (!button) return;
  event.preventDefault();
  const code = button.parentElement?.querySelector(':scope > code')?.textContent ?? '';

  if (!code) return;

  const ok = await copyText(code);
  button.dataset.state = ok ? 'copied' : 'error';
  announce(ok ? 'Code copied' : 'Could not copy the code');

  window.clearTimeout(resets.get(button));
  resets.set(
    button,
    window.setTimeout(() => {
      button.dataset.state = 'idle';
    }, RESET_AFTER)
  );
}
