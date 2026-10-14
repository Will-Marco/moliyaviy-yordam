# E-IMZO bilan Didox'ga ERI orqali kirish — tadqiqot (spike)

Sana: 2026-10-11. Til: o'zbekcha (lotin), texnik atamalar inglizcha. Kod o'zgartirilmagan.
Maqsad: mahalliy (Windows) o'rnatilgan ilova buxgalterning ERI (`.pfx`, E-IMZO orqali) bilan Didox'ga **faqat login** qilishi va qoralama (`002`) yaratishi uchun E-IMZO qanday ishlashini aniqlash. Konstitutsiya §12–16: ilova hujjatni **hech qachon imzolamaydi/yubormaydi**; `.pfx` E-IMZO'da qoladi; parolni buxgalter E-IMZO'ning **o'z oynasida** kiritadi; login xatosida avtomatik qayta urinish yo'q.

Belgilar: **[TASDIQLANDI]** — birlamchi manba to'g'ridan-to'g'ri aytadi (rasmiy hujjat, rasmiy demo kod, Didox'ning o'z JS'i). **[XULOSA]** — mening xulosam. **[TEKSHIRILMADI]** — tasdiqlab bo'lmadi.

Manba turlari haqida halol eslatma:
- "Birlamchi" = e-imzo.soliq.uz / test.e-imzo.uz (NITs NT, E-IMZO muallifi), api-docs.didox.uz, didox.uz JS bundle.
- `github.com/qo0p/e-imzo-doc` — E-IMZO ekosistemasi bo'yicha batafsil, E-IMZO v6 ni qamrab oladigan, test.e-imzo.uz demosiga mos hujjat, lekin **rasmiy sayt emas** (GitHub). Shuning uchun undan olingan da'volarda `(ikkilamchi: qo0p)` deb yozaman; ular test.e-imzo.uz demo kodiga mos kelgan joyda **[TASDIQLANDI]** deb qoldirdim.
- Maxfiy qiymatlar (Didox'ning `Partner-Authorization` tokeni, API-KEY hex satrlari, RSA kalit) bu hujjatga **ko'chirilmadi**.

---

## 0. Eng muhim topilmalar (TL;DR)

1. **E-IMZO — mahalliy Java ilova** (Windows uchun JRE 1.8 / JRE 17 / JRE'siz zip variantlari), `127.0.0.1` da WebSocket serveri: `wss://127.0.0.1:64443/service/cryptapi` (TLS) va `ws://127.0.0.1:64646/service/cryptapi` (oddiy). Xabarlar JSON: `{plugin, name, arguments}`. **[TASDIQLANDI]**
2. **Parolni E-IMZO'ning o'zi so'raydi** (`create_pkcs7` chaqirilganda), chaqiruvchi parolni ko'rmaydi → bizning qoidamizga mos. `load_key` parol so'ramaydi. **[TASDIQLANDI, ikkilamchi: qo0p]**
3. **Kirish nazorati: API-KEY (domen + kalit).** `localhost` va `127.0.0.1` uchun ichki kalitlar bor (rasmiy demoda ochiq); E-IMZO v6 da domen bo'yicha kalitni o'zi yuklashi mumkin. Origin'ni tekshirish ehtimoli yuqori, lekin to'g'ridan-to'g'ri "Origin tekshiriladi" degan matn topilmadi. Node.js klient mumkin, lekin hands-on test kerak. **[XULOSA]** → **2026-10-12 amalda tekshirildi:** Node 24 `WebSocket` API-KEY va Origin'siz `version` + `pfx.list_all_certificates` oldi (64646 va 64443, v6.4.7, macOS). `load_key`/`create_pkcs7` sinalmadi. Batafsil: didox-flow.md §1a
4. **Didox login oqimi** (4 qadam): `list_all_certificates` → `load_key` → `create_pkcs7(INN base64, keyId, "no")` → Didox `POST /v1/dsvs/timestamp` → `POST /v1/auth/{INN}/token/ru {signature}`. **[TASDIQLANDI]**
5. **ASOSIY TO'SIQ / QAROR TALAB QILADI:** Didox veb-ilovasi o'z so'rovlariga `Partner-Authorization` sarlavhasini qo'shadi — bu **Didox'ning o'z, JS ichiga joylangan partner tokeni**, RSA-OAEP bilan shifrlangan `{token, iat}` ko'rinishida. "Veb-ilova ishlatadigan ichki endpoint'lar"ni qayta ishlatish uchun shu tokenni va shifrlash kalitini Didox JS'idan olib ishlatish kerak bo'lardi (bu 6-bo'limda). Bu "ichki endpoint'ni chaqirish"dan jiddiyroq: **Didox'ning o'z kredensialini (partner tokenini) ishlatish**. Rasmiy hujjat esa ERI-login'ni ham partner token talab qiladi deydi. **[TASDIQLANDI]**
6. **Qorovulsiz (kuniga 06:00) ishga tushish — amalda mumkin emas:** parol har safar E-IMZO oynasida kiritiladi; "6 soat eslab qolish" faqat buxgalter oynada qo'lda belgilasa va E-IMZO ishlab turgan bo'lsa ishlaydi. **[TASDIQLANDI, ikkilamchi: qo0p]**
7. **macOS uchun E-IMZO bor** (v6.4.7 `.dmg`, arm64 va Intel) — rasmiy yuklab olish sahifasida. **[TASDIQLANDI]**

---

## 1. E-IMZO arxitekturasi

### 1.1. Nima lokal ishlaydi

- E-IMZO — kompyuterga o'rnatiladigan dastur; Didox hujjati: "для корректной интеграции необходимо установить и запустить приложение E-IMZO"; o'rnatilganda API hujjati `https://127.0.0.1:64443/apidoc.html` da mavjud. **[TASDIQLANDI]** ([Didox: 01. Работа с E-IMZO](https://api-docs.didox.uz/ru/integrators-eimzo))
- **Java asosida:** rasmiy yuklab olish ro'yxati: "Windows JRE 1.8", "Windows JRE 17", "Windows no JRE", "Linux MacOS" (`.tar.gz`), Ubuntu 24 `.deb`, macOS `.dmg` (arm64/amd64); Windows variantlari uchun "antivirus yolg'on ishga tushishi mumkin, istisno qoidasi qo'shing" deb yozilgan; hozirgi versiya v6.4.7. **[TASDIQLANDI]** ([e-imzo.soliq.uz yuklab olish sahifasi, JS bundle `_app-416dee9fd3e191bd.js`](https://e-imzo.soliq.uz/download/); rasmiy havolalar `https://dls.soliq.uz/v6.4.7/E-IMZO-v6.4.7.zip`, `...-jre17.zip`, `...-no-jre.zip`, `...-arm64.dmg`, `...-amd64.dmg`, `...tar.gz`)
- "Java-ilova" ekanligining qo'shimcha tasdig'i: ID-karta ishlashi "посредством установленного Java-апплета E-IMZO" deb tasvirlangan; Windows'da ishga tushmasa — TCP dynamic port diapazoni muammosi (`netsh int ipv4 set dynamicport tcp ...`). **[TASDIQLANDI, ikkilamchi: qo0p]** ([qo0p/e-imzo-doc](https://github.com/qo0p/e-imzo-doc))
- Windows o'rnatuvchisi administrator huquqi bilan ishga tushiriladi; o'rnatish tugagach "asosiy sertifikatni yuklash" (root cert) so'raladi — "Да" bosiladi. Keyin brauzerda `https://127.0.0.1:64443/` ochilib, Firefox'da xavfsizlik istisnosi qo'shiladi. **[TASDIQLANDI]** ([e-imzo.soliq.uz/install](https://e-imzo.soliq.uz/install/), [esi.uz E-IMZO yordami](https://esi.uz/index/help/eimzo))
- Tray menyusi bor (ichida "Режим разработчика", "Разработка → Эмулятор ID-карты" kabi bandlar). **[TASDIQLANDI, ikkilamchi: qo0p]**

### 1.2. WebSocket endpoint'lar va portlar

| Endpoint | Qachon | Manba |
|---|---|---|
| `wss://127.0.0.1:64443/service/cryptapi` | sahifa `https:` bo'lsa | rasmiy `e-imzo.js`: `window.location.protocol === "https:" ? "wss://127.0.0.1:64443" : "ws://127.0.0.1:64646"` + `/service/cryptapi` — [test.e-imzo.uz/demo/e-imzo.js](https://test.e-imzo.uz/demo/e-imzo.js) **[TASDIQLANDI]** |
| `ws://127.0.0.1:64646/service/cryptapi` | sahifa `http:` bo'lsa (TLS yo'q) | xuddi shu fayl **[TASDIQLANDI]**; Didox'ning o'z JS'ida ham aynan shu mantiq ([didox.uz/index_e82707fb.js](https://didox.uz/index_e82707fb.js)) **[TASDIQLANDI]** |
| `http://127.0.0.1:64646/apidoc.html` va `https://127.0.0.1:64443/apidoc.html` | API hujjati (E-IMZO ishlab turganda) | [Didox 01](https://api-docs.didox.uz/ru/integrators-eimzo), [qo0p](https://github.com/qo0p/e-imzo-doc) |

- 64443 portidagi TLS sertifikatini **E-IMZO o'zi o'rnatgan root sertifikat** imzolaydi; macOS yuklab olish bo'limida "SSL-сертификат E-IMZO" (`https://dls.soliq.uz/e-imzo-chain.pem`) alohida havola sifatida berilgan. **[TASDIQLANDI]** ([e-imzo.soliq.uz yuklab olish](https://e-imzo.soliq.uz/download/)). Bu Node.js uchun muhim: Node o'z CA ro'yxatidan foydalanadi, OS do'konidan emas → `ca` yoki `NODE_EXTRA_CA_CERTS` bilan shu zanjirni berish kerak bo'ladi **[XULOSA]**; yoki TLS'siz 64646 portidan foydalanish.
- `ws://127.0.0.1:64646` v6 da hamon ochiqmi — Didox'ning hozirgi JS'i va hozirgi `e-imzo.js` hamon unga murojaat qiladi, ya'ni ehtimol ha; ammo v6.4.7 da portni tekshirish **[TEKSHIRILMADI]**.

### 1.3. JSON xabar formati

Har chaqiruv — bitta JSON: `{"plugin": "...", "name": "...", "arguments": [...]}`. Javob — JSON, doim `success: true|false` (xato bo'lsa `reason`). Maxsus xabarlar plugin'siz: `{name: "version"}`, `{name: "apidoc"}`, `{name: "apikey", arguments: [domen1, kalit1, domen2, kalit2, ...]}`. **[TASDIQLANDI]** ([e-imzo.js](https://test.e-imzo.uz/demo/e-imzo.js), [e-imzo-client.js](https://test.e-imzo.uz/demo/e-imzo-client.js))

Muhim: rasmiy `CAPIWS.callFunction` **har chaqiruvga yangi WebSocket ochadi**, bitta javob olgach `socket.close()` qiladi. Ya'ni `keyId` WebSocket ulanishiga emas, **E-IMZO jarayoniga** bog'langan (Didox ham `keyId` ni `sessionStorage` da saqlab, keyingi chaqiruvlarda qayta ishlatadi). **[TASDIQLANDI]** ([e-imzo.js](https://test.e-imzo.uz/demo/e-imzo.js); [didox.uz JS: `loadPfxKey`/`getSignature`](https://didox.uz/index_e82707fb.js))

Plugin'lar (rasmiy klientdan): `pfx` (`list_all_certificates`, `load_key`, `verify_password`, `change_password`), `pkcs7` (`create_pkcs7`, `append_pkcs7_attached`, `attach_timestamp_token_pkcs7`), `ftjc`, `idcard`, `baikey`, `ckc`; Didox JS'i qo'shimcha `certkey` plugin'idan ham foydalanadi. **[TASDIQLANDI]** ([e-imzo-client.js](https://test.e-imzo.uz/demo/e-imzo-client.js), [didox.uz JS](https://didox.uz/index_e82707fb.js)). Versiya chegaralari: 3.36 (yangi API), 4.12 (idcard), 4.86 (baikey/ckc); demo minimal talab 3.37. **[TASDIQLANDI]** ([e-imzo-client.js](https://test.e-imzo.uz/demo/e-imzo-client.js), [e-imzo-init.js](https://test.e-imzo.uz/demo/e-imzo-init.js))

### 1.4. Rasmiy JS klient va qayerda e'lon qilingan

- Rasmiy demo sayt: [test.e-imzo.uz/demo/](https://test.e-imzo.uz/demo/) — quyidagi fayllar ochiq: `e-imzo.js` (`CAPIWS` + Base64, v2.1.4), `e-imzo-client.js` (`EIMZOClient`: `checkVersion`, `installApiKeys`, `listAllUserKeys`, `loadKey`, `createPkcs7`, `changeKeyPassword`), `e-imzo-init.js` (`AppLoad`, API_KEYS massivi). **[TASDIQLANDI]**
  - `https://test.e-imzo.uz/demo/e-imzo.js`, `.../e-imzo-client.js`, `.../e-imzo-init.js` (bevosita yuklab o'qildi).
- npm'da rasmiy paket yo'q (qidiruvda topilmadi) **[TEKSHIRILMADI]**; uchinchi tomon: `@islom929/react-eimzo` ([npm](https://www.npmjs.com/package/@islom929/react-eimzo)), Python klient [islomN/eimzo_plugin](https://github.com/islomN/eimzo_plugin) (3.3-bo'limga qarang), Dart `e_imzo` ([pub.dev](https://pub.dev/documentation/e_imzo/latest/)). Ularni bog'liqlik sifatida olish tavsiya etilmaydi **[XULOSA]**.

---

## 2. Kirish nazorati (API-KEY, Origin, Node.js)

### 2.1. API-KEY mexanizmi

- **API-KEY — domenga bog'langan satr**; "разрешает странице этого домена вызывать функции локального E-IMZO". Brauzer → lokal E-IMZO (`CAPIWS.apikey`). Kalitni NITs NT beradi, bitta production domen uchun bitta kalit; boshqa domen/subdomen — alohida kalit; IP bo'yicha production kalit berilmaydi. **[TASDIQLANDI, ikkilamchi: qo0p §0.3]** ([qo0p/e-imzo-doc](https://github.com/qo0p/e-imzo-doc))
- **`localhost` va `127.0.0.1` uchun tayyor kalitlar mavjud** — rasmiy demoda ochiq e'lon qilingan: [e-imzo-init.js](https://test.e-imzo.uz/demo/e-imzo-init.js) va `e-imzo-client.js` ichidagi `API_KEYS` ("localhost", "127.0.0.1"). Bu kalitlar "faqat lokal sahifa uchun yaroqli". **[TASDIQLANDI]** (kalit qiymatlari bu hujjatga ko'chirilmadi — o'sha ikki fayldan olinadi). Didox'ning o'z JS'i ham xuddi shu `localhost`/`127.0.0.1` juftliklarini + o'z `didox.uz` kalitini yuboradi. **[TASDIQLANDI]** ([didox.uz JS](https://didox.uz/index_e82707fb.js))
- Demo `e-imzo-init.js` da bundan tashqari `'null'` domeni uchun ham kalit bor (Origin `null` — odatda `file://` sahifalar/sandbox'dagi iframe'lar uchun). Bu hujjatlashtirilmagan; Electron `file://` rejimi uchun imkon bo'lishi mumkin. **[TASDIQLANDI faktni; qo'llanilishi — TEKSHIRILMADI]**
- **E-IMZO v6:** "локальное приложение может загрузить API-KEY само по домену открытой страницы. Явный вызов `CAPIWS.apikey` ... нужен для более ранних версий." **[TASDIQLANDI, ikkilamchi: qo0p]** — ya'ni v6 domenni (ehtimol `Origin` dan) o'zi aniqlaydi. **[XULOSA]**
- Test domen/IP uchun kalit o'rniga tray menyusida **"Режим разработчика"** yoqiladi (production domen kalitini almashtirmaydi). **[TASDIQLANDI, ikkilamchi: qo0p]** — bu bizga ham test vaqtida foydali bo'lishi mumkin **[XULOSA]**.

### 2.2. E-IMZO WebSocket `Origin` sarlavhasini tekshiradimi?

- Didox hujjati ulanish sarlavhalari sifatida `Host: 127.0.0.1:64443` va **`Origin: https://{your web site}`** ni ko'rsatadi. **[TASDIQLANDI]** ([Didox 01](https://api-docs.didox.uz/ru/integrators-eimzo)). Demak Origin ulanishning rasmiy qismi.
- Domen kalitining mantiqi (domen → kalit) E-IMZO tomonda domenni qayerdan bilishini talab qiladi; brauzer WebSocket'da yagona ishonchli manba — `Origin`. Shuning uchun E-IMZO Origin'ni o'qiydi/tekshiradi deb **ehtimol** aytish mumkin. **[XULOSA]** "Origin tekshiriladi" deb to'g'ridan-to'g'ri yozilgan matn topilmadi. **[TEKSHIRILMADI]**
- Qaysi qiymatlar qabul qilinishi: `http://localhost:<port>` → domen `localhost`; `http://127.0.0.1:<port>` → domen `127.0.0.1` (ikkalasi **boshqa-boshqa** kalit). Portni hisobga olish-olmasligi **[TEKSHIRILMADI]**. **[XULOSA]**

### 2.3. Brauzer bo'lmagan jarayon (Node.js / Electron) ulana oladimi?

- **Uchinchi tomon dalil:** Python klient `islomN/eimzo_plugin` brauzersiz ishlaydi: `websocket.WebSocketApp("ws://127.0.0.1:64646/service/cryptapi", header={"host": "localhost"})`, API_KEYS ichida `localhost`/`127.0.0.1` kalitlari, `list_all_certificates`/`load_key`/`create_pkcs7` ni chaqiradi (1C integratsiyasi uchun). **[TASDIQLANDI faktni]** ([CAPIWS.py](https://raw.githubusercontent.com/islomN/eimzo_plugin/master/CAPIWS.py), [EimzoClient.py](https://raw.githubusercontent.com/islomN/eimzo_plugin/master/EimzoClient.py)). Bu **ishlayotganini isbotlamaydi** (qaysi versiyada sinalgani noma'lum). Python `websocket-client` Origin'ni standart bo'yicha `http://127.0.0.1:64646` kabi qo'yadi deb eslayman — **[TEKSHIRILMADI]**.
- Node `ws` kutubxonasi `origin` opsiyasini qo'llab-quvvatlaydi; sukut bo'yicha Origin yubormaydi (**[XULOSA]**, `ws` hujjati: [ws.md](https://github.com/websockets/ws/blob/master/doc/ws.md)). Shuning uchun Node'dan ulanishda `{ origin: 'http://127.0.0.1' }` (yoki `http://localhost`) berish va `Host`/TLS'ni to'g'ri sozlash kerak. TLS server nomiga `host:port` emas, faqat host berilishi kerak (Java bu holatda `illegal_parameter` bilan rad etadi — boshqa klient muallifi xabari, ikkilamchi). **[XULOSA]**
- **Etika/xavfsizlik:** Origin'ni `https://didox.uz` deb **soxtalashtirib, Didox'ning API-KEY'ini ishlatish — tavsiya etilmaydi** (bu uning domen nazoratini aldab o'tish). Faqat `localhost`/`127.0.0.1` ichki kalitlari. **[XULOSA]**
- **Tavsiya etilgan yo'l (ikki variant), 8-bo'limda:** (A) E-IMZO bilan **brauzer sahifasi** gaplashadi (sahifa `http://localhost:PORT` dan beriladi, Origin = `localhost`, standart rasmiy usul); (B) Node backend to'g'ridan-to'g'ri ulanadi (Origin qo'lda). A variant rasmiy ishlatilishga mos va eng kam xavfli. **[XULOSA]**

---

## 3. `.pfx` kalitdan foydalanish

### 3.1. Kalitlar ro'yxati

`{"plugin":"pfx","name":"list_all_certificates"}` → `{"certificates":[{"disk","path","name","alias"}], "success":true}`. `alias` — X.500 satri: `cn, name, surname, o, uid, 1.2.860.3.16.1.2 (PINFL), 1.2.860.3.16.1.1 (yuridik INN), t (lavozim), serialnumber, validfrom, validto`. Yuridik shaxs sertifikatida `...1.1=INN` bor, jismoniy shaxsda faqat PINFL. **[TASDIQLANDI]** ([Didox 01](https://api-docs.didox.uz/ru/integrators-eimzo), [qo0p: OID jadvali](https://github.com/qo0p/e-imzo-doc))

`.pfx` fayllar E-IMZO ko'radigan kalit papkasida turadi. Misolda `"disk":"C:\\"`. macOS qo'llanmasida papka `/Volumes/DSKEYS` (nomi aynan shunday bo'lishi shart) — Windows'dagi aniq papka manbalarda tasdiqlanmadi. **[TASDIQLANDI macOS uchun, ikkilamchi: Gazeta.uz]**; Windows papkasi **[TEKSHIRILMADI]**.

### 3.2. `load_key` — kim parol so'raydi?

- `load_key` argumentlari: `[disk, path, name, alias]` → `{"keyId": "...", "type": "PFX_KEY_STORE", "success": true}`. Parol argumenti **yo'q**. **[TASDIQLANDI]** ([Didox 01](https://api-docs.didox.uz/ru/integrators-eimzo), [e-imzo-client.js `loadKey`](https://test.e-imzo.uz/demo/e-imzo-client.js))
- **Parolni E-IMZO ilovasining o'zi so'raydi**: "Пароль PFX спрашивает само приложение E-IMZO. Сайт пароль не получает и не может включить запоминание из JavaScript." Oyna `create_pkcs7` chaqiruvida paydo bo'ladi (qo0p ketma-ketlik diagrammasi: `create_pkcs7` → "запрос Пароля" → foydalanuvchi parol kiritadi → E-IMZO yopiq kalitni ochadi). `verify_password(keyId)` ham xuddi shunday oyna ochadi (parolni oldindan tekshirish uchun). **[TASDIQLANDI, ikkilamchi: qo0p §0.1, §1.3]** ([qo0p/e-imzo-doc](https://github.com/qo0p/e-imzo-doc)); Didox JS'i xato matni sifatida "BadPaddingException → noto'g'ri parol"ni ko'rsatadi ([e-imzo-init.js](https://test.e-imzo.uz/demo/e-imzo-init.js)). **→ bizning qoida (parolni ilova so'ramaydi) bajariladi.**

### 3.3. `keyId` umri va bir yuklash bilan bir nechta imzo

(Hammasi ikkilamchi: [qo0p §1.3](https://github.com/qo0p/e-imzo-doc), demo kodiga mos.)
- Har `load_key` **yangi** `keyId` yaratadi; qayta `load_key` — yangi sessiya, parol yana so'raladi.
- `keyId` sessiyasi **24 soat** yashaydi; undan keyin `create_pkcs7` "ключ по идентификатору не найден" deydi → qayta `load_key`.
- Oynada "Запомнить на 6 час." belgisi bor; **sukut bo'yicha o'chiq**, uni faqat foydalanuvchi qo'lda belgilaydi; belgilansa, shu `keyId` bilan keyingi `create_pkcs7` 6 soat parol so'ramaydi. Belgilanmasa — parol shu `keyId` uchun **1 daqiqa** eslab qolinadi.
- Parol E-IMZO **xotirasida** saqlanadi (diskka emas), E-IMZO qayta ishga tushsa yo'qoladi **[XULOSA]**.
- Didox JS'i amalda shunday qiladi: `keyId` ni `sessionStorage[serialNumber]` da saqlaydi; `create_pkcs7` xato bersa — qayta `load_key`. ([didox.uz JS](https://didox.uz/index_e82707fb.js)) **[TASDIQLANDI]**

---

## 4. Didox login uchun imzolash — aniq oqim

### 4.1. Rasmiy Didox hujjatidagi qadamlar

Manba: [Didox: 01. Работа с E-IMZO](https://api-docs.didox.uz/ru/integrators-eimzo) va [03. Логин](https://api-docs.didox.uz/ru/home). **[TASDIQLANDI]**

1. WebSocket: `wss://127.0.0.1:64443/service/cryptapi`, sarlavhalar `Host: 127.0.0.1:64443`, `Origin: https://{sayt}`.
2. `{"plugin":"pfx","name":"list_all_certificates"}` → tanlangan kalitning `disk/path/name/alias`.
3. `{"plugin":"pfx","name":"load_key","arguments":[disk, path, name, alias]}` → `keyId`.
4. `{"plugin":"pkcs7","name":"create_pkcs7","arguments":[ <INN base64>, keyId, "no" ]}` → `{pkcs7_64, signer_serial_number, signature_hex, success}`.
   - Birinchi argument: **INN satri base64'da** (hujjat misoli `MjA3MTE5OTYz` = INN'ning base64'i). Hujjat oqimi ro'yxatida: "Первым аргументом передать инн в base64". Boshqa nonce/challenge yo'q.
   - Uchinchi argument `"no"` = **attached** (ma'lumot PKCS#7 ichiga joylanadi); `"yes"` = detached. (E-IMZO tavsifi: "'yes' — без вложения исходных данных, 'no' или '' — с вложением" — [qo0p §1.2](https://github.com/qo0p/e-imzo-doc)). Didox JS'ining login yo'lida ham detached berilmaydi (`"no"`). **[TASDIQLANDI]**
5. **Timestamp biriktirish:** `POST /v1/dsvs/timestamp`, body `{"pkcs7": <pkcs7_64>, "signatureHex": <signature_hex>}` → `{"timeStampTokenB64": "...", "success": true, "isAttachedPkcs7": true}`.
6. `POST /v1/auth/{INN}/token/ru` (yoki `uz`), body `{"signature": <timeStampTokenB64>}` → `200 {"token": "<uuid>", "related_companies": null|[...], "related_branches": null|[...]}`. Xatolar: `422 User not registered`, `401 Unauthorized. Invalid signature`. Token UUID, **360 daqiqa** amal qiladi. **[TASDIQLANDI]** ([Didox 03](https://api-docs.didox.uz/ru/home))

### 4.2. Timestamp qayerdan olinadi

- **Didox'ning o'z endpoint'i** `/v1/dsvs/timestamp` — TSA'ga o'zi murojaat qiladi. Hujjat tarkibida TSA URL'i yo'q. **[TASDIQLANDI]**
- Didox JS'i bu chaqiruvni `…/v1/dsvs/timestamp` ga yuboradi (prod bazasi `https://api2.didox.uz/v1/dsvs/`); javobda `isAttachedPkcs7` **false** bo'lsa, qo'shimcha E-IMZO chaqiruvi: `{"plugin":"pkcs7","name":"attach_timestamp_token_pkcs7","arguments":[pkcs7_64, signer_serial_number, timeStampTokenB64]}` → `pkcs7_64` (yakuniy). `isAttachedPkcs7 === true` bo'lsa `timeStampTokenB64` o'zi yakuniy imzo. **[TASDIQLANDI]** ([didox.uz JS: `postLoadKey`](https://didox.uz/index_e82707fb.js)). Hujjatdagi misol javobda `isAttachedPkcs7: true`.
- Tarixiy kontekst: E-IMZO'ning o'z serverida (`E-IMZO-SERVER`) bu `/frontend/timestamp/pkcs7`; u NITs NT bilan shartnoma + VPN kaliti (`vpn.e-imzo.uz`, faqat O'zbekistondan ochiladi) talab qiladi. Bizga kerak emas — Didox endpoint'i o'zi qiladi. **[TASDIQLANDI, ikkilamchi: qo0p]** ([qo0p/e-imzo-doc](https://github.com/qo0p/e-imzo-doc)). ⚠ macOS'da (O'zbekistondan tashqarida) test qilinsa, Didox'ning TSA/VPN tomoni ishlashi **[TEKSHIRILMADI]**.

### 4.3. Partner API qismi va veb-ilova qismi

| Qadam | Partner API (rasmiy, token kerak) | Didox veb-ilovasi (didox.uz JS'idan o'qildi) |
|---|---|---|
| 1–4 E-IMZO chaqiruvlari (lokal) | token **kerak emas** (faqat E-IMZO ruxsati) | xuddi shu |
| 5 timestamp | hujjat: "Чтобы использовать API необходимо получить партнерский токен" — `/v1/dsvs/timestamp` ham shu qatorda | `getTimestamp` alohida axios instance, ko'rinadigan token sarlavhasi **yo'q** — `POST …/v1/dsvs/timestamp` **[XULOSA: ehtimol tokensiz ochiq; TEKSHIRILMADI]** |
| 6 login | `POST /v1/auth/{INN}/token/{locale}` + `Partner-Authorization: <PARTNER_TOKEN>` (oddiy matn) | **o'z partner tokeni** (JS ichiga joylangan) `{token, iat}` sifatida **RSA-OAEP bilan shifrlanadi** (JS ichidagi ochiq kalit bilan) va `Partner-Authorization` sifatida yuboriladi; qo'shimcha sarlavha `X-Requested-From: website`; baza `https://api2.didox.uz/v1/` |
| keyingi so'rovlar | `Partner-Authorization` + `user-key: <token>` | `user-key: <token>` + shifrlangan `Partner-Authorization` |

Manbalar: [Didox 03](https://api-docs.didox.uz/ru/home), [Didox 01](https://api-docs.didox.uz/ru/integrators-eimzo), [didox.uz bundle `index_e82707fb.js`](https://didox.uz/index_e82707fb.js) (funksiyalar `signIn`, `rawSignIn`, `authAxios`, `encrypt$1`, `getTimestamp`, `timestamper`). **[TASDIQLANDI faktlar; ularning ma'nosi/huquqiy tomoni — XULOSA]**

**Bu nimani anglatadi (BLOKER-darajadagi xavf):**
- "Veb-ilova ishlatadigan ichki endpoint'larni chaqiramiz" rejasi aslida shuni talab qiladi: Didox'ning JS'idan **uning o'z partner tokeni** va **RSA ochiq kaliti**ni olib, uning shifrlash sxemasini takrorlash. Bu API'dan "norasmiy foydalanish"dan ko'ra jiddiyroq — boshqa tashkilot (Didox) kredensialini ishlatish. Didox tokenni almashtirsa/shifrlash sxemasini o'zgartirsa (JS bundle'da hash'li fayl nomi — `index_aff02a2b.js` → `index_e82707fb.js`, ya'ni tez-tez o'zgaradi), login ishlamay qoladi. **[XULOSA]**
- Tokenni **ilova ichiga ko'chirmaslik** va yashirin saqlamaslik tavsiya etiladi; agar owner baribir shu yo'ldan borsa — bu alohida, ongli qaror (CONSTITUTION'da yozib qo'yish). **Hujjatga token/kalit qiymati ko'chirilmadi.**
- **Tavsiya [XULOSA]:** rasmiy partner token olinmaguncha ERI-login yo'lini "eksperimental" deb belgilash; yoki Didox'dan oddiy kompaniya uchun **parol bilan kirish + shaxsiy API token** imkoniyatini yozma so'rash.

---

## 5. Ko'p kompaniya (`POST /v1/auth/company/{tin}/login/{locale}`)

Rasmiy hujjat ([Didox 03, "Способ 3"](https://api-docs.didox.uz/ru/home)) **[TASDIQLANDI]**:
- Maqsad: "Физическое лицо входит в компанию, используя свой токен (полученный Способом 1 или 2)". Javob: kompaniya tokeni + `permissions`.
- Path: `companyTaxId` (kompaniya INN), `locale` (`ru` sukut/`uz`).
- Sarlavhalar: `Partner-Authorization` (majburiy), **`user-key`** — jismoniy shaxs tokeni (majburiy).
- Body ixtiyoriy: `branchNum` (filial raqami).
- 200 javobi: `{"token": "...", "permissions": {"tin": "<companyTaxId>", "roles": [11,12,21,22,41,42,51,52]}}` (misol).
- Xatolar: `422 Company not registered`, `422 Failed to register company`, `401 Failed to login in company. Reason: ...`.
- Jismoniy shaxs INN/PINFL bilan kirganda (usul 1 yoki 2) javobdagi `related_companies` (INN, nom, vakolat kodlari) va `related_branches` dan kompaniya tanlanadi. ([Didox 03](https://api-docs.didox.uz/ru/home))
- `roles` kodlarining ma'nosi hujjatda tushuntirilmagan **[TEKSHIRILMADI]** (`docs/research/didox.md` ham shuni aytgan).

Veb-ilova mantiqi (didox.uz JS) bilan mos: **yuridik** sertifikat (INN bor) bilan kirilsa — INN imzolanadi va shu INN kompaniyasi tokeni to'g'ridan-to'g'ri olinadi (`signIn`); **jismoniy** sertifikat (faqat PINFL) bilan — PINFL imzolanadi, keyin `related_companies` dan `signInByCompany` bilan kompaniya tanlanadi. **[TASDIQLANDI faktni]** ([didox.uz JS](https://didox.uz/index_e82707fb.js)). Bizning holat: har bir MCHJ ning o'z yuridik ERI'si bo'lsa — `taxId = MCHJ INN`; buxgalter jismoniy ERI bilan bir necha MCHJ'ga vakolatli bo'lsa — bitta imzo + har kompaniya uchun `company/{tin}/login`. **[XULOSA]**

---

## 6. Platforma mavjudligi (macOS va Windows)

### 6.1. macOS

- **macOS uchun rasmiy E-IMZO bor**: "MacOS ARM (Apple Silicon)" — `E-IMZO-v6.4.7-arm64.dmg`, "MacOS AMD64 (Intel)" — `E-IMZO-v6.4.7-amd64.dmg` (MD5 fayllari bilan), shuningdek "SSL-сертификат E-IMZO" (`e-imzo-chain.pem`) va PDF qo'llanmalar `E_IMZO_MacOS_RU.pdf` / `E_IMZO_MacOS_UZ.pdf`. **[TASDIQLANDI]** ([e-imzo.soliq.uz/download](https://e-imzo.soliq.uz/download/), [havolalar sahifa JS'idan](https://e-imzo.soliq.uz/_next/static/chunks/pages/_app-416dee9fd3e191bd.js))
- ⚠ macOS PDF qo'llanma (hajmi 10 MB dan katta) **o'qilmadi**: yuklab olishga ruxsat so'ralmadi. Aniq o'rnatish qadamlari **[TEKSHIRILMADI]**; owner PDF'ni o'zi ochib ko'rishi kerak.
- Eski (2022, yangilangan 2025-01-31) uchinchi tomon qo'llanma — Java JRE 1.8 + `E-IMZO-v4.64.tar.gz` → `E-IMZO.sh`; kalit papkasi `/Volumes/DSKEYS` (sudo bilan yaratiladi); Automator orqali launcher; menyu satrida yashil ikonka; `https://127.0.0.1:64443/` da tekshirish; **Safari bloklaydi — Chrome yoki Firefox**; Chrome'da `E-IMZO.pem` ni "Always Trust" qilish. **[TASDIQLANDI faktni, ikkilamchi]** ([Gazeta.uz](https://www.gazeta.uz/ru/2022/07/26/e-imzo/)). v6.4.7 `.dmg` uchun qadamlar boshqacha bo'lishi mumkin. **[XULOSA]**
- Bizning ilova uchun macOS ahamiyati: faqat **dasturchi sinovi** (owner birinchi macOS'da sinaydi). Production — Windows.

### 6.2. Windows

- Zip variantlari (JRE 1.8 / 17 / JRE'siz); o'rnatuvchi administrator nomidan ishga tushiriladi; root sertifikat so'rovi — "Да"; antivirus istisnosi kerak bo'lishi mumkin. **[TASDIQLANDI]** ([install](https://e-imzo.soliq.uz/install/), [download](https://e-imzo.soliq.uz/download/))
- Windows'da dynamic TCP port diapazoni juda tor bo'lsa E-IMZO ishga tushmaydi (`netsh int ipv4 set dynamicport tcp start=1025 num=64510`, admin huquqi). **[TASDIQLANDI, ikkilamchi: qo0p §4.2]**
- Windows va macOS o'rtasidagi API farqi manbalarda ko'rsatilmagan; protokol bir xil (`/service/cryptapi`). **[XULOSA]**

---

## 7. Qorovulsiz ishga tushirish (har oyning 1-kuni 06:00)

Manbalar nima deydi:
1. Parol **har safar E-IMZO oynasida inson tomonidan** kiritiladi; sayt/chaqiruvchi parolni berolmaydi ham, eslab qolishni yoqolmaydi. **[TASDIQLANDI, ikkilamchi: qo0p §1.3]**
2. "6 soat eslab qolish" faqat shu bilan ishlaydi: (a) inson oynada belgini **qo'lda** qo'ygan, (b) E-IMZO jarayoni to'xtamagan (parol xotirada), (c) `keyId` o'sha bo'lib qolgan (24 soatgacha). Shundan keyin `create_pkcs7` oynasiz ishlaydi. **[TASDIQLANDI, ikkilamchi: qo0p]**
3. Parol belgisiz bo'lsa — 1 daqiqa.
4. Parolni oldindan dasturga berish/yuklash yo'li hujjatlarda **yo'q**; bizning qoida ham uni taqiqlaydi. **[TASDIQLANDI]**
5. Didox tokeni 360 daqiqa yashaydi, uzoq muddatli token yo'q. ([Didox 03](https://api-docs.didox.uz/ru/home)) **[TASDIQLANDI]**

Xulosa: **06:00 da inson yo'q bo'lsa ERI-login amalda bajarilmaydi.** Xavfsiz dizayn **[XULOSA]**:
- 06:00 da faqat hisob-kitob va "tayyor navbat" (Didox'ga yuborilishi kerak bo'lgan qoralamalar ro'yxati) yaratiladi — Didox'ga hech narsa yuborilmaydi.
- Buxgalter ish boshlaganda ilovada "Didox'ga qoralamalarni yuborish" tugmasini bosadi → E-IMZO parol oynasi → login → navbat bo'yicha qoralamalar yaratiladi. Token xotirada ushlanadi (360 daqiqadan oshmaydi).
- Qo'shimcha cheklov: PC yoqilgan, E-IMZO ishga tushgan va kalit papkasi (flesh/disk) ulangan bo'lishi shart. ID-karta/USB-token foydalanuvchilarda token ulangan bo'lishi kerak (`ckc`/`idcard`).
- Login xatosida avtomatik qayta urinish yo'q: `401 Invalid signature`, `422 User not registered`, E-IMZO xatolari — foydalanuvchiga ko'rsatiladi (Konstitutsiya).

---

## 8. Xulosa: bizning ilova uchun tavsiya etilgan oqim

**Variant A (tavsiya): E-IMZO bilan brauzer sahifasi gaplashadi** — rasmiy usul, Origin avtomatik to'g'ri.

1. Ilovaning veb-qismi `http://localhost:<PORT>` (yoki `127.0.0.1`) dan beriladi. Sahifa `e-imzo.js`/`e-imzo-client.js` mantig'ini (o'zimizning kichik nusxamiz, rasmiy fayldan ilhomlanib) ishlatadi: `ws://127.0.0.1:64646` (http sahifa uchun) yoki `wss://127.0.0.1:64443`.
2. `version` → minimal versiya tekshiruvi; `apikey` (E-IMZO v6 da shart emas bo'lishi mumkin) faqat `localhost`/`127.0.0.1` ichki kalitlari bilan.
3. `pfx.list_all_certificates` → ro'yxat, kompaniya INN bo'yicha filtrlash (alias dagi `1.2.860.3.16.1.1` / `uid`), muddati o'tganlarini yashirish.
4. Buxgalter kalitni tanlaydi → `pfx.load_key` → `keyId` (faqat sahifa xotirasida).
5. `pkcs7.create_pkcs7([base64(INN), keyId, "no"])` → **E-IMZO o'zi parol oynasini ochadi** (ilova parolni ko'rmaydi).
6. Sahifa `pkcs7_64` + `signature_hex` ni **mahalliy backend**'ga yuboradi (parol/kalit yo'q).
7. Backend `POST …/v1/dsvs/timestamp` → `timeStampTokenB64`; agar `isAttachedPkcs7 === false` — bu holatda `attach_timestamp_token_pkcs7` E-IMZO'da sahifada bajariladi (yoki shu holat uchun xato).
8. Backend `POST …/v1/auth/{INN}/token/ru {"signature": …}` → `token` (360 daqiqa) — faqat xotirada; ko'p kompaniya bo'lsa `auth/company/{tin}/login` (`user-key`).
9. Backend token bilan faqat **qoralama** yaratadi (`002` create, `sign` chaqirilmaydi). Token tugasa — foydalanuvchiga yangi login so'raladi (avtomatik qayta urinishsiz).
10. Hech qachon: parolni so'ramaslik/saqlamaslik, `.pfx` ni o'qimaslik/nusxalamaslik, `/sign` chaqirmaslik.

**Variant B (Node backend to'g'ridan-to'g'ri E-IMZO'ga ulanadi):** `ws` + `origin: 'http://127.0.0.1'` + (TLS bo'lsa) `ca = e-imzo-chain.pem`. Oqim A bilan bir xil, faqat 1–5 qadamlar backend'da. Afzalligi: UI soddaligi; kamchiligi: Origin/TLS/API-KEY xatti-harakati tasdiqlanmagan — avval hands-on test kerak.

**Birinchi navbatda hal qilinishi kerak bo'lgan qaror:** 4.3-bo'limdagi `Partner-Authorization` muammosi (Didox'ning o'z tokeni). Rasmiy partner token yoki Didox'dan yozma ruxsat bo'lmaguncha 8-bo'limdagi 8–9 qadamlar xavfli/beqaror.

---

## 9. Ochiq savollar — haqiqiy PC'da hands-on test kerak

| # | Savol | Qanday sinash |
|---|---|---|
| 1 | E-IMZO v6.4.7 `ws://127.0.0.1:64646` ni hamon ochadimi? | Windows PC'da `curl`/`wscat` bilan ulanib `{"name":"version"}` yuborish |
| 2 | Origin tekshiriladimi; Origin yo'q (Node `ws` sukut) bo'lsa nima bo'ladi; `http://localhost:3000` va `http://127.0.0.1:3000` (port bilan) qabul qilinadimi? | `ws` bilan: Origin yo'q / `http://127.0.0.1` / `http://localhost:PORT` / `null` — `version`, `apikey`, `list_all_certificates` javoblarini solishtirish |
| 3 | v6 da `apikey` chaqirmasdan ham `localhost` sahifasi ishlaydimi (domenni o'zi yuklaydimi)? | Variant A sahifasidan `apikey`siz `list_all_certificates` |
| 4 | Node'dan 64443 TLS: `e-imzo-chain.pem` bilan ishlaydimi, `rejectUnauthorized` kerakmi? | `ws` + `ca` opsiyasi |
| 5 | Electron `file://` (Origin `null`) ishlaydimi? Demo'dagi `'null'` kaliti prod E-IMZO'da qabul qilinadimi? | Faqat Electron kerak bo'lsa |
| 6 | `create_pkcs7` parol oynasi aynan qanday ko'rinadi; oyna jarayon fonida bo'lsa (ilova ustida) chiqadimi? | Qo'lda, Windows PC |
| 7 | "Eslab qolish 6 soat" belgisi Windows v6 da ham bormi; `keyId` E-IMZO qayta ishga tushsa yo'qoladimi? | 2 ketma-ket `create_pkcs7`, so'ng E-IMZO restart |
| 8 | Bir E-IMZO jarayonida ikkita turli `.pfx` (ikki MCHJ) bir vaqtda `keyId` bilan ishlaydimi? | Ikki `load_key` + ikkita `create_pkcs7` |
| 9 | `/v1/dsvs/timestamp` tokensiz ishlaydimi (api2.didox.uz), partner bazasida (api-partners/testapi3) nima talab qilinadi? Boshqa mamlakatdan (macOS testi) ishlaydimi? | `curl` bilan test muhitida; sarlavhasiz va `Partner-Authorization` bilan |
| 10 | `isAttachedPkcs7` qachon `false` bo'ladi, shunda `attach_timestamp_token_pkcs7` zarurmi? | Bir necha login |
| 11 | `/v1/auth/{INN}/token/ru` **faqat `Partner-Authorization` bilan** ishlaydimi; sarlavhasiz nima qaytaradi (401/403)? Didox ToS tashqarida norasmiy foydalanishni taqiqlaydimi? | Test muhiti + Didox account manager'dan yozma so'rov (Telegram `@Didox_account`) |
| 12 | Yuridik ERI bilan `auth/{INN}/token` ishlaydi, jismoniy ERI bilan `related_companies` qaytadi — bizning MCHJ'larda qaysi turi? | Haqiqiy kalit (egasi roziligi bilan) |
| 13 | macOS v6.4.7 `.dmg`: o'rnatish, `e-imzo-chain.pem` ishonchi, ishga tushish, ikonka, port (rasmiy PDF o'qilmagan) | Owner macOS'da `E_IMZO_MacOS_RU.pdf` bo'yicha |
| 14 | Windows'da kalitlar papkasi va flesh/disk o'zgarganda `list_all_certificates` yangilanishi | Qo'lda |
| 15 | Timestamp/Didox tomoni Didox bundle o'zgarganda (hash'li fayl nomi) bizning oqim sinishi — monitoring kerakmi | Didox `@didoxapiupdates` kanaliga obuna |

---

## 9b. Windows: parol oynasi qanday topiladi (o'lchangan, 2026-10-14, Windows gate W0)

Haqiqiy Windows kompyuterida `apps/desktop/scripts/list-windows.ps1` bilan o'lchandi (barcha ko'rinadigan
top-level oynalar + jarayonning asosiy oynasi):

1. **E-IMZO tray'da ishlab turganda uning ko'rinadigan oynasi yo'q.** Ro'yxatda `javaw` umuman chiqmaydi.
2. **Parol so'raganda `javaw` ning oynasi paydo bo'ladi**, lekin u o'sha jarayonning *asosiy* oynasi emas:
   `MainWindowHandle = 0`, shuning uchun `Get-Process | Where MainWindowHandle -ne 0` ro'yxatida **yo'q**.
3. **Oyna sarlavhasi — hisoblagich:** `Отмена через 55 секунд` (har sekundda o'zgaradi, tilga ham bog'liq).

Natija: oynani **sarlavha bo'yicha** yoki **asosiy oyna bo'yicha** topish mumkin emas. Topish usuli macOS
bilan bir xil mantiqqa keltirildi — *E-IMZO'ning ko'rinadigan oynasi bor-yo'qligi* (macOS'da
`windowCount(E-IMZO) > 0`, Windows'da `EnumWindows` + `IsWindowVisible` + oyna egasi E-IMZO jarayonimi).

Egasini aniqlash (parol faqat E-IMZO'ning o'z oynasiga tushishi uchun): jarayon nomi `javaw`/`java` **va**
(bajariladigan fayl yo'li yoki buyruq satri `E-IMZO`/`EIMZO` ni o'z ichiga olsa). Ikkisi ham o'qilmasa — oyna
E-IMZO'ning emas deb hisoblanadi va **hech narsa yozilmaydi** (run xavfsiz to'xtaydi).

Yon ta'sir: buxgalter E-IMZO'ning **o'z oynasini** ochib qo'ysa, ilova "parol oynasi allaqachon ochiq" deb
ishni boshlamaydi — macOS'dagi xatti-harakatning aynan o'zi, xavfsiz tomoni.

Kod: `apps/desktop/src/didox/autotype/powershell.ts`, testlar `win32.spec.ts`.

## 10. Manbalar

Rasmiy / birlamchi:
- [Didox API: 01. Работа с E-IMZO](https://api-docs.didox.uz/ru/integrators-eimzo) — WebSocket, plugin xabarlari, 4 qadamlik imzo va login oqimi, `/v1/dsvs/timestamp`
- [Didox API: 03. Логин](https://api-docs.didox.uz/ru/home) — 3 usul (ERI, parol, `auth/company/{tin}/login`), 360 daqiqa, xatolar, partner token talabi
- [E-IMZO demo: e-imzo.js](https://test.e-imzo.uz/demo/e-imzo.js), [e-imzo-client.js](https://test.e-imzo.uz/demo/e-imzo-client.js), [e-imzo-init.js](https://test.e-imzo.uz/demo/e-imzo-init.js), [demo sahifa](https://test.e-imzo.uz/demo/) — rasmiy JS klient, portlar, API_KEYS, plugin nomlari
- [e-imzo.soliq.uz — yuklab olish](https://e-imzo.soliq.uz/download/) (platformalar va `dls.soliq.uz` havolalari sahifa JS'idan: [_app-416dee9fd3e191bd.js](https://e-imzo.soliq.uz/_next/static/chunks/pages/_app-416dee9fd3e191bd.js)); [o'rnatish sahifasi](https://e-imzo.soliq.uz/install/); [e-imzo.uz](https://e-imzo.uz/) (soliq.uz'ga yo'naltiradi)
- [esi.uz — E-IMZO yordami](https://esi.uz/index/help/eimzo) — 64443 va root sertifikat
- [didox.uz veb-ilova JS bundle `index_e82707fb.js`](https://didox.uz/index_e82707fb.js) — veb-ilovaning haqiqiy login/imzo/timestamp mantig'i (rasmiy hujjat emas, kuzatuv)

Ikkilamchi:
- [qo0p/e-imzo-doc — Инструкция по интеграции E-IMZO](https://github.com/qo0p/e-imzo-doc) (README: [raw](https://raw.githubusercontent.com/qo0p/e-imzo-doc/master/README.md)) — API-KEY/VPN/SiteID farqi, parol 6 soat qoidasi, `keyId` 24 soat, v6 domen kaliti, Windows port muammosi
- [islomN/eimzo_plugin](https://github.com/islomN/eimzo_plugin) ([CAPIWS.py](https://raw.githubusercontent.com/islomN/eimzo_plugin/master/CAPIWS.py), [EimzoClient.py](https://raw.githubusercontent.com/islomN/eimzo_plugin/master/EimzoClient.py)) — brauzersiz (Python) E-IMZO klienti, 1C uchun
- [Gazeta.uz: E-IMZO ni macOS'da o'rnatish (2022, yangilangan 2025)](https://www.gazeta.uz/ru/2022/07/26/e-imzo/)
- [ws (Node.js) hujjati — `origin` opsiyasi](https://github.com/websockets/ws/blob/master/doc/ws.md)
- Ichki: `docs/research/didox.md` (partner API, 002 JSON, rate-limit)

O'qib bo'lmadigan / o'qilmagan:
- `https://dls.soliq.uz/E_IMZO_MacOS_RU.pdf` (10 MB dan katta, yuklab olinmadi); `https://127.0.0.1:64443/apidoc.html` (E-IMZO lokal o'rnatilmagan); [infostart.ru/1c/tools/1674319](https://infostart.ru/1c/tools/1674319/) (HTTP 429).
