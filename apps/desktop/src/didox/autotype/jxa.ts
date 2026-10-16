/**
 * macOS scripts, run as `osascript -l JavaScript -e <script> [args]`. They are strings because tsc emits no .js assets.
 * The typist gets the password on stdin only; argv carries just the timeout. Neither script ever prints the password.
 */

/** Exit codes the scripts end with; darwin.ts maps them. 1 is osascript's own error code. */
export const EXIT = {
  TYPED: 0,
  /** Preflight only: everything is in place. */
  OK: 0,
  NO_DIALOG: 10,
  NOT_FOCUSED: 11,
  REJECTED: 12,
  LAYOUT: 13,
  NO_PERMISSION: 14,
  /** Typing had started when focus left E-IMZO's password field: stopped, Return not pressed, Escape once if possible. */
  FOCUS_LOST: 15,
  /** An E-IMZO window was already open when the script started: nothing typed. */
  DIALOG_ALREADY_OPEN: 16,
  /** Bad input or an unexpected failure; the script prints nothing (a message could echo the password). */
  FAILED: 20,
} as const

/** Written to stdout right before the first character is typed; from then on any unconfirmed end is `interrupted`. */
export const TYPING_MARKER = 'TYPING'

/**
 * Written to stdout once the script has checked that no E-IMZO window was open and is watching for the dialog.
 * "Кириш" is clicked only after it: a dialog that opens before this line is refused as already open.
 */
export const READY_MARKER = 'READY'

/**
 * Input sources whose `keystroke` gives plain US-QWERTY characters. Anything else (Cyrillic, Uzbek, IMEs) stops the
 * run. US International is left out on purpose: its dead keys (' " ` ~ ^) would merge with the next character.
 */
export const LATIN_INPUT_SOURCES = [
  'com.apple.keylayout.ABC',
  'com.apple.keylayout.US',
  'com.apple.keylayout.USExtended',
  'com.apple.keylayout.British',
  'com.apple.keylayout.British-PC',
  'com.apple.keylayout.Australian',
  'com.apple.keylayout.Canadian',
  'com.apple.keylayout.Irish',
  'com.apple.keylayout.ABC-India',
] as const

/** How long the dialog may stay after Return before it counts as rejected (plan B3). */
export const CLOSE_WAIT_MS = 12_000

/** Helpers both scripts share: layout, E-IMZO windows, permission errors. Reads only, types nothing. */
const COMMON = `
ObjC.import('stdlib')
ObjC.import('Carbon')
ObjC.import('ApplicationServices')

var EXIT = ${JSON.stringify(EXIT)}
var LATIN = ${JSON.stringify(LATIN_INPUT_SOURCES)}
var PROCESS = 'E-IMZO'
var SECURE = 'AXSecureTextField'

// keystroke follows the current input source: a Cyrillic layout would type a different password.
function latinLayout() {
  var source = $.TISCopyCurrentKeyboardInputSource()
  if (!source) return false
  var id = ObjC.castRefToObject($.TISGetInputSourceProperty(source, $.kTISPropertyInputSourceID))
  return LATIN.indexOf(id.js) >= 0
}

// E-IMZO normally has no windows; its password dialog is one.
function windowCount(se) {
  var proc = se.processes.byName(PROCESS)
  return proc.exists() ? proc.windows.length : 0
}

// -1743 Apple events not permitted (Automation), -1719 / -25211 assistive access (Accessibility).
function isPermissionError(e) {
  var n = e && e.errorNumber
  if (n === -1743 || n === -1719 || n === -25211) return true
  return /assistive access|not authori[sz]ed|not allowed to send/i.test(String(e && e.message))
}
`

/** `osascript -l JavaScript -e EIMZO_PREFLIGHT_JXA` — no password, no input; exit OK / LAYOUT / NO_PERMISSION / DIALOG_ALREADY_OPEN. */
export const EIMZO_PREFLIGHT_JXA = `${COMMON}
function run() {
  var code = EXIT.FAILED
  try {
    if (!latinLayout()) code = EXIT.LAYOUT
    else if (!$.AXIsProcessTrusted()) code = EXIT.NO_PERMISSION
    // Also asks System Events, so a missing Automation grant shows up here and not mid-login.
    else if (windowCount(Application('System Events')) > 0) code = EXIT.DIALOG_ALREADY_OPEN
    else code = EXIT.OK
  } catch (e) {
    code = isPermissionError(e) ? EXIT.NO_PERMISSION : EXIT.FAILED
  }
  $.exit(code)
}
`

/** `osascript -l JavaScript -e EIMZO_TYPIST_JXA <dialogTimeoutMs>`, password on stdin. */
export const EIMZO_TYPIST_JXA = `${COMMON}
var CLOSE_WAIT_MS = ${CLOSE_WAIT_MS}
var typing = false
var escaped = false
// Keystrokes System Events accepted: 0 means nothing of the password reached the screen.
var sent = 0

function run(argv) {
  var code = EXIT.FAILED
  try {
    code = main(argv)
  } catch (e) {
    // Once typing started darwin.ts treats any unconfirmed end as interrupted; before that a permission error is reported.
    // A first keystroke that macOS refused sent nothing: that is still a permission problem, not a half-typed password.
    if (typing) {
      code = EXIT.FAILED
      if (sent === 0 && isPermissionError(e)) code = EXIT.NO_PERMISSION
      else try { escapeOnce(Application('System Events')) } catch (ignored) {}
    } else {
      code = isPermissionError(e) ? EXIT.NO_PERMISSION : EXIT.FAILED
    }
  }
  $.exit(code)
}

function main(argv) {
  var timeoutMs = Number(argv[0])
  if (!(timeoutMs > 0)) return EXIT.FAILED
  var data = $.NSFileHandle.fileHandleWithStandardInput.readDataToEndOfFile
  var password = $.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding).js
  if (!password) return EXIT.FAILED

  // 1) Latin layout. 2) Accessibility for the app that launched us (TCC checks the responsible process).
  if (!latinLayout()) return EXIT.LAYOUT
  if (!$.AXIsProcessTrusted()) return EXIT.NO_PERMISSION

  // 3) Only a window that appears after arming is typed into: one already open belongs to someone else.
  var se = Application('System Events')
  var baseline = windowCount(se)
  if (baseline > 0) return EXIT.DIALOG_ALREADY_OPEN
  writeStdout('${READY_MARKER}\\n')
  if (!waitFor(function () { return windowCount(se) > baseline }, timeoutMs)) return EXIT.NO_DIALOG

  // 4) Never type unless E-IMZO is frontmost and its password field holds the focus.
  var proc = se.processes.byName(PROCESS)
  proc.frontmost = true
  delay(0.4)
  if (!focusedOnPassword(se, proc)) return EXIT.NOT_FOCUSED

  // 5) Exactly once, one character at a time, re-checking the focus before each one and before Return. The marker goes
  //    out right before the first keystroke: a focus or permission failure before any key was sent is then reported as
  //    what it is, and a correct password is not marked rejected (2026-10-16).
  var chars = Array.from(password)
  password = null
  for (var i = 0; i < chars.length; i++) {
    if (!focusedOnPassword(se, proc)) return typing ? focusLost(se) : EXIT.NOT_FOCUSED
    if (!typing) {
      typing = true
      writeStdout('${TYPING_MARKER}\\n')
    }
    se.keystroke(chars[i])
    sent++
  }
  chars = null
  if (!focusedOnPassword(se, proc)) return focusLost(se)
  se.keyCode(36)

  // 6) Window count back to the baseline = accepted. Otherwise one Escape and stop; never typed again.
  if (waitFor(function () { return windowCount(se) <= baseline }, CLOSE_WAIT_MS)) return EXIT.TYPED
  escapeOnce(se)
  return EXIT.REJECTED
}

function waitFor(check, timeoutMs) {
  var deadline = Date.now() + timeoutMs
  for (;;) {
    if (check()) return true
    if (Date.now() >= deadline) return false
    delay(0.25)
  }
}

function writeStdout(text) {
  var out = $.NSString.alloc.initWithUTF8String(text).dataUsingEncoding($.NSUTF8StringEncoding)
  $.NSFileHandle.fileHandleWithStandardOutput.writeData(out)
}

function focusLost(se) {
  escapeOnce(se)
  return EXIT.FOCUS_LOST
}

// Escape goes only into E-IMZO, and at most once per run.
function escapeOnce(se) {
  if (escaped || frontmostName(se) !== PROCESS) return
  escaped = true
  se.keyCode(53)
}

function frontmostName(se) {
  var front = se.processes.whose({ frontmost: true })
  return front.length > 0 ? front[0].name() : null
}

function focusedOnPassword(se, proc) {
  if (frontmostName(se) !== PROCESS) return false
  var el = safely(function () { return proc.attributes.byName('AXFocusedUIElement').value() })
  if (!el) return false
  return safely(function () { return el.role() }) === SECURE || safely(function () { return el.subrole() }) === SECURE
}

function safely(get) {
  try {
    return get()
  } catch (e) {
    if (isPermissionError(e)) throw e
    return null
  }
}
`
