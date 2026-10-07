# Moliyaviy yordam — foiz hisobi

Firmalararo moliyaviy yordam shartnomalari bo'yicha oylik foiz hisobi. Spec: [docs/SRS.md](docs/SRS.md), holat: [docs/PROGRESS.md](docs/PROGRESS.md).

## Lokal ishga tushirish
Talab: Node 24, pnpm 11, PostgreSQL.

```bash
pnpm install
cp apps/api/.env.example apps/api/.env   # DATABASE_URL, JWT_SECRET, AUTH_PASSWORD_HASH ni to'ldiring
pnpm --filter api hash-password '<parol>' # AUTH_PASSWORD_HASH uchun
pnpm --filter api exec prisma migrate dev
pnpm dev:api    # http://localhost:3000/api
pnpm dev:web    # http://localhost:5173 (/api → 3000 ga proxy)
```

## Testlar
```bash
pnpm test        # unit (api + web)
pnpm test:e2e    # api e2e — moliyaviy_yordam_test bazasi (apps/api/.env.test)
```
