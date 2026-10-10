# Yol haritası

Öncelik sırası, gerçekçilik ve iş akışı hızı birlikte düşünülerek verildi. Her maddeden sonra render düzeneğiyle görsel doğrulama yap.

## 1. Temel (önce bunlar)

- [x] **Yerel indirme:** `offer()` içindeki `window.claude.use('downloads')` yolunu `<a download>` tabanlı indirmeyle değiştir; ZIP toplu indirme de aynı yoldan.
- [x] **Modüllere ayırma:** Vite + ES modülleri (`src/state`, `render`, `devices`, `lights`, `ui`, `export`). ESLint eklendi. (Test düzeneği sonradan Playwright + Vite dev sunucusuna taşındı.)
- [x] **three.js yükseltmesi (r128 → r186):** renk uzayı API'leri, renk yönetimi (`lin()`), ışık birimleri (`LIGHT_SCALE`, `decay = 0`), `BasicShadowMap` üzerinde yeniden yazılmış PCSS (nokta ışıkta küp derinlik haritası), MSAA hedefi. Test düzeneği WebGL1 desteği kalktığı için Playwright'a taşındı. Önce/sonra farkı yansımalarda ve yazı kenarlarında küçük (PMREM ve donanım sRGB çözme).

## 2. Gerçekçilik

- [ ] **Alan ışıkları:** `RectAreaLight` ile softbox/strip/pencere aydınlatması; parlak yüzeylerde doğru şekilli vurgu (yükseltme sonrası).
- [x] **Fotoğraf önizlemesi:** araç çubuğundaki "Canlı fotoğraf" anahtarıyla isteğe bağlı (varsayılan kapalı, varsayılan kalite "Hızlı"); kamera 700 ms durunca yol izlemeye geçer.
- [ ] Blender ile cihaz modelleri (`tools/blender/phone.py` deneysel): yol izlemede kazanç küçük; ancak yakın çekimler için değerlendirilebilir.
- [x] **Yol izleme (path tracing) modu:** dışa aktarımda "Fotoğraf" kalitesi (three-gpu-pathtracer, 128 örnek + gürültü giderme, ilerleme göstergesi). Devamı:
  - şeffaf arka planda zemin gölgesi (iki geçişli gölge yakalayıcı)
  - hız: 30 sn zaman bütçesi + en çok 64 örnek, ardından OIDN gürültü giderme (`denoiser`, ağırlıklar `public/oidn/`, döşemeli, srgb). 2160 px headless ~60 sn. WebGPU sürümü (`WebGPUPathTracer`) hâlâ denenebilir.
  - ekranın gövdeye yansıyan ışığı bazı sahnelerde güçlü; `SCREEN_GLOW` ve ışık/ortam kalibrasyonu sahne çeşitliliğiyle ince ayarlanmalı
- [x] **Telefon, tablet, monitör:** eloksal kasa, 2.5D ön cam, temas gölgesi; monitörde yeni arka gövde, ayak ve taban. Devamı: kamera lensleri, monitör ayağı formu.
- [ ] Dizüstü hoparlör ızgarasında uzak mesafede hare (moiré).
- [ ] **Alan derinliği (bokeh)** ve odak noktası seçimi.
- [ ] **Yansıtıcı / dokulu zemin:** parlak masa, mermer, ahşap, beton (prosedürel doku).
- [ ] **GLB içe aktarma:** kullanıcının kendi (lisanslı) cihaz modelini yükleyip ekran malzemesini işaretleyebilmesi.
- [ ] Ekran camı yansımasına yoğunluk ayarı; sıyırma açılarında ekranı fazla soldurmasın.

## 3. İş akışı

**Sıradaki öncelik (önerilen):** çoklu seçim → kendi sahneni şablon olarak kaydet → telefon/tablet/monitörü dizüstü seviyesine getirme.

- [ ] **Toplu ekran görüntüsü:** aynı sahneye N görsel ver, N çıktı al (ZIP).
- [x] **Proje kaydet/aç:** sahne + ışıklar + açılar + görseller + site adresleri tek dosyada (JSON + görseller, ZIP). Otomatik kayıt IndexedDB'de. Kalan: "kendi sahneni şablon olarak kaydet".
- [x] **Geri al / yinele** (⌘Z / ⇧⌘Z): gizmo, katman, odaklanma, şablon ve kaydırıcı değişiklikleri.
- [x] **Hizalama ve yapışma:** gizmo'da Shift ile 1 cm / 15° adım; "Zemine oturt" düğmesi (şablonlardaki `settleDevices` mantığı); seçili cihazları eşit aralıkla dağıtma.
- [ ] **Çoklu seçim:** Shift ile birden fazla cihaz seçip birlikte taşıma / döndürme / katman komutu.
- [ ] **Video:** döner tabla animasyonu ve uzun ekran görüntüsünün kaydırılması, MP4/WebM (MediaRecorder veya WebCodecs).
- [ ] **Mağaza görseli üretici:** başlık/metin katmanları, App Store ve Play Store ölçülerinde toplu çıktı.

## Şablonlar

- [x] 20 hazır şablon ve Showcases sayfası (`showcases.html`), desenli arka planlar, 21:9 oran, "Sade ekran" cihazı.
- [ ] Kullanıcının kendi sahnesini şablon olarak kaydetmesi (proje kaydet/aç ile birlikte).
- [ ] Şablon kartında örnek ekran görüntüleri (şu an yer tutucu ekran).

## Web sitesi yakalama

- [x] Uzun ekran görüntüsü kaydırma (kaydırıcı, tekerlek, tümünü eşitle).
- [x] URL ile tüm cihazlara yakalama (yerel dev sunucusu, Playwright).
- [ ] Yayınlanmış sürüm için yakalama servisi (altyapı kararı bekliyor).
- [ ] Kaydırma videosu (iş akışı bölümündeki video maddesiyle birlikte).
- [ ] Yakalama seçenekleri: yakalamadan önce bekleme süresi, belirli bir bölüme (CSS seçici) kaydırarak başlama, koyu tema tercihi (`prefers-color-scheme`).

## Bilinen sorunlar

- Fırçalanmış metal uzak mesafede hafif hare (moiré) oluşturabiliyor; mip seviyesine göre normal yoğunluğu azaltılabilir.
- Çok geniş açılı spotlarda gölge haritası çözünürlüğü düşüyor (gölge kamerası fov = 2 × açı).
- Işık küreleri genelde kadraj dışında kalıyor; asıl kontrol ışık haritası.
- Küçük ekranlarda ışık haritası ve eksen göstergesi sahnenin köşelerini örtüyor; daraltılabilir olmalı.
- 3840 px dışa aktarım mobil tarayıcılarda bellek sınırına takılabilir (render hedefleri büyük).
- Işık küresi bazı sahnelerde kadraja giriyor.
- Spot/nokta ışıkta mesafeyle zayıflama yok (`decay = 0`, r128 davranışı). Fiziksel `decay = 2` daha gerçekçi olur ama preset'lerin yeniden ayarlanmasını gerektirir.
