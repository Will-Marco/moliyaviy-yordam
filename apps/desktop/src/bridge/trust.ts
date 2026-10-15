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

/** IPC handlers answer only the app window, and only while it shows the app's own origin. */
export function isTrustedSender(
  sender: { senderId: number; frameUrl: string },
  app: { webContentsId: number; origin: string },
): boolean {
  return sender.senderId === app.webContentsId && isSameOrigin(sender.frameUrl, app.origin)
}
