/** True when `url` is a page of `origin`. Compares parsed origins, so `http://host@evil` lookalikes fail. */
export function isSameOrigin(url: string, origin: string): boolean {
  try {
    return new URL(url).origin === origin
  } catch {
    return false
  }
}

/**
 * Only web links leave the app for the browser. The page now comes from the internet (M13), and handing the OS a
 * `file:`, `smb:` or custom-protocol URL from it is a known route from a page to running local programs.
 */
export function isExternalWebUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url)
    return protocol === 'https:' || protocol === 'http:'
  } catch {
    return false
  }
}

/** At most one link from the page reaches the browser per this many ms. */
const EXTERNAL_EVERY_MS = 2_000

/**
 * Hands the page's web links to the OS browser (security review L2). Opening needs no click from the person, so a
 * hostile page could fire tabs at the browser in a loop; one link per EXTERNAL_EVERY_MS is plenty for a person who
 * clicks, and the rest are dropped.
 */
export function createExternalOpener({ open, now = Date.now }: { open: (url: string) => void; now?: () => number }): (url: string) => void {
  let last = Number.NEGATIVE_INFINITY
  return (url) => {
    if (!isExternalWebUrl(url) || now() - last < EXTERNAL_EVERY_MS) return
    last = now()
    open(url)
  }
}

/**
 * Browser permissions for pages in the app window's session (security review M2). The page is from the internet, so
 * it gets none — no camera, microphone, location, notifications, devices or clipboard reading — except writing the
 * clipboard, which the web app's copy buttons use (apps/web CopyButton), and only for the app's own origin.
 */
export function isPermissionAllowed(permission: string, requestingUrl: string, origin: string): boolean {
  return permission === 'clipboard-sanitized-write' && isSameOrigin(requestingUrl, origin)
}

/** IPC handlers answer only the app window, and only while it shows the app's own origin. */
export function isTrustedSender(
  sender: { senderId: number; frameUrl: string },
  app: { webContentsId: number; origin: string },
): boolean {
  return sender.senderId === app.webContentsId && isSameOrigin(sender.frameUrl, app.origin)
}
