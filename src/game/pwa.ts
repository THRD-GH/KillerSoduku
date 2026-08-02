/**
 * Service worker registration. Only in a built site: in dev there is no sw.js,
 * and a stale worker caching dev assets is a good way to lose an afternoon.
 */
export function registerServiceWorker(onUpdateReady?: () => void): void {
  if (!('serviceWorker' in navigator)) return;
  if (import.meta.env.DEV) return;

  window.addEventListener('load', () => {
    const base = import.meta.env.BASE_URL;
    const wasControlled = navigator.serviceWorker.controller !== null;
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing || !wasControlled) return;
      refreshing = true;
      onUpdateReady?.();
    });

    void navigator.serviceWorker
      .register(`${base}sw.js`, { scope: base })
      .then((registration) => {
        document.addEventListener('visibilitychange', () => {
          if (!document.hidden) void registration.update();
        });
      })
      .catch(() => {
        // An unregistrable worker costs offline play, nothing else.
      });
  });
}

/** Colour the browser and OS chrome to match the current theme. */
export function setThemeColour(colour: string): void {
  let tag = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!tag) {
    tag = document.createElement('meta');
    tag.name = 'theme-color';
    document.head.append(tag);
  }
  tag.content = colour;
}
