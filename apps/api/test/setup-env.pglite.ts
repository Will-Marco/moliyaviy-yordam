import { config } from 'dotenv';

// Same credentials as the pg e2e run, but against a fresh in-memory PGlite (M9a parity check).
config({ path: '.env.test', override: true, quiet: true });
process.env.DB_DRIVER = 'pglite';
process.env.PGLITE_DATA_DIR = '';
delete process.env.DATABASE_URL;
