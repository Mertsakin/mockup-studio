# Yol haritası

Öncelik sırası, gerçekçilik ve iş akışı hızı birlikte düşünülerek verildi. Her maddeden sonra render düzeneğiyle görsel doğrulama yap.

## 1. Temel (önce bunlar)

- [x] **Yerel indirme:** `offer()` içindeki `window.claude.use('downloads')` yolunu `<a download>` tabanlı indirmeyle değiştir; ZIP toplu indirme de aynı yoldan.
- [ ] **Modüllere ayırma:** Vite + ES modülleri. Önerilen yapı: `state/`, `render/` (renderer, pcss, accumulation, environment), `devices/` (her cihaz ayrı dosya, `details/`), `lights/`, `ui/`, `export/`. Test düzeneğini yeni giriş noktasına uyarla (şu an `/* ---------- init ---------- */` işaretine kanca atıyor).
- [ ] **three.js yükseltmesi (r128 → güncel):** dikkat edilecekler:
  - `outputEncoding`/`encoding` → `outputColorSpace`/`colorSpace`
  - fiziksel ışık birimleri varsayılan; şiddetler yeniden kalibre edilmeli (yaklaşık ×π)
  - `WebGLMultisampleRenderTarget` → `WebGLRenderTarget({ samples })`
  - `shadowmap_pars_fragment` ve `getShadow` imzası değişti (yeni sürümlerde `shadowIntensity` parametresi var); PCSS yaması ve `SHADOW_CHUNK` yeniden yazılmalı
  - `Quaternion.invert`, `Box3.setFromObject` davranışları kontrol edilmeli
  - yükseltmeden önce ve sonra aynı sahnelerden render alıp karşılaştır

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
- Test düzeneği headless-gl (WebGL1) kullanıyor: PMREM çalışmadığı için yansımalar yaklaşık simüle ediliyor; MSAA yok. Son kontrolü gerçek tarayıcıda yap.
