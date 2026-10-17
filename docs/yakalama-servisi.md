# Yakalama servisi: yayınlanmış sürümde web sitesi yakalama

*Karar belgesi · 18 Ekim 2026 · durum: öneri, karar bekliyor*

Yalnızca analiz; uygulama kodu yok. Fiyatlar ve limitler aşağıda kaynak ve tarihle verildi. Doğrulayamadığım her rakam **(doğrulanmadı)** olarak işaretli.

## 1. Neden şimdi

14 Ekim kararı barındırma, hesap/ödeme ve yakalama altyapısını sona bıraktı. Ama üç söz buna bağlı:

- **Yaşayan mockup** (TODO yol haritası 1): "URL ver, varlıklar çıksın, site değişince yeniden üret" (API, GitHub Action).
- **URL'den mağaza seti** (yol haritası 2, `ui/store.js`).
- **Karşılama kartında adres yolu** (`ui/welcome.js`). Derlemede `captureAvailable()` hiç sormuyor, yani yayınlanmış sürümde adres alanı hiç görünmüyor. İlk 60 saniye akışının ana girişi bu.

Seçenekler maliyet, kalite ve güvenlik açısından birbirinden çok farklı. Açılıştan önce seçilmesi gerekiyor.

## 2. Bugün ne var (gereksinimin tanımı)

`/api/capture` yalnızca Vite dev sunucusunda var (`tools/capture/vite-plugin.mjs`, `apply:'serve'`):

| Gereksinim | Bugünkü davranış | Neden önemli |
|---|---|---|
| Cihaz başına görüntü alanı | telefon 390, tablet 820, dizüstü/tarayıcı 1440, monitör 1920 CSS px; mobilde `isMobile` + `hasTouch` + mobil UA | site her cihazda kendi duyarlı düzeniyle çıkar |
| Yüksek ölçek çarpanı (dpr) | cihazın ekran dokusu genişliğinden (`screenPixelWidth`, 4096 px uzun kenar): telefon ≈ 5,25×, tablet ≈ 4×, dizüstü ≈ 3×, monitör ≈ 2×; tavan `DPR_MAX` 8 | 3840 px dışa aktarımda ekran metni keskin kalsın diye |
| Tam sayfa yüksekliği | en çok 8000 CSS px **ya da** 16384 cihaz px (telefonda ≈ 3100–3300 CSS px) | "Ekranı kaydır" ve video için uzun ekran görüntüsü |
| Tembel yüklenen içerik | sayfa %80 adımlarla aşağı kaydırılır, `networkidle` beklenir | görseller boş çıkmasın |
| Çerez bandı | id/class/aria-label'ında `cookie|consent|gdpr|çerez|kvkk` geçen sabit/yapışkan öğeler silinir | mockup'ta KVKK bandı istenmez |
| Çıktı | JPEG q85, JSON içinde data URL | |
| Karşılama kartı | adres başına 4 cihaz tipi, 4 **ayrı paralel istek** | gecikme en yavaş görüntü alanına bağlı |
| Etkileşimli ekran kaydı | `tools/capture/record.mjs`: kalıcı profilli Chrome, CDP screencast, WebSocket (`/api/record/ws`), kullanıcı girdisi siteye akar, 30 sn'lik kayıt istemcide MP4'e çevrilir | durumlu, uzun süren, tek kullanıcıya bağlı oturum |

### Ölçüm (bu belge için, M1 Pro, Playwright Chromium, bugünkü `capture()` mantığının kopyası)

| Site | Görüntü alanı başına (sıralı) | 4 alan sıralı | 4 alan paralel (tek tarayıcı) | JPEG boyutu |
|---|---|---|---|---|
| linear.app | 6,0–9,3 sn | 29,5 sn | 15,4 sn | 1,2–2,0 MB |
| stripe.com | 9,0–12,8 sn | 45,6 sn | 21,8 sn | 1,8–4,1 MB |

Sürenin çoğu ağ ve `networkidle` beklemesi, 2–3,5 sn'si yüksek dpr'li tam sayfa görüntünün kodlanması. **Maliyet hesaplarında yakalama başına 15 sn, 2 vCPU / 4 GB tarayıcı süresi** varsaydım (bulut vCPU'su M1 Pro çekirdeğinden yavaş; bu varsayım ölçülmedi). Bir "yakalama" = bir görüntü alanı; karşılama kartında bir adres = 4 yakalama.

## 3. Seçenekler

### (a) Kendi sunucumuz: Docker + Playwright, sürekli açık makine (Fly.io, Railway, VM)

Bugünkü eklentinin kodu neredeyse olduğu gibi bağımsız bir Node sunucusuna taşınır (aynı istek/yanıt biçimi, istemci değişmez).

- **Kalite:** tam uyum. dpr 8, 16384 px, kendi çerez temizliğimiz, mobil UA; hiçbir şey kaybolmaz.
- **Gecikme:** sıcak tarayıcı, soğuk başlangıç yok. 4 alan paralel ≈ 15–25 sn (ölçüme yakın; makinenin çekirdek sayısına bağlı).
- **Maliyet:** sabit. Fly.io `performance-2x` 4 GB ≈ **66 $/ay**, `performance-4x` 8 GB ≈ 132 $/ay (sayfadaki saniye ücretinden hesap), çıkış trafiği Kuzey Amerika/Avrupa 0,02 $/GB ([Fly.io fiyatlar](https://docs.fly.io/about/pricing), 18.10.2026). 8 GB'lık tek makine aynı anda ~4 yakalama ile ayda kabaca 400–500 bin yakalama kaldırır (doğrulanmadı, yük testi gerekir).
  - 10 bin/ay: ≈ 66–132 $ → **≈ 7–13 $ / 1000** (sabit ücret baskın)
  - 100 bin/ay: ≈ 132 $ + 250 GB × 0,02 $ ≈ 137 $ → **≈ 1,4 $ / 1000**
  - Fly makineleri boşta durdurulabilir (saniye başına ücret); o zaman maliyet (b)'ye yaklaşır ama birkaç saniyelik açılış gelir.
  - Hetzner daha ucuzdu ama 2026'da iki kez zam yaptı (Nisan ve 15 Haziran; CCX23 Almanya'da 31,49 € → 85,99 € bildiriliyor: [privatedevops](https://privatedevops.com/news/hetzner-june-2026-cloud-price-increase-what-to-do), [heise](https://heise.de/-11333037)) **(resmî sayfadan doğrulanmadı)**; fiyat öngörülebilirliği şu an zayıf.
- **Operasyon yükü:** orta-yüksek. Tarayıcı çökmeleri, bellek sızıntısı (bağlam başına kapatma zaten var), Chromium güncellemeleri, ölçekleme, izleme, yük dengeleme bizde.
- **Ekran kaydı:** **çalışır.** WebSocket, uzun oturum ve diskte profil doğal olarak var. Kayıt için tek uygun yer bu tür bir makine (ya da (e)).

### (b) Sunucusuz: Cloud Run, AWS Lambda (+ Chromium katmanı), Cloudflare Browser Rendering

Aynı konteyner, istek başına başlatılıp boşta sıfıra iner.

**Cloud Run** (önerilen sunucusuz yol)
- **Kalite:** tam uyum (kendi konteynerimiz, aynı Playwright kodu).
- **Gecikme:** sıcak örnekte (a) ile aynı. Soğuk başlangıçta Chromium'lu imaj için birkaç saniye ek **(doğrulanmadı, ölçülmeli)**; `min-instances=1` ile kapatılabilir (o zaman sabit ücret). Karşılama kartının 4 isteği 4 ayrı örneğe dağılır (eşzamanlılık 1 ayarıyla) → gecikme ≈ en yavaş tek alan, ~10–15 sn.
- **Maliyet:** istek bazlı faturalamada 0,000024 $/vCPU-sn, 0,0000025 $/GiB-sn, 0,40 $/milyon istek; ücretsiz kota ayda 180 bin vCPU-sn, 360 bin GiB-sn, 2 milyon istek. **(Kısmen doğrulandı:** resmî sayfa [cloud.google.com/run/pricing](https://cloud.google.com/run/pricing) okunamadı; arama özetinde ücretsiz kota doğrulandı, birim fiyat için iki farklı değer dolaşıyor: 0,000024 / 0,0000025 ve daha yeni olduğu söylenen 0,000018 / 0,000002, 18.10.2026. Aşağıda yüksek olanı kullandım.)
  - Yakalama başına: 2 vCPU × 15 sn × 0,000024 + 4 GiB × 15 sn × 0,0000025 ≈ **0,00087 $ → ≈ 0,87 $ / 1000**
  - 10 bin/ay: ≈ 9 $, ücretsiz kota ≈ 6 bin yakalamayı karşılar → **≈ 4 $**
  - 100 bin/ay: ≈ 87 $ − ≈ 5 $ kota + çıkış trafiği (250 GB; GCP internet çıkışı ~0,12 $/GB **(doğrulanmadı)**) ≈ **110 $ → ≈ 1,1 $ / 1000**. Görüntüleri doğrudan Cloudflare R2'ye yazmak (çıkışı ücretsiz) bu kalemi düşürür.
- **Operasyon yükü:** düşük-orta. Ölçekleme, yeniden başlatma, TLS platformda; imaj ve Chromium sürümü bizde.
- **Ekran kaydı:** teknik olarak mümkün (Cloud Run WebSocket'i ve uzun isteği destekliyor), ama oturum tek örneğe bağlı kalmalı, profil kalıcı diske değil nesne deposuna gider, istek bazlı faturalamada CPU yalnızca istek açıkken verilir. Uygulanabilir ama zorlama; kayıt için (a)/(e) daha doğal.

**AWS Lambda + `@sparticuz/chromium`**
- Bellek 128–10 240 MB, 0,0000166667 $/GB-sn, 0,20 $/milyon istek, ücretsiz 400 bin GB-sn ([AWS Lambda fiyatlar](https://aws.amazon.com/lambda/pricing/), 18.10.2026). 4 GB × 15 sn ≈ 0,001 $ → **≈ 1,0 $ / 1000**; 10 bin/ay ≈ 3–4 $ (kota sonrası), 100 bin/ay ≈ 100 $.
- Paket Chromium'u her soğuk başlangıçta `/tmp`'ye açar; önerilen bellek ≥ 1600 MB ([Crawlee: AWS browsers](https://crawlee.dev/docs/deployment/aws-browsers), [sparticuz/chromium](https://github.com/Sparticuz/chromium)). Chromium sürümleri yamada kırılabiliyor.
- **Engel:** eşzamanlı yanıt yükü 6 MB **(bilinen limit, bu belgede yeniden doğrulanmadı)**. Bizim 4 MB'lık JPEG data URL olarak ≈ 5,4 MB; yanıt S3 bağlantısına çevrilmeli. Gelen WebSocket yok → **ekran kaydı çalışmaz.**
- Cloud Run'a göre kazancı yok, sınırı fazla. Ayrı bir AWS gerekçesi yoksa önermem.

**Cloudflare Browser Rendering** (Workers üzerinde barındırılan Chromium)
- Workers Paid: ayda 10 tarayıcı saati dahil, sonra 0,09 $/saat; 10 eşzamanlı tarayıcı dahil, fazlası 2 $/adet; Playwright destekli ([Cloudflare fiyatlar](https://developers.cloudflare.com/browser-rendering/pricing/), 18.10.2026). 15 sn'lik yakalama ≈ 0,000375 $ → **≈ 0,4 $ / 1000** (+ 5 $/ay Workers).
- **Belirsiz:** dpr ve tam sayfa boyut sınırları, Worker yanıt/bellek sınırları sayfada yok **(doğrulanmadı)**. 16384 px'lik görüntünün Worker'dan geçmesi denenmeli. Cloudflare'in kendi IP'lerinden gelmesi bot korumalı sitelerde avantaj olabilir **(doğrulanmadı)**.
- İlginç bir yedek aday; ilk seçim için bilinmeyen çok.

### (c) Hazır ekran görüntüsü API'leri

| Hizmet | Plan (aylık) | Dahil | Fazla | Hız sınırı | dpr | Tam sayfa | Çerez bandı |
|---|---|---|---|---|---|---|---|
| [ScreenshotOne](https://screenshotone.com/pricing/) | Basic 17 $ / Growth 79 $ / Scale 259 $; 100 ücretsiz | 2 bin / 10 bin / 50 bin | 0,009 / 0,006 / 0,004 $ | 40 / 80 / 150 istek/dk | **1–5** ([belgeler](https://screenshotone.com/docs/options/)) | var, `full_page_max_height` (üst sınır yazmıyor), `full_page_scroll` | `block_cookie_banners` |
| [Urlbox](https://urlbox.com/pricing) | Lo-Fi 19 $ / Hi-Fi 49 $ / Ultra 99 $ / Business 498 $ | 2 bin / 5 bin / 15 bin / (sayfada "1,000+") | Business'ta 3 $/1000; alt planlarda üst plana geçirilir | 30 / 60 / 250 / 1000 istek/dk | "4K & 5K Retina" — **sayısal üst sınır doğrulanmadı** (belge sayfası 500 verdi) | var (stitch / native) | var **(doğrulanmadı)** |
| [ApiFlash](https://apiflash.com/) | Lite 7 $ / Medium 35 $ / Large 180 $; 100 ücretsiz | 1 bin / 10 bin / 100 bin | sayfada yok | 20 istek/sn ([belgeler](https://apiflash.com/documentation)) | **doğrulanmadı** | var | çerez bandı gizleme listeleniyor (üçüncü taraf kaynak) |

*Tüm fiyatlar 18.10.2026'da ilgili sayfalardan; KDV hariç.*

- **Kalite:** kısmen uyumlu.
  - ScreenshotOne'ın dpr tavanı 5: telefonda bizim istediğimiz ≈ 5,25× yerine 5× (≈ %5 eksik; fark edilmez). Tablet, dizüstü, monitör zaten ≤ 4×. Kabul edilebilir.
  - 16384 cihaz px'lik yükseklik için açık bir garanti yok; büyük görüntüler genelde ayrı sınırlara takılır **(doğrulanmadı, her sağlayıcıda denenmeli)**.
  - Çerez temizliği sağlayıcının kendi listesiyle; KVKK/"çerez" gibi Türkçe bantlarda başarısı bilinmiyor. `hide_selectors` ile kendi kuralımızı ekleyebiliriz ama bizim kodumuzdaki "sabit/yapışkan + ad eşleşmesi" mantığı birebir taşınmaz.
- **Gecikme:** istek başına 5–20 sn bekleniyor **(doğrulanmadı)**; 4 paralel istek hız sınırına takılmaz.
- **Maliyet:**
  - 10 bin/ay: ScreenshotOne Growth 79 $ (**7,9 $ / 1000**), ApiFlash Medium 35 $ (**3,5 $ / 1000**), Urlbox ≈ 99 $ (Ultra).
  - 100 bin/ay: ScreenshotOne Scale 259 $ + 50 bin × 0,004 = **459 $ (4,6 $ / 1000)**, ApiFlash Large **180 $ (1,8 $ / 1000)**, Urlbox Business **(hesaplanamadı, doğrulanmadı)**.
  - Kendi konteynerimize göre 2–8 kat pahalı; fark kullanıcı sayısıyla büyür.
- **Operasyon yükü:** en düşük. SSRF ve tarayıcı bakımı sağlayıcıda. API anahtarı istemciye verilmemeli, yani ince bir aracı uç yine bizde (hız sınırı ve kota orada).
- **Ekran kaydı:** **çalışmaz.** Bu API'ler tek seferlik görüntü/video üretir, etkileşimli oturum sunmaz.
- **Bağımlılık riski:** kalite parametrelerimiz (dpr, yükseklik, çerez kuralları) sağlayıcının kararına bağlı olur; yol haritasındaki "fotoğraf kalitesi" vaadinin girdisini dışarıya bırakmak.

### (d) Ek seçenek: kullanıcının kendi tarayıcısında yakalama (uzantı)

İstenmedi ama kararı etkiliyor: bir Chrome uzantısı `chrome.debugger` ile CDP'nin `Emulation.setDeviceMetricsOverride` (görüntü alanı + dpr) ve tam sayfa `Page.captureScreenshot` çağrılarını kullanıcının kendi tarayıcısında yapabilir **(uygulanabilirliği denenmedi)**.

- Artıları: sunucu maliyeti yok, SSRF yok. **Giriş gerektiren sayfalar** (SaaS panelleri, pazarlamacının asıl göstermek istediği ekranlar) ve bot doğrulamaları kullanıcının oturumuyla geçer. Ekran kaydının "kalıcı profil" ihtiyacını da ortadan kaldırır.
- Eksileri: kurulum sürtünmesi (ilk 60 saniyeye uymaz), yalnızca Chromium tarayıcılar, mağaza incelemesi, yaşayan mockup'ın zamanlanmış yeniden yakalamasında işe yaramaz.
- Sonuç: sunucunun yerine değil, **giriş arkasındaki sayfalar ve kayıt için tamamlayıcı**.

### (e) Ek seçenek: barındırılan tarayıcı (Browserless, Browserbase)

Ham Chromium'u CDP/WebSocket üzerinden kiralar; bizim Playwright kodumuz `connect` ile aynen çalışır.

- [Browserless](https://www.browserless.io/pricing) (yıllık ödeme fiyatı, 18.10.2026): Prototyping 25 $ / 20 bin birim, Starter 140 $ / 180 bin, Scale 350 $ / 500 bin; **1 birim = bağlantı başına 30 sn'ye kadar tarayıcı süresi**; fazlası 0,0015–0,0020 $/birim. Bir yakalama ≈ 1 birim → 100 bin/ay ≈ 140 $ (**≈ 1,4 $ / 1000**), 10 bin/ay ≈ 25 $.
- Kalite tam (kendi kodumuz), **ekran kaydı çalışır** (CDP screencast aynı WebSocket'ten). 30 sn'lik kayıt + gezinme birkaç dakika = 5–10 birim.
- Tarayıcının çalıştığı ağ sağlayıcının; SSRF yüzeyi bizim altyapımıza değmez ama kullanıcının açtığı adres yine bizim adımıza açılır.
- Kayıt aşaması için (a)'ya ciddi bir alternatif.

## 4. Karşılaştırma özeti

| | (a) Kendi makine | (b) Cloud Run | (b) Lambda | (c) Hazır API | (e) Browserless |
|---|---|---|---|---|---|
| Kalite uyumu | tam | tam | tam (6 MB yanıt sınırı) | kısmi (dpr ≤ 5, yükseklik belirsiz) | tam |
| 4 alan gecikmesi | 15–25 sn | 10–15 sn + soğuk başlangıç | 10–15 sn + soğuk başlangıç | ~5–20 sn (doğrulanmadı) | 10–15 sn |
| $ / 1000 @ 10 bin/ay | 7–13 | ≈ 0,4 (kota içinde) | ≈ 0,4 (kota içinde) | 3,5–7,9 | ≈ 2,5 |
| $ / 1000 @ 100 bin/ay | ≈ 1,4 | ≈ 1,1 | ≈ 1,0 + S3 | 1,8–4,6 | ≈ 1,4 |
| Operasyon | yüksek | düşük-orta | orta | en düşük | düşük |
| Ekran kaydı | evet | zorlama | hayır | hayır | evet |
| SSRF sorumluluğu | bizde | bizde (metadata sunucusu!) | bizde | sağlayıcıda | kısmen sağlayıcıda |

## 5. Güvenlik: herkese açık "her adresi aç" servisi

Herkese açık bir tarayıcı, herhangi bir adresi bizim ağımızdan açan bir vekildir. Açılıştan önce şunlar şart:

**SSRF (iç adreslere istek)**
- Engellenecek hedefler: `127.0.0.0/8`, `10/8`, `172.16/12`, `192.168/16`, `169.254/16` (bulut metadata: **Cloud Run'da `metadata.google.internal` konteynerden erişilebilir** ve hizmet hesabı jetonu verir), `100.64/10`, `0.0.0.0`, `::1`, `fc00::/7`, `fe80::/10`, IPv4-eşlemeli IPv6. `file:`, `chrome:`, `data:`, `view-source:` gibi şemalar.
- Yalnızca ilk adresi kontrol etmek yetmez: yönlendirmeler, iframe'ler, alt kaynaklar ve **DNS rebinding** (ilk çözümlemede genel IP, sonra iç IP). Doğru yer tarayıcının kendisi: Playwright `context.route('**/*')` ile her isteğin ana makinesi çözülüp kontrol edilir. Daha sağlamı ağ katmanında engel: konteynerin çıkışı iç ağlara ve metadata adresine kapalı bir VPC/güvenlik duvarından geçer (Cloud Run'da VPC çıkışı + güvenlik duvarı kuralları; Fly'da ayrı uygulama, özel ağ yok).
- Yakalama hizmetinin kimliği hiçbir şeye yetkili olmamalı (Cloud Run: izinsiz ayrı hizmet hesabı).
- WebRTC ve yerel ağ erişimi tarayıcı bayraklarıyla kapatılır.

**Kötüye kullanım ve hız sınırı**
- Anonim: IP başına günde birkaç adres (ör. 3), Cloudflare Turnstile (görünmez doğrulama).
- Hesaplı: plana göre aylık kota; istek başına en çok 4–12 hedef (bugün `MAX_TARGETS` 12), sayfa başına süre sınırı (bugün 30 sn gezinme + ~12 sn bekleme), yükseklik sınırı zaten var.
- Aynı adres + görüntü alanı için kısa süreli önbellek (aşağıda) hem maliyeti hem de tekrar eden kötüye kullanımı keser.
- Kayıtlar: kim, hangi adres, ne zaman (kötüye kullanım bildirimlerine cevap için). Görüntüler süreyle silinir.
- Kullanım şartları: üçüncü taraf siteyi yakalama sorumluluğu kullanıcıda; kimlik avı/yasa dışı içerik için şikâyet yolu.

**Bot doğrulamaları**
- Veri merkezi IP'lerinden açılan sayfalar Cloudflare/hCaptcha doğrulamasına takılabilir. Bu hem bizim konteynerde hem hazır API'lerde olur (bazı sağlayıcılar kurumsal planda konut proxy'si satar; ApiFlash Enterprise'da "managed proxies" görünüyor).
- CAPTCHA çözme ya da doğrulama atlatma **yapılmamalı**. Doğrulamaya takılan sayfada açık bir mesaj ve iki yol: ekran görüntüsünü yükle ya da (sonra) uzantı / ekran kaydı ile kendi tarayıcında aç.
- Bugünkü kayıttaki `--disable-blink-features=AutomationControlled` bayrağı kişinin kendi makinesinde sorun değil; herkese açık serviste tespit atlatma gibi okunur, yayınlanmış sürümde kaldırılması düşünülmeli.

**Ekran kaydına özel**
- Kalıcı profil = kullanıcının çerezleri ve oturumları. Herkese açık serviste kullanıcı başına ayrı, şifreli, silinebilir profil ve açık rıza gerekir; ya da hiç tutulmaz (kayıt bitince profil silinir). Bu risk kaydı en sona bırakmanın ana gerekçesi.

## 6. Önbellek

- Anahtar: normalleştirilmiş adres (`normalizeUrl`) + görüntü alanı + dpr + mobil/UA + yakalama kodunun sürümü.
- Süre: anonimde 24 saat, hesaplıda kullanıcı "yeniden yakala" diyene kadar. Görüntüler nesne deposunda (R2: çıkış ücretsiz), servis yalnızca bağlantı döner. Bu, bugünkü JSON içindeki data URL'yi de değiştirir (Lambda'nın 6 MB sınırı ve tarayıcı belleği için zaten gerekli).
- Karşılama kartı bir adres için 4 alan ister. Aynı adresle mağaza seti ya da ikinci deneme önbellekten gelir.

## 7. Yaşayan mockup ve ücretli planlar

**Yeniden yakalama** iki tetikleyiciyle:
1. **Zamanlanmış:** günlük/haftalık yakalama; görüntünün algısal özeti (pHash) öncekinden farklıysa "site değişti" olayı. Yalnızca HTML/ETag'e bakmak yetmez (dinamik içerik her seferinde değişir).
2. **İtme:** API anahtarıyla `POST /v1/projects/:id/refresh` ve bunu çağıran bir GitHub Action ("her sürümde açılış görsellerini güncelle"). Dağıtım sonrası adımı.

**Önemli bağımlılık:** yakalama işin yarısı. Yeniden *render* (3B sahne, yol izleme, OIDN) bugün yalnızca kullanıcının tarayıcısında çalışıyor. Sunucuda render için `tools/render-harness`'ın GPU'lu bir makinede çalışması gerekir. Bu, yakalama servisinden ayrı bir karar (GPU maliyeti, kuyruk) ve bu belgenin kapsamı dışında. Ara çözüm: site değişince kullanıcıya bildirim, render stüdyo açıldığında tarayıcıda.

**Planlara bağlama** (birim maliyet ≈ adres başına 4 yakalama ≈ 0,004 $ Cloud Run'da, 0,014–0,03 $ hazır API'de):

| Plan | Yakalama | Kayıt | Yaşayan mockup |
|---|---|---|---|
| Anonim / ücretsiz | günde 3 adres, Turnstile | yok | yok |
| Pro | ayda ~200 adres | 30 sn, ayda birkaç oturum (aşama 3) | elle "yeniden yakala" |
| Ekip | ayda ~1000 adres | var | zamanlama + API + GitHub Action |

Bu kotalarda en ağır senaryoda bile yakalama maliyeti kullanıcı başına ayda birkaç dolar altında kalır (Cloud Run); hazır API'de 3–8 kat. Rakamlar fiyatlandırma kararı değil, maliyetin plan fiyatına göre küçük kaldığını göstermek için.

## 8. Öneri

**Kendi Playwright konteynerimiz, Cloud Run üzerinde** (sunucusuz). Gerekçe:

1. **Kalite kaybı yok.** dpr, 16384 px yükseklik, Türkçe çerez bantları, mobil UA bugünkü gibi; ürünün "fotoğraf kalitesi" sözünün girdisi bizde kalır.
2. **En ucuz ölçeklenen yol.** ≈ 1 $ / 1000 yakalama; 10 bine kadar neredeyse ücretsiz kota içinde; boşta sıfır.
3. **Kod hazır.** `vite-plugin.mjs`'teki `capture()` bağımsız sunucuya taşınır, istemci yalnızca uç adresini değiştirir.
4. Operasyon yükü (a)'dan çok daha az.

**Eşdeğer alternatif:** Cloud Run istenmezse Fly.io, boşta duran makinelerle (aynı konteyner). **Hazır API (ApiFlash ya da ScreenshotOne)** yalnızca "açılışa bir hafta kaldı, altyapıya vakit yok" durumunda kısa süreli köprü olarak; aracı uç ve kotalar yine bizde olmalı ki sonra konteynere geçiş istemciyi değiştirmesin.

**Lambda'yı önermiyorum** (yanıt sınırı, kayıt yok, Cloud Run'a üstünlüğü yok). **Ekran kaydını yayınlanmış sürüme şimdi taşımayı önermiyorum** (durumlu oturum, çerez saklama riski, ayrı altyapı).

## 9. Aşamalı plan

**Aşama 0 — şimdi (açılıştan bağımsız, küçük):**
- Yakalama uç adresini yapılandırılabilir yap (`/api/capture` sabit yerine ortam değişkeni); yanıtta data URL yanında bağlantı desteği.
- `capture()` mantığını `vite-plugin.mjs`'ten paylaşılan bir modüle ayır (dev sunucusu ve ileride servis aynı kodu kullansın).
- Bu belgedeki birkaç rakamı ölç: Cloud Run'da soğuk başlangıç ve 2 vCPU'da yakalama süresi (tek günlük deneme).

**Aşama 1 — açılış için (yakalama servisi v1):**
- Cloud Run'da konteyner: SSRF koruması (istek yakalama + VPC çıkış kuralları + metadata erişimi kapalı), Turnstile, IP ve hesap başına kota, R2'de 24 saatlik önbellek, kayıtlar.
- Karşılama kartının adres yolu ve "Bu cihaza yakala" yayınlanmış sürümde açılır.
- Doğrulamaya takılan siteler için anlaşılır hata + "ekran görüntüsü yükle".

**Aşama 2 — ücretli planlarla:**
- Hesaplar ve plan kotaları; URL'den mağaza seti.
- Yaşayan mockup v1: elle "yeniden yakala" + zamanlanmış yakalama ve değişiklik bildirimi; API anahtarı ve GitHub Action. Sunucuda render ayrı bir karar olarak açılır.

**Aşama 3 — sonra:**
- Etkileşimli ekran kaydı yayınlanmış sürümde: oturum başına ayrı makine (Fly.io) ya da Browserless; profil oturum sonunda silinir, kalıcı profil yalnızca açık rızayla.
- Giriş arkasındaki sayfalar ve bot doğrulamalı siteler için tarayıcı uzantısı (d) değerlendirmesi.
- Cloudflare Browser Rendering'i maliyet yedeği olarak dene.

## 10. Doğrulanmamış ya da ölçülmesi gereken rakamlar

- Cloud Run birim fiyatları (resmî sayfa okunamadı; iki değer dolaşıyor), GCP çıkış trafiği fiyatı, Cloud Run soğuk başlangıcı.
- Bulut vCPU'sunda yakalama süresi (varsayım: 15 sn / yakalama; ölçüm M1 Pro'da 6–13 sn).
- Tek makinenin aylık kapasitesi (400–500 bin yakalama tahmini).
- Urlbox'ın dpr üst sınırı ve Business planının gerçek birim fiyatı; ApiFlash'ın dpr üst sınırı ve aşım fiyatı; hazır API'lerin tam sayfa yükseklik sınırları ve gecikmeleri.
- Lambda eşzamanlı yanıt sınırı (6 MB) bu çalışmada yeniden kontrol edilmedi.
- Hetzner fiyatları (yalnızca ikincil kaynaklar).
- Cloudflare Browser Rendering'in görüntü boyutu ve dpr sınırları.
- Uzantı ile yüksek dpr'li tam sayfa yakalamanın uygulanabilirliği.
