import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

const MAX_FAILURES = 5;
const WINDOW_MS = 60_000;

/**
 * Locks a client IP for a minute after repeated failed logins. Successful logins are not counted,
 * so an office full of accountants behind one IP is never locked out by normal use.
 * In-memory: correct for the single API process this app runs as.
 */
@Injectable()
export class LoginLimiter {
  private readonly failures = new Map<string, number[]>();

  assertAllowed(ip: string, now = Date.now()): void {
    if (this.recent(ip, now).length >= MAX_FAILURES) {
      throw new HttpException(
        "Juda ko'p noto'g'ri urinish. 1 daqiqadan keyin qayta urinib ko'ring.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  recordFailure(ip: string, now = Date.now()): void {
    this.failures.set(ip, [...this.recent(ip, now), now]);
  }

  reset(ip: string): void {
    this.failures.delete(ip);
  }

  private recent(ip: string, now: number): number[] {
    const recent = (this.failures.get(ip) ?? []).filter((at) => now - at < WINDOW_MS);
    if (recent.length) this.failures.set(ip, recent);
    else this.failures.delete(ip);
    return recent;
  }
}
