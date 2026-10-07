// Usage: pnpm hash-password '<password>' → prints an argon2id hash for AUTH_PASSWORD_HASH.
import { hash } from '@node-rs/argon2';

const password = process.argv[2];
if (!password || password.length < 12) {
  console.error('Usage: pnpm hash-password <password>  (min 12 characters)');
  process.exit(1);
}
console.log(await hash(password));
