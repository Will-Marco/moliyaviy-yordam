/** True when `url` is a page of `origin`. Compares parsed origins, so `http://host@evil` lookalikes fail. */
export function isSameOrigin(url: string, origin: string): boolean {
  try {
    return new URL(url).origin === origin
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
