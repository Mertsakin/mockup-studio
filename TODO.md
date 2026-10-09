# Yol haritası

Öncelik sırası, gerçekçilik ve iş akışı hızı birlikte düşünülerek verildi. Her maddeden sonra render düzeneğiyle görsel doğrulama yap.

## 1. Temel (önce bunlar)

- [x] **Yerel indirme:** `offer()` içindeki `window.claude.use('downloads')` yolunu `<a download>` tabanlı indirmeyle değiştir; ZIP toplu indirme de aynı yoldan.
- [x] **Modüllere ayırma:** Vite + ES modülleri (`src/state`, `render`, `devices`, `lights`, `ui`, `export`). Test düzeneği `src/main.js`'i esbuild ile paketliyor; ESLint eklendi.
- [x] **three.js yükseltmesi (r128 → r186):** renk uzayı API'leri, renk yönetimi (`lin()`), ışık birimleri (`LIGHT_SCALE`, `decay = 0`), `BasicShadowMap` üzerinde yeniden yazılmış PCSS (nokta ışıkta küp derinlik haritası), MSAA hedefi. Test düzeneği WebGL1 desteği kalktığı için Playwright'a taşındı. Önce/sonra farkı yansımalarda ve yazı kenarlarında küçük (PMREM ve donanım sRGB çözme).

## 2. Gerçekçilik

- [ ] **Alan ışıkları:** `RectAreaLight` ile softbox/strip/pencere aydınlatması; parlak yüzeylerde doğru şekilli vurgu (yükseltme sonrası).
- [ ] **Yol izleme (path tracing) modu:** `three-gpu-pathtracer` ile kamera durunca fotoğraf kalitesine yakınsayan render; dışa aktarımda varsayılan olabilir.
- [ ] **Alan derinliği (bokeh)** ve odak noktası seçimi.
- [ ] **Yansıtıcı / dokulu zemin:** parlak masa, mermer, ahşap, beton (prosedürel doku).
- [ ] **GLB içe aktarma:** kullanıcının kendi (lisanslı) cihaz modelini yükleyip ekran malzemesini işaretleyebilmesi.
- [ ] Ekran camı yansımasına yoğunluk ayarı; sıyırma açılarında ekranı fazla soldurmasın.

## 3. İş akışı

- [ ] **Toplu ekran görüntüsü:** aynı sahneye N görsel ver, N çıktı al (ZIP).
- [ ] **Proje kaydet/aç:** sahne + ışıklar + açılar + görseller tek dosyada (JSON + görseller, ZIP).
- [ ] **Geri al / yinele.**
- [ ] **Video:** döner tabla animasyonu ve uzun ekran görüntüsünün kaydırılması, MP4/WebM (MediaRecorder veya WebCodecs).
- [ ] **Mağaza görseli üretici:** başlık/metin katmanları, App Store ve Play Store ölçülerinde toplu çıktı.

## Bilinen sorunlar

- Fırçalanmış metal uzak mesafede hafif hare (moiré) oluşturabiliyor; mip seviyesine göre normal yoğunluğu azaltılabilir.
- Çok geniş açılı spotlarda gölge haritası çözünürlüğü düşüyor (gölge kamerası fov = 2 × açı).
- Işık küreleri genelde kadraj dışında kalıyor; asıl kontrol ışık haritası.
- Küçük ekranlarda ışık haritası sahnenin bir köşesini örtüyor.
- 3840 px dışa aktarım mobil tarayıcılarda bellek sınırına takılabilir (render hedefleri büyük).
- **Gölge hataları (r128'den beri var):** nokta ışıkta (`light-type.js MOD=bulb`) gölge kamerasının `far` düzleminin ötesindeki zemin tamamen gölgede kalıyor (keskin kenarlı gri dikdörtgen). Spot ışıkta (Stüdyo preset'i, `laptop.js PRESET=1`) zemin gölgesi düz bir çizgiyle kesiliyor; muhtemelen gölge kamerasının `far`/frustum sınırı.
- Işık küresi bazı sahnelerde kadraja giriyor.
- Spot/nokta ışıkta mesafeyle zayıflama yok (`decay = 0`, r128 davranışı). Fiziksel `decay = 2` daha gerçekçi olur ama preset'lerin yeniden ayarlanmasını gerektirir.
