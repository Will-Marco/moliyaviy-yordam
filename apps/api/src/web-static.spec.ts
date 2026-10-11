import { spaFallback } from './web-static.js';

function run(path: string, method = 'GET') {
  let sent: string | null = null;
  let nexted = false;
  const req = { path, method } as { path: string; method: string };
  const res = { sendFile: (f: string) => (sent = f) } as unknown as { sendFile: (f: string) => void };
  spaFallback('/web')(req as never, res as never, () => (nexted = true));
  return { sent, nexted };
}

describe('spaFallback (M9b)', () => {
  it('serves index.html for app routes', () => {
    expect(run('/contracts').sent).toMatch(/index\.html$/);
    expect(run('/').sent).toMatch(/index\.html$/);
    expect(run('/invoices/2026-09').sent).toMatch(/index\.html$/);
  });
  it('never shadows the API', () => {
    expect(run('/api/companies')).toEqual({ sent: null, nexted: true });
  });
  it('lets a static asset request fall through (it has an extension)', () => {
    expect(run('/assets/app.js')).toEqual({ sent: null, nexted: true });
    expect(run('/favicon.ico')).toEqual({ sent: null, nexted: true });
  });
  it('ignores non-GET requests', () => {
    expect(run('/contracts', 'POST')).toEqual({ sent: null, nexted: true });
  });
});
