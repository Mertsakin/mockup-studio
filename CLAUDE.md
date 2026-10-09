# Mockup stüdyosu — Claude Code rehberi

Tarayıcıda çalışan 3B cihaz mockup aracı. Kullanıcı ekran görüntüsünü yükler, cihaz(lar)ı sahneye dizer, ışık kurar, istediği açıdan yüksek çözünürlüklü PNG/JPG alır. Öncelik **gerçekçilik**: malzeme, ışık, gölge ve detay kalitesi her özellikten önce gelir.

Proje şu an **tek dosyalık bir prototip** (`mockup-studio.html`, ~1800 satır). claude.ai üzerinde yayınlanan bir artifact olarak geliştirildi; bu yüzden bazı kararlar o ortamın kısıtlarından geliyor (aşağıda "claude.ai'ye özel kısımlar").

## Çalıştırma ve test

```bash
npm install            # yalnızca test düzeneği için (three@0.128, gl, canvas, pngjs)
npm run serve          # http://localhost:5173/mockup-studio.html
npm run check          # satır içi script'in sözdizimi kontrolü
npm run render:linux   # Linux'ta headless render -> renders/out.png  (macOS/Windows: npm run render)
```

Her görsel değişiklikten sonra **render alıp PNG'ye bak**. Ayrıntılar ve sınırlar: `tools/render-harness/README.md`.

Örnek:
```bash
W=800 H=1000 FRAMES=34 ACC=1 COLOR=silver PRESET=1 \
  xvfb-run -a -s "-screen 0 640x480x24" \
  node tools/render-harness/harness.js mockup-studio.html renders/lap.png tools/render-harness/scenes/laptop.js
```

## Mimari haritası (dosya içindeki bölüm başlıkları sırasıyla)

| Bölüm | İçerik |
|---|---|
| sabitler | `TYPES`, `DEFAULT_SCENE`, `COLORS`, `THEMES`, `PRESETS` (sahne açıları), `COMPS` (hazır kompozisyonlar), `newDevice()`, `DEFAULT_FINISH`, `state` |
| `patchShadows` | `THREE.ShaderChunk.shadowmap_pars_fragment` yaması: PCSS yumuşak gölge (aşağıya bak) |
| three setup | renderer (ACES, sRGB çıkış, PCF gölge), sahne, kamera, `SHADOW_CHUNK` (zemin gölgesi maskesi), zemin + duvar gölge yakalayıcıları, `pivot` > `comp` hiyerarşisi |
| shared materials | `M` (cam, lens, tuş, port, kauçuk, ekran camı yansıma katmanı `M.glare`) |
| procedural surface maps | fırçalanmış / kumlanmış normal + roughness haritaları (canvas'ta üretilir), `FINISHES`, `applyFinish()` |
| geometry helpers | `rrShape(w,h,r,cx,cy)` (köşe başına yarıçap destekler), `flatRR`, `slab` (pahlı ekstrüzyon), `lens`, `hole`, `onSide`, doku üreticiler |
| device builders | `buildPhone`, `phoneDetails`, `buildTablet`, `buildLaptop`, `buildMonitor`, `buildBrowser`, `buildCustom` |
| laptop keyboard | `KB_ROWS` (Türkçe Q), `keyboardLayout`, `legendTexture`, `buildKeyboard` (genişlik başına `InstancedMesh`) |
| runtime per device | `RT` Map (id → mesh grubu + materyaller), `buildRT`, `disposeRT`, `rebuild`, `setHolder`, `updateChrome` |
| screen textures | `setScreenTexture`, `drawFit`, `customCanvas`, `detectScreen` (çerçeve PNG'sinde şeffaf ekran alanını flood-fill ile bulur) |
| transforms | `refit` (kadraj), `extents`, `camDist`, `applyTransform` (her değişiklikte çağrılan ana güncelleme) |
| lights | `MODS` (şekillendiriciler), `LIGHT_PRESETS`, `newLight`, `lightTan`, `LRT` Map, `buildLight`, `updateLights` (gölge parametrelerini paketler) |
| studio environment | ışıklara göre üretilen PMREM ortamı: `rebuildEnv`, `scheduleEnv` (debounce + imza) |
| progressive rendering | `ACC`, `hookSeed`, `renderSample`, `present`, `renderNow`, ana `loop` |
| UI bölümleri | sliders, device list, swatches, presets/saved angles, inputs, `syncUI` |
| light map | `renderDome`, `setFromDome`, `pickLight`, `dragLight3D` |
| export | `renderExport`, `offer` (`<a download>` ile indirme), ZIP toplu dışa aktarma |
| init | dosyanın sonu. **`/* ---------- init ---------- */` işaretini silme**: test düzeneği buraya kanca atıyor |

## Durum modeli

- `state.scene` — sahne açısı (rx/ry/rz, zoom, fov, pan). `pivot` bu açıyla döner; ışıklar dönmez.
- `state.devices[]` — her cihaz: tip, renk, `finish`, konum/dönüş/ölçek, ekran görüntüsü, tipe özel alanlar. Çalışma zamanı nesneleri `RT` içinde.
- `state.lights[]` — her ışık: `mod` (şekillendirici), `type`, `az`/`el`/`dist`, `size`, `intensity`, `color`, `shadow`, spot için `angle`/`penumbra`. Çalışma zamanı `LRT` içinde.
- UI → state → `applyTransform()` → `req()` (render kirli bayrağı). Yapısal değişiklikler `rebuild(d, refit)` ile.

## Koordinat ve birim kuralları

- **Birim ≈ cm** (telefon 7.15 × 14.7). Kaynak boyutları ve ışık uzaklığı `fitRadius`'a göre göreli.
- Işıklar **kameraya göre sabit** (stüdyo ışığı gibi): `az = 0` kamera tarafı, `90` sağ, `180` arka; `el` ufuktan yükseklik. Sahne döndürmek ürünü döner tabla üzerinde çevirmek gibidir.
- Cihazlar `buildRT`'de sınır kutusuna göre ortalanır. Kompozisyonlarda cihazlar aynı zemine oturacak şekilde `py` verilir.
- Gölge düşürmemesi gereken ince yüzeyler (ızgara, havalandırma, tuş yazıları) `userData.decal = true` taşır.

## Kırılgan noktalar (değiştirmeden önce oku)

1. **PCSS gölge paketi.** `shadow.radius` gerçek bir yarıçap değil, ışık başına yumuşaklık parametresi taşır:
   - `> 0` yönlü ışık: `P * 1000`, `P = (far - near) * tan / frustumGenişliği`
   - `< 0` spot: `Q * 1000`, `Q = S / (near * 2 * tan(açı))`; shader **far = 10 × near** varsayar (`pcssLin`). Spot gölge kamerasının near/far oranını değiştirme.
   - nokta ışık: `S * 100` (dünya birimiyle kaynak boyutu)
   Formüller `updateLights` içinde; shader `patchShadows` içinde. Biri değişirse diğeri de değişmeli.
2. **Zemin gölgesi** (`SHADOW_CHUNK`) her ışığın gölgesini o ışığın renk/şiddet payıyla ağırlıklandırır. three, gölge düşüren ışıkları dizilerin başına sıralar; döngüler buna dayanır.
3. **İlerlemeli render.** `renderer.shadowMap.autoUpdate = false`; gölge haritaları yalnızca `renderSample(0)`'da yenilenir. Sahnede bir şey değişip `req()` çağrılmazsa gölgeler eski kalır. Gürültü tohumu her materyale `hookSeed` ile `onBeforeCompile` üzerinden enjekte edilir. Yeni materyal türleri otomatik yakalanır, `ShaderMaterial` hariç.
4. **Derinlik hassasiyeti.** Örnek render hedefi `stencilBuffer: true` ile oluşturulur. Bunu kaldırırsan 16 bit derinliğe düşer ve ekran camı ile çerçeve gibi 0.002 aralıklı katmanlar titreşir.
5. **Ortam yansımaları** ışıklardan türetilir (`rebuildEnv`): softbox dikdörtgen, oktabox sekizgen, güneş parlak nokta. Sürükleme sırasında debounce edilir; gölgeler anlık, yansımalar 140 ms sonra güncellenir.
6. **Renk yönetimi.** Materyal renkleri `convertSRGBToLinear()` ile verilir. Ekran dokuları `toneMapped: false` olduğu için görsel renkleri doğru kalır.
7. Tuş yazıları yazı tipi yüklendikten sonra yeniden çizilmek için dizüstü yeniden kurulur (`document.fonts.ready`).

## claude.ai'ye özel kısımlar (yerelde uyarlanmalı)

- **İndirme:** artık yerel: `offer(name, blob)` geçici bir `<a download>` + `URL.createObjectURL` kullanır. JSZip yüklenemezse toplu dışa aktarım her açıyı ayrı dosya olarak indirir. (Eski `window.claude.use('downloads')` yolu ve önizleme penceresi kaldırıldı.)
- **CSP kısıtları:** Yayın ortamında script'ler yalnızca cdnjs/jsdelivr'dan yüklenebiliyordu, harici görsel yüklenemiyordu. three r128'in UMD build'i bu yüzden seçildi. Yerelde bu kısıt yok; npm + ES modül + güncel three'ye geçilebilir (bkz. `TODO.md`).
- `localStorage` erişimleri try/catch içinde; öyle kalsın.

## Tasarım ve hukuki kurallar

- **Cihazlar jenerik kalmalı.** Apple veya başka bir markanın ürün tasarımını, logosunu ya da imza niteliğindeki detaylarını (ör. belirli kamera adası düzeni, çentik/ada şekli, ayırt edici kasa formu) birebir modelleme. Gerçek ürün görünümü isteyen kullanıcı, lisanslı görselini "Kendi çerçeven" ile yükler.
- **UI metinleri Türkçe**, cümle düzeninde (yalnızca ilk harf büyük). Kod yorumları İngilizce olabilir.
- Erişilebilirlik korunmalı: segment butonlarında `aria-pressed`, form alanlarında `label`/`aria-label`, ışık haritasında klavye desteği.
- Görsel dil: açık/koyu tema token'ları `:root`'ta. Sabit renk yazma, token kullan.

## Çalışma şekli

- Küçük, doğrulanabilir adımlar. Her görsel değişiklikten sonra ilgili sahneyle render al ve PNG'yi incele; önce/sonra karşılaştır.
- Gerçekçilik kararlarında fotoğraf davranışını referans al (kaynak büyüdükçe/yaklaştıkça gölge yumuşar, temas noktasında gölge sertleşir vb.).
- Büyük refaktörde (modüllere ayırma, three yükseltmesi) önce test düzeneğini yeni yapıya uyarla, sonra davranışı adım adım taşı.
