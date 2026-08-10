type Attrs = Record<string, string | number | boolean | undefined>;
type Child = Node | string | null | undefined | false;

/** Minimal element builder — the whole UI is hand-built DOM, no framework. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === 'class') node.className = String(v);
    else if (k === 'text') node.textContent = String(v);
    else if (k === 'html') node.innerHTML = String(v);
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

export function clear(node: HTMLElement): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

/** mm:ss, or h:mm:ss once it runs long. */
export function formatTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/**
 * Which build this is: commit and when it was made, in the reader's own time
 * zone. Worth showing because a PWA can keep serving an older build until the
 * service worker picks up a new one.
 */
export function buildStamp(): string {
  const when = new Date(__BUILD_TIME__);
  const stamp = Number.isNaN(when.valueOf())
    ? __BUILD_TIME__
    : when.toLocaleString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
  return `build ${__BUILD_COMMIT__} · ${stamp}`;
}

/**
 * How long ago, in the coarsest unit that still says something useful. A list
 * of parked games is read to answer "which was I in the middle of", and "3
 * hours ago" answers that where a date does not.
 */
export function timeAgo(epochMs: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - epochMs) / 1000));
  if (seconds < 90) return 'just now';

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;

  const days = Math.round(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;

  const weeks = Math.round(days / 7);
  if (weeks < 5) return `${weeks} week${weeks === 1 ? '' : 's'} ago`;

  const months = Math.round(days / 30);
  return months < 12 ? `${months} month${months === 1 ? '' : 's'} ago` : formatDate(epochMs);
}

export function formatDate(epochMs: number): string {
  const d = new Date(epochMs);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
