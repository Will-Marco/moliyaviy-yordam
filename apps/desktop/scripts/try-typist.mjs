// Runs the E-IMZO typist exactly as the app runs it, and prints what it said.
//
// Why it exists: the app reports the typist's exit code, and a code PowerShell chose itself (1) used to arrive with
// no message at all — the Windows gate stopped there. This runs the same script, the same way, with a password that
// is not a password, and shows stdout, stderr and the exit code.
//
//   node apps\desktop\scripts\try-typist.mjs              # the typist (no dialog expected: exit 10)
//   node apps\desktop\scripts\try-typist.mjs --preflight  # the read-only check (exit 0, or 16 if a dialog is open)
//   node apps\desktop\scripts\try-typist.mjs --dump        # also write the script to typist.ps1 to read it
//
// Needs `pnpm build` first (it loads the built script). Types nothing unless E-IMZO's dialog is open: with none
// there it waits a few seconds and gives up. Never run it with a real ERI password.

import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { EIMZO_PREFLIGHT_PS, typistScript } from '../dist/didox/autotype/powershell.js'

const DUMMY_PASSWORD = 'BU-PAROL-EMAS'
const WAIT_MS = 3_000

const preflight = process.argv.includes('--preflight')
const script = preflight ? EIMZO_PREFLIGHT_PS : typistScript(WAIT_MS)

if (process.argv.includes('--dump')) {
  const file = preflight ? 'preflight.ps1' : 'typist.ps1'
  writeFileSync(file, script, 'utf8')
  console.log(`Skript yozildi: ${file}`)
}

// Exactly what win32.ts passes.
const args = [
  '-NoProfile',
  '-NonInteractive',
  '-ExecutionPolicy',
  'Bypass',
  '-EncodedCommand',
  Buffer.from(script, 'utf16le').toString('base64'),
]

console.log(`Ishga tushirilmoqda: powershell.exe (${preflight ? 'preflight' : 'typist'})\n`)
const child = spawn('powershell.exe', args, { stdio: ['pipe', 'pipe', 'pipe'] })

let out = ''
let err = ''
child.stdout.on('data', (c) => (out += String(c)))
child.stderr.on('data', (c) => (err += String(c)))
child.on('error', (e) => console.error('Ishga tushmadi:', e.message))
child.on('close', (code) => {
  console.log('--- stdout ---')
  console.log(out.trim() || '(bo\'sh)')
  console.log('--- stderr ---')
  console.log(err.trim() || '(bo\'sh)')
  console.log('--- exit code ---')
  console.log(code)
  console.log(
    '\nKutilgan: typist uchun 10 (parol oynasi chiqmadi), preflight uchun 0.\n' +
      '1 — PowerShell xatosi: yuqoridagi stderr matni sababni aytadi.',
  )
})

if (!preflight) {
  child.stdin.on('error', () => undefined)
  child.stdin.write(DUMMY_PASSWORD)
  child.stdin.end()
}
