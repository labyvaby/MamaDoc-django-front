/**
 * Recover once when an already-open tab asks for a Vite chunk from the
 * previous frontend build. This can happen exactly while a new deployment is
 * replacing the HTML entry document and its hashed assets.
 *
 * Cache-Control and the deploy procedure prevent the condition for new
 * releases. The reload is a final safety net for a tab that was already open
 * before those protections reached the device.
 */

const RELOAD_MARKER = "mamadoc:stale-build-reload-at";
const RELOAD_COOLDOWN_MS = 60_000;
const RELOAD_QUERY_PARAM = "__stale_build_reloaded";
let reloadAttempted = false;

export function isStaleBuildError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /(?:failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed|loading chunk \d+ failed)/i.test(
    message,
  );
}

/** Reload at most once per minute, preventing an endless loop on real errors. */
export function reloadForStaleBuild(): boolean {
  if (typeof window === "undefined" || reloadAttempted) return false;
  reloadAttempted = true;

  try {
    const previous = Number(window.sessionStorage.getItem(RELOAD_MARKER));
    if (Number.isFinite(previous) && Date.now() - previous < RELOAD_COOLDOWN_MS) {
      reloadAttempted = false;
      return false;
    }
    window.sessionStorage.setItem(RELOAD_MARKER, String(Date.now()));
  } catch {
    // Storage may be unavailable in a private browser context. Keep a marker
    // in the URL for that one reload so an actual application error cannot
    // cause an endless refresh loop.
    const reloadUrl = new URL(window.location.href);
    if (reloadUrl.searchParams.has(RELOAD_QUERY_PARAM)) {
      reloadAttempted = false;
      return false;
    }
    reloadUrl.searchParams.set(RELOAD_QUERY_PARAM, "1");
    window.location.replace(reloadUrl.toString());
    return true;
  }

  window.location.reload();
  return true;
}

/** Catch Vite's preload event before React has a chance to render an error UI. */
export function installStaleBuildRecovery(): void {
  if (typeof window === "undefined") return;

  window.addEventListener("vite:preloadError", (event) => {
    event.preventDefault();
    reloadForStaleBuild();
  });
}
