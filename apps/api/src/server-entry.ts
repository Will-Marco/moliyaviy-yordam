import { bootstrap } from './server.js';

/**
 * Child-process entry for the desktop shell (M9b). The Electron main process spawns this with the
 * environment already set (DB_DRIVER, PGLITE_DATA_DIR, WEB_ROOT, PORT=0 …), so heavy work (PGlite
 * WASM, the interest engine, Excel) stays off the UI process. Reports the chosen port to the parent.
 */
const app = await bootstrap();
const address = app.getHttpServer().address();
const port = typeof address === 'object' && address ? address.port : Number(address);
if (process.send) process.send({ type: 'listening', port });
else console.log(`LISTENING ${port}`);
