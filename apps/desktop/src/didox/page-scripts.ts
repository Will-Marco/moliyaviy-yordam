import { FORBIDDEN_LABEL } from './contract.js'

/**
 * Scripts view.ts runs inside the Didox page (via executeJavaScript), plus small pure helpers. Kept out of view.ts so
 * the sign/send guard is tested without Electron. `snippet` is a locator expression from locators.ts.
 */

const forbiddenRegex = `new RegExp(${JSON.stringify(FORBIDDEN_LABEL.source)}, ${JSON.stringify(FORBIDDEN_LABEL.flags)})`

/** Result of a click script: what the element says, and where it is (for pointer clicks). */
export type ClickProbe =
  | { found: false }
  | { found: true; forbidden: boolean; label: string; clicked: boolean; x: number; y: number; covered: boolean }

/** Everything a person reads as the button's name: text, value, aria-label, title. */
const labelOf = `(el) => [el.innerText, el.textContent, el.value, el.getAttribute && el.getAttribute('aria-label'), el.getAttribute && el.getAttribute('title')]
  .filter((s) => typeof s === 'string').join(' ').replace(/\\s+/g, ' ').trim().slice(0, 300)`

/**
 * Resolves the element, refuses sign/send labels in the page itself (so nothing can change between check and click),
 * then either clicks it (`pointer: false`) or only reports its centre for a real mouse event (`pointer: true`).
 * For a pointer click the element actually under the centre is checked too: an overlay could be the one hit.
 */
export function clickScript(snippet: string, pointer: boolean): string {
  return `(() => {
  const el = (${snippet});
  if (!el || typeof el.getBoundingClientRect !== 'function') return { found: false };
  const forbidden = ${forbiddenRegex};
  const labelOf = ${labelOf};
  el.scrollIntoView && el.scrollIntoView({ block: 'center', inline: 'center' });
  const r = el.getBoundingClientRect();
  const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);
  const hit = document.elementFromPoint ? document.elementFromPoint(x, y) : null;
  const label = labelOf(el) + (hit && hit !== el ? ' ' + labelOf(hit) : '');
  const covered = ${pointer} && !!hit && hit !== el && !el.contains(hit);
  if (forbidden.test(label)) return { found: true, forbidden: true, label, clicked: false, x, y, covered };
  if (!${pointer}) el.click();
  return { found: true, forbidden: false, label, clicked: !${pointer}, x, y, covered };
})()`
}

/** Focuses the element for keyboard input; false if it is not there. */
export function focusScript(snippet: string): string {
  return `(() => {
  const el = (${snippet});
  if (!el || typeof el.focus !== 'function') return false;
  el.scrollIntoView && el.scrollIntoView({ block: 'center' });
  el.focus();
  return document.activeElement === el;
})()`
}

/** Evaluates the snippet and returns a JSON-safe copy (DOM nodes and functions are not serializable). */
export function readScript(snippet: string): string {
  return `(() => {
  const v = (${snippet});
  return v === undefined ? null : JSON.parse(JSON.stringify(v));
})()`
}

/** Like readScript, but a throwing snippet (element not rendered yet) counts as "not yet". */
export function pollScript(snippet: string): string {
  return `(() => {
  try {
    const v = (${snippet});
    return v === undefined ? null : JSON.parse(JSON.stringify(v));
  } catch (e) {
    return null;
  }
})()`
}

/** Human typing pause, 40–80 ms. */
export const charDelay = (random: () => number = Math.random) => 40 + Math.floor(random() * 41)

/** `2026-10-12T09-30-01-123Z-login-failed.png`: sortable by time, label reduced to safe characters. */
export function screenshotName(label: string, now: Date): string {
  const safe = label.replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'shot'
  return `${now.toISOString().replace(/[:.]/g, '-')}-${safe}.png`
}

/** Screenshot files beyond the newest `keep` (names sort by time). */
export function staleScreenshots(names: string[], keep: number): string[] {
  const shots = names.filter((n) => n.endsWith('.png')).sort()
  return shots.slice(0, Math.max(0, shots.length - keep))
}

export type PointerOutcome = 'clicked' | 'not_found' | 'forbidden' | 'covered' | 'unstable' | 'moved'

/**
 * A real mouse click, guarded: waits until two probes in a row see the element at the same spot (menus animate),
 * presses, probes again, and releases only if the same, allowed element is still under the pointer. If anything
 * changed — or a sign/send label appeared — the button is never released, so no click event fires.
 */
export async function pointerClick(io: {
  probe: () => Promise<ClickProbe>
  press: (x: number, y: number) => void
  release: (x: number, y: number) => void
  sleep: (ms: number) => Promise<void>
  settleTries?: number
}): Promise<{ outcome: PointerOutcome; label: string }> {
  const verdict = (p: ClickProbe): { outcome: PointerOutcome; label: string } | null =>
    !p.found ? { outcome: 'not_found', label: '' } : p.forbidden ? { outcome: 'forbidden', label: p.label } : p.covered ? { outcome: 'covered', label: p.label } : null
  let prev = await io.probe()
  const tries = io.settleTries ?? 10
  for (let i = 0; ; i++) {
    const bad = verdict(prev)
    if (bad) return bad
    if (i >= tries) return { outcome: 'unstable', label: '' }
    await io.sleep(100)
    const next = await io.probe()
    const stillBad = verdict(next)
    if (stillBad) return stillBad
    if (next.found && prev.found && next.x === prev.x && next.y === prev.y) {
      prev = next
      break
    }
    prev = next
  }
  if (!prev.found) return { outcome: 'not_found', label: '' }
  const { x, y } = prev
  io.press(x, y)
  const after = await io.probe()
  const bad = verdict(after)
  if (bad) return bad
  if (!after.found || after.x !== x || after.y !== y) return { outcome: 'moved', label: '' }
  io.release(x, y)
  return { outcome: 'clicked', label: after.label }
}

/** The element's current text as a person sees it: `value` for inputs, the trimmed text otherwise. */
export function valueScript(snippet: string): string {
  return `(() => {
  const el = (${snippet});
  if (!el) return null;
  const v = typeof el.value === 'string' ? el.value : (el.textContent || '');
  return v.replace(/\\s+/g, ' ').trim();
})()`
}

/**
 * Last resort for a field that will not take keystrokes. Didox's date box is masked and, inside the app's own
 * window, swallows them (the c1 gate saw `__.__.____` after two full attempts), while the very same box takes a
 * value set on the element with an `input` event — that is how the spike filled it. React's own listener is on the
 * document, so the dispatched event reaches it from this isolated world too.
 *
 * It is never trusted on its own: the caller reads the field back afterwards, exactly as it does after typing.
 */
export function setValueScript(snippet: string, text: string): string {
  return `(() => {
  const el = (${snippet});
  if (!el) return null;
  el.scrollIntoView && el.scrollIntoView({ block: 'center' });
  el.focus();
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value');
  if (!setter || !setter.set) return null;
  setter.set.call(el, ${JSON.stringify(text)});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return typeof el.value === 'string' ? el.value : null;
})()`
}

