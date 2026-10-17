# Lansman kurulumu: ücretsiz beta

*18 Ekim 2026 · hesapsız, ücretsiz beta. Hesap ve ödeme v2'de.*

Bu belge, hesapları senin açacağın, gerisini komutlarla kuracağın adımları sırayla veriyor. Kod tarafı hazır:

- `npm run build:site`: yayına çıkacak site `site/` klasörüne derlenir. Açılış sayfası kökte, stüdyo `/studio/` altında. Önbellek ve güvenlik başlıkları `site/_headers` dosyasında.
- `services/capture/`: yakalama servisi. Dev sunucusundaki yakalamayla aynı kodu kullanır (`core.mjs`). SSRF koruması, CORS, IP başına günlük sınır ve sıra içerir. Dockerfile hazır.
- Stüdyo, derlenirken `VITE_CAPTURE_URL` verilirse yakalamayı o servisten yapar. Verilmezse adres alanı hiç görünmez. Ekran kaydı yayınlanmış sürümde yok, düğmesi gizli.

Neden bu servisleri seçtiğimin gerekçesi `docs/yakalama-servisi.md` belgesinde (seçenekler, maliyetler, güvenlik).

## Mimari

```
alanadi.com             Cloudflare Pages (statik): açılış sayfası
alanadi.com/studio/     Cloudflare Pages (statik): stüdyo, şablonlar, oynatıcı (/studio/player/)
capture-….run.app       Google Cloud Run: yakalama servisi (Playwright + Chromium konteyneri)
```

Render, dışa aktarım ve kayıt tamamen kullanıcının tarayıcısında yapılır. Sunucuya giden tek şey yakalanacak adrestir.

## Beklenen maliyet (beta)

| Kalem | Ücret |
|---|---|
| Alan adı | yılda ≈ 10–15 $ (`.com`, Cloudflare Registrar maliyet fiyatına satar) |
| Cloudflare Pages | 0 $ (statik istekler ve bant genişliği sınırsız, ayda 500 derleme) |
| Cloud Run | ayda ≈ 6 bin yakalamaya kadar ücretsiz kota içinde. Sonrası ≈ 1 $ / 1000 yakalama. Karşılama kartında bir adres 4 yakalamadır. |

Cloud Run tavanını `--max-instances` belirler (aşağıda 3). Ayrıca bir bütçe uyarısı kur (adım 3.5).

---

## 1. Açman gereken hesaplar

- [ ] **Cloudflare hesabı** (ücretsiz): alan adı, DNS ve Pages için tek yer.
- [ ] **Alan adı**: Cloudflare Registrar'dan al. Başka yerde alınmışsa, alan adını Cloudflare'e ekleyip ad sunucularını oraya çevir.
- [ ] **Google Cloud hesabı** ve faturalandırma (kart gerekiyor; ücretsiz kota içinde ücret çıkmaz). Bir proje aç, ör. `vitrin-beta`, ve proje kimliğini not et.
- [ ] **Geri bildirim e-postası**, ör. `merhaba@alanadi.com`. Cloudflare Email Routing ile ücretsiz olarak kendi adresine yönlendirilebilir. Açılış sayfasındaki "Beta geri bildirimi" kutusu buna bağlanacak.

Yerel makinende iki komut satırı aracı gerekiyor:

```bash
brew install --cask google-cloud-sdk
```

```bash
npm i -g wrangler
```

## 2. Yakalama servisi (Cloud Run)

Servisin adresi stüdyonun derlemesine girdiği için siteden önce kurulur.

### 2.1 Projeyi seç ve servisleri aç

```bash
gcloud auth login
```

```bash
gcloud config set project PROJE_KIMLIGI
```

```bash
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
```

### 2.2 Yetkisiz bir hizmet hesabı oluştur

Bu adım önemli. Cloud Run'daki her konteyner bulutun metadata sunucusuna ulaşabilir ve oradan **kendi hizmet hesabının** jetonunu alabilir. Yakalama servisi kullanıcıların verdiği adresleri açtığı için hiçbir yetkisi olmayan ayrı bir hesapla çalışmalı. Varsayılan hesap projede düzenleyici yetkisi taşır, onu kullanma.

```bash
gcloud iam service-accounts create capture-runner --display-name="Yakalama servisi (yetkisiz)"
```

Bu hesaba hiçbir rol **verme**.

### 2.3 Yayınla

Alan adın henüz hazır değilse `ALLOWED_ORIGINS` değerine şimdilik Pages'in verdiği adresi yazabilirsin (adım 3'ten sonra güncellenir).

```bash
gcloud run deploy capture --source services/capture --region europe-west1 --service-account capture-runner@PROJE_KIMLIGI.iam.gserviceaccount.com --cpu 2 --memory 4Gi --concurrency 2 --timeout 180 --min-instances 0 --max-instances 3 --allow-unauthenticated --set-env-vars "ALLOWED_ORIGINS=https://alanadi.com,https://www.alanadi.com,DAILY_LIMIT=60,MAX_CONCURRENT=2"
```

- `--source services/capture` ile Dockerfile Cloud Build'de derlenir. İlk derleme ~5 dk sürer; Playwright imajı büyüktür.
- `europe-west1` (Belçika) Türkiye'ye yakın ve ucuz bölgelerden biri.
- `--concurrency 2` bir örneğe aynı anda en çok 2 istek gönderir. Daha fazlası yeni örnek açar, `--max-instances 3` ile tavanlıdır. Böylece aynı anda en çok 6 yakalama yapılır.
- Komut sonunda servis adresini verir: `https://capture-xxxxxxxx-ew.a.run.app`. Bunu not et.

### 2.4 Dene

```bash
curl -s https://capture-xxxxxxxx-ew.a.run.app/ping
```

`{"ok":true}` dönmeli. Özel ağ engeli de çalışıyor olmalı; şu komut "Bu adres yakalanamaz" dönmeli:

```bash
curl -s -H Content-Type:application/json -d '{"url":"http://169.254.169.254/","targets":[{"id":"a","width":390,"height":844}]}' https://capture-xxxxxxxx-ew.a.run.app/capture
```

### 2.5 Ortam değişkenleri

| Değişken | Varsayılan | Anlamı |
|---|---|---|
| `ALLOWED_ORIGINS` | boş = herkes (yalnızca deneme) | servisi çağırabilecek siteler, virgülle |
| `DAILY_LIMIT` | 60 | IP başına günde yakalama (karşılama kartı adres başına 4 harcar) |
| `MAX_CONCURRENT` | 2 | örnek başına aynı anda çalışan yakalama |

Değiştirmek için yeniden derleme gerekmez:

```bash
gcloud run services update capture --region europe-west1 --update-env-vars DAILY_LIMIT=40
```

## 3. Site (Cloudflare Pages)

İki yol var. İkisi de aynı `site/` klasörünü yayınlar.

### 3.1 Önerilen: GitHub'dan otomatik derleme

Cloudflare panosunda Workers & Pages → Create → Pages → **Connect to Git** → `Mertsakin/mockup-studio` deposunu seç.

| Ayar | Değer |
|---|---|
| Production branch | `main` |
| Build command | `npm ci && npm run build:site` |
| Build output directory | `site` |
| Environment variables | `VITE_CAPTURE_URL` = `https://capture-xxxxxxxx-ew.a.run.app`, `NODE_VERSION` = `20` |

Derlemede Playwright tarayıcısı indirilmez (yalnızca paket kurulur), bu doğru: site derlemesi tarayıcıya ihtiyaç duymaz. `main`'e her push yeni bir sürüm yayınlar. Dallar ayrı önizleme adresleri alır.

### 3.2 Alternatif: elle yükleme

```bash
VITE_CAPTURE_URL=https://capture-xxxxxxxx-ew.a.run.app npm run build:site
```

```bash
wrangler pages deploy site --project-name vitrin
```

### 3.3 Alan adını bağla

Pages projesi → Custom domains → `alanadi.com` ve `www.alanadi.com`. Alan adı Cloudflare'deyse DNS kayıtları kendiliğinden eklenir, sertifika birkaç dakikada çıkar.

### 3.4 Servise siteyi tanıt

Alan adı çalışınca `ALLOWED_ORIGINS` değerini son hâline getir:

```bash
gcloud run services update capture --region europe-west1 --update-env-vars "ALLOWED_ORIGINS=https://alanadi.com,https://www.alanadi.com"
```

### 3.5 Bütçe uyarısı

Google Cloud konsolu → Billing → Budgets & alerts → aylık 10 $'lık bütçe ve %50 / %90 / %100 e-posta uyarıları.

## 4. Lansman öncesi kontrol listesi

**Benim yapabileceklerim** (söylemen yeterli):
- [ ] Açılış sayfasındaki boş bağlantılar (`href="#"`): Blog, Değişiklik günlüğü, Durum sayfası, API, "Örnekleri gör", "Keşfet", "Şablonlara göz at". Ya kaldırılır ya da gerçek hedefe bağlanır (şablonlar → `studio/?template=…`).
- [ ] "Beta geri bildirimi" kutusuna e-posta bağlantısı (adres sende).
- [ ] **Gizlilik notu** (KVKK aydınlatma metni). Yakalama servisi, kötüye kullanıma karşı istek başına IP adresini ve yakalanan adresi kaydeder (Cloud Run günlükleri, varsayılan 30 gün). Bunun kısa bir sayfada söylenmesi gerekir. Metni ben taslak olarak yazarım; hukuki onayı sende.
- [ ] Sosyal paylaşım görseli (`og:image`) ve favicon, ürünün kendisiyle render edilerek.

**Sende olanlar:**
- [ ] Alan adı ve marka adı kesinleşmesi ("Vitrin" sayfada geçiyor; tescil/çakışma kontrolü).
- [ ] **Gömme oynatıcısının telefonda ölçümü:** kendi telefonunda `alanadi.com/studio/player/…` gömmesini aç. Akıcı mı, ısınıyor mu? Bunu bir sayfa hazırlayıp sana bağlantısını veririm.
- [ ] Zayıf bir bilgisayarda (entegre GPU'lu eski bir dizüstü) stüdyoyu bir kez dene. Canlı görünüm hareket sırasında artık kendi çözünürlüğünü düşürüyor; asıl donanımda bir göz atmak iyi olur.

## 5. Güvenlik: bu sürüm neyi kapsıyor, neyi kapsamıyor

**Kapsadıkları:**
- **SSRF.** Sayfanın yaptığı her istek (ilk adres, yönlendirmeler, iframe'ler, görseller, fetch) `guard.mjs` ile kontrol edilir. Yerel, özel, bağlantı yerel (metadata sunucusu dahil), CGNAT, çok noktaya yayın ve belgeleme aralıkları engellidir. IPv4 adresini IPv6 içine yazma, onaltılık ya da tamsayı biçiminde yazma gibi hileler de engellenir; `.local` ve `.internal` gibi ad uzantıları da. Yönlendirmeyle özel ağa gitme denendi ve engellendi.
- **CORS.** Servisi yalnızca kendi sitemiz çağırabilir. Başka bir site tarayıcıdan çağıramaz; `curl` ile çağrılabilir, bu yüzden günlük sınır var.
- **Kötüye kullanım.** IP başına günlük sınır, örnek başına sıra, örnek tavanı.
- **WebRTC.** Tarayıcı yerel adresleri WebRTC üzerinden açığa çıkaramaz.

**Kapsamadıkları** (beta için kabul edilebilir, v2'de ele alınacak):
- **DNS rebinding.** Bir alan adı kontrolde genel, tarayıcıya bir an sonra özel bir adres verebilir. Uygulama içi kontrol bunu tam kapatmaz. Etkisi yetkisiz hizmet hesabıyla (2.2) sınırlıdır: metadata sunucusundan alınacak jeton hiçbir şeye erişemez. Kesin çözüm ağ katmanında çıkış filtresidir (VPC + güvenlik duvarı).
- **Günlük sınır örnek başına bellekte tutulur.** Örnekler kapanınca sıfırlanır, ve en çok 3 örnek olduğu için gerçek sınır en kötü durumda 3 katıdır. Hesaplarla birlikte ortak bir depoya (Redis/Firestore) geçer.
- **Bot doğrulaması yok** (Cloudflare Turnstile). Kötüye kullanım görülürse ilk eklenecek şey bu.
- **Yakalanan siteler bot korumasına takılabilir.** Bu durumda kullanıcı açık bir hata görür ve ekran görüntüsü yükleyebilir. Doğrulama atlatma bilerek yapılmıyor.

## 6. Güncelleme ve geri alma

- **Site:** `main`'e push = yeni sürüm. Pages panosunda her sürüm listelenir; "Rollback" bir önceki sürüme tek tıkla döner.
- **Servis:** `gcloud run deploy` ile her yeni sürüm bir revizyondur. Geri dönmek için:

```bash
gcloud run services update-traffic capture --region europe-west1 --to-revisions REVIZYON_ADI=100
```

- **Günlükler:**

```bash
gcloud run services logs read capture --region europe-west1 --limit 50
```

Her satır bir JSON'dur: `ip`, `url`, `status`, `ms`.
