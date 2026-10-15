# Umumiy serverni sozlash (M13a) — qadam-baqadam

> Kim uchun: VPS'ni birinchi marta sozlayotgan odam. Fayllar — `deploy/` papkasida.
> Reja va qarorlar: `docs/plans/M13-shared-server.md`.

## 0. Kerakli narsalar

| Narsa | Izoh |
|---|---|
| VPS | Ubuntu 24.04 LTS, x86_64; 1–2 vCPU, **2 GB RAM**, 20–40 GB SSD |
| Domen | masalan `hisob.firma.uz`; DNS'da **A yozuvi** → VPS IP manzili |
| SSH kalit | parol bilan kirish o'chiriladi (§1) |
| Tashqi zaxira joyi | serverdan tashqarida — **Sir hal qiladi** (M13 §7.2) |

## 1. Serverni tayyorlash (bir marta)

```bash
# Docker (rasmiy o'rnatuvchi)
curl -fsSL https://get.docker.com | sh

# Faqat SSH, http va https ochiq
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw --force enable

# SSH faqat kalit bilan: /etc/ssh/sshd_config da `PasswordAuthentication no`, keyin
systemctl restart ssh
```

⚠️ `PasswordAuthentication no` dan oldin kalit bilan kira olishingizni **boshqa oynada** tekshiring.

## 2. Loyiha va sozlamalar

```bash
git clone https://github.com/Will-Marco/moliyaviy-yordam.git /opt/moliyaviy-yordam
cd /opt/moliyaviy-yordam/deploy
cp .env.example .env
chmod 600 .env
```

`.env` ni to'ldirish:
- `SITE_ADDRESS` — domen (`hisob.firma.uz`); `HTTP_PORT=80`, `HTTPS_PORT=443`.
- `POSTGRES_PASSWORD` — `openssl rand -hex 24`.
- `JWT_SECRET` — `openssl rand -hex 32`.
- `AUTH_PASSWORD_HASH` — umumiy parol (**kamida 16 belgi**) hash'i, bitta tirnoq ichida:

```bash
docker compose build migrate
docker compose run --rm --no-deps migrate pnpm --silent hash-password '<parol>'
```

## 3. Ishga tushirish va yangilash

```bash
deploy/scripts/deploy.sh
```

Skript: baza ishlab turgan bo'lsa **avval snapshot** (`backups/pre-deploy/`, oxirgi 10 ta) → build → migratsiyalar
(`migrate` konteyneri) → API va Caddy. Birinchi ishga tushishda Caddy domen uchun https sertifikatini o'zi oladi.

Tekshirish: brauzerda `https://<domen>` ochiladi, kirish ishlaydi; `http://` so'rovi https'ga o'tadi.

Kodni yangilash: `git pull`, keyin yana `deploy/scripts/deploy.sh`.

## 4. Zaxira

```bash
crontab -e
# har kuni 02:30 da; 14 kunlik + har oy 1-kunidagisi oylik sifatida qoladi
30 2 * * * /opt/moliyaviy-yordam/deploy/backup/pg-backup.sh >> /var/log/moliyaviy-backup.log 2>&1
```

Zaxira **haqiqatda tiklanishini** tekshirish (13a gate'i — runbook'ni yangilash dalil emas):

```bash
cd /opt/moliyaviy-yordam/deploy
backup/restore-test.sh "$(backup/pg-backup.sh)"
```

Bo'sh postgres'ga tiklaydi va jadvallardagi qatorlar sonini ishlab turgan baza bilan solishtiradi — `restore OK`
chiqishi kerak.

⚠️ **Serverdan tashqari nusxa hali sozlanmagan.** Bitta VPS buzilsa, baza ham, undagi zaxira ham birga ketadi.
Joy tanlangach (Sir) — haftalik nusxa shu bo'limga qo'shiladi.

## 5. Kerak bo'lganda

| Vaziyat | Nima qilish |
|---|---|
| Hammani tizimdan chiqarish (parol oshkor bo'ldi) | `.env` da `JWT_SECRET` ni yangisiga almashtirish → `docker compose up -d api` |
| Parolni o'zgartirish | §2 dagidek yangi hash → `.env` → `docker compose up -d api` |
| Loglar | `docker compose logs -f api` (yoki `caddy`, `db`) |
| Zaxiradan tiklash | `docker compose stop api` → `docker compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner' < <dump>` → `docker compose start api` (avval yangi snapshot oling) |
