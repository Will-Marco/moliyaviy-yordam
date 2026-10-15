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

## 6. Ma'lumotni ko'chirish (13b, bir martalik)

Desktop'dagi lokal bazadan serverga **faqat ma'lumot** ko'chadi (M13 §4.4): firmalar → shartnomalar → stavkalar,
operatsiyalar, qoralama belgilari → Didox bayroqlari (`didox-skips.json` dagi o'tkazishlar va jurnaldagi hal
qilinmagan `needs_check` lar). ID'lar o'zgarmaydi. Serverdagi baza §3 dagi `migrate deploy` dan keyin **bo'sh**
bo'lishi shart — bo'sh bo'lmasa yuklash hech narsani o'zgartirmay to'xtaydi. Skript:
`apps/api/scripts/migrate-data.ts` (repo va `pnpm install` qilingan kompyuterda, macOS/Linux terminalida).

**1. Desktop kompyuterida (Sir huzurida, ma'lumot kiritish to'xtatilgan).** Ilovani yoping. Ma'lumot papkasini
(`docs/runbooks/restore-backup.md` jadvalidagi joy) **nusxalang** — `db`, `didox-runs` va (bo'lsa)
`didox-skips.json`; asl papkaga tegilmaydi va bir oy saqlanadi (M13 §6). Eksport **o'sha kompyuterda** qilinadi:
desktop vaqtlarni kompyuter vaqt zonasida saqlagan, eksport ularni shu zona bo'yicha to'g'rilaydi.

Nusxa olingach, **shu kompyuterga yangi (server rejimidagi) desktop'ni o'rnating** va birinchi oynada server manzilini
kiriting. U `config.json` da bu kompyuterning nomini yasaydi — bayroqlarda "qaysi kompyuter" shu nom bilan ko'rinadi.
Eksportga aynan shu nom beriladi, aks holda ko'chgan bayroqlar bu kompyuterda "boshqa kompyuterniki" bo'lib ko'rinadi:

```bash
# desktop'dagi installLabel bilan bir xil: "<nom> (<installId ning 8 belgisi>)"
LABEL=$(node -e 'const c=require(process.argv[1]);const s=` (${c.installId.slice(0,8)})`;console.log(c.installName.slice(0,100-s.length)+s)' "<userData>/config.json")
node apps/api/scripts/migrate-data.ts export --userdata <nusxa papka> --install "$LABEL" --out moliyaviy-export.sql
```

`--install` — bayroqlarda "qaysi kompyuter" bo'lib ko'rinadigan nom. Skript jadvallar bo'yicha qator sonini va
ko'chmagan bayroqlarni (shartnomasi bazada yo'q) yozadi. Jurnalda ilova o'zi tugatadigan ish qolgan bo'lsa (yopilmay
qolgan run, API'ga yuborilmagan Didox ID) — to'xtaydi: ilovani internet bilan bir marta ochib-yoping, qaytadan
nusxalang. Fayl — butun baza: faqat egasi o'qiy oladi, ish tugagach o'chiriladi.

**2. Serverda.** Faylni serverga o'tkazing (`scp moliyaviy-export.sql <server>:/opt/moliyaviy-yordam/deploy/`), keyin:

```bash
cd /opt/moliyaviy-yordam/deploy
backup/pg-backup.sh pre-deploy
docker compose exec -T db sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < moliyaviy-export.sql
```

Hammasi bitta tranzaksiyada: oxirida `COMMIT` chiqadi. `Target database is not empty` — baza bo'sh emas, hech narsa
yozilmadi (ikkinchi marta yuklash ham shunday to'xtaydi).

**3. Tekshirish (13b gate: "serverdagi raqamlar bugungi bilan bir xil").** Nusxa turgan kompyuterda:

```bash
pnpm --filter api build
TARGET_SECRET='<serverdagi .env dagi ROBOT_SECRET yoki JWT_SECRET>' \
node apps/api/scripts/migrate-data.ts verify --userdata <nusxa papka> --install "<1-qadamdagi nom>" \
  --target https://<domen> \
  -- ssh <server> 'cd /opt/moliyaviy-yordam/deploy && docker compose exec -T db sh -c "psql -tA -U \$POSTGRES_USER -d \$POSTGRES_DB"'
```

Skript API'ni nusxaning **yana bir vaqtinchalik nusxasida** ko'taradi va ikkala API'dan bir xil narsani so'raydi:
firmalar, shartnomalar (jami summalar, stavkalar, operatsiyalar), har oy uchun fakturalar, butun davr hisoboti; Didox
bayroqlari fayllarning o'zi bilan, jadvallardagi qator soni `--` dan keyingi buyruq (serverdagi psql) bilan
solishtiriladi. Natija **`verify: no differences`** bo'lishi kerak; har farq yo'li bilan chiqadi. Keyin brauzerda SRS
raqamlarini ko'z bilan ham tekshiring (M13 §6).

Lokal sinovda (`SITE_ADDRESS=localhost`) Caddy'ning o'z sertifikati uchun: `docker compose cp
caddy:/data/caddy/pki/authorities/local/root.crt .` va `NODE_EXTRA_CA_CERTS=root.crt` bilan ishga tushiring.
