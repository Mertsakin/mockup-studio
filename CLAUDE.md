# Mockup stüdyosu — Claude Code rehberi

Tarayıcıda çalışan 3B cihaz mockup aracı. Kullanıcı ekran görüntüsünü yükler, cihaz(lar)ı sahneye dizer, ışık kurar, istediği açıdan yüksek çözünürlüklü PNG/JPG alır. Öncelik **gerçekçilik**: malzeme, ışık, gölge ve detay kalitesi her özellikten önce gelir.

Proje Vite + ES modülleri yapısında (`src/`), three **r186** npm'den geliyor. İlk sürüm claude.ai'de tek dosyalık bir artifact olarak r128 ile geliştirildi; bazı kararlar oradan kalma (aşağıda "Geçmişten kalanlar").

## Çalıştırma ve test

```bash
npm install
npm run dev            # http://localhost:5173
npm run build          # dist/ (göreli yollar, herhangi bir klasörden açılır)
npm run check          # ESLint: tanımsız isim, kullanılmayan değişken, import hataları
npm run render         # headless Chromium render -> renders/out.png (ilk sefer: npx playwright install chromium)
```

Her görsel değişiklikten sonra **render alıp PNG'ye bak**. Ayrıntılar ve sınırlar: `tools/render-harness/README.md`.

Örnek ve önce/sonra karşılaştırması:
```bash
W=800 H=1000 COLOR=silver PRESET=1 \
  node tools/render-harness/harness.js renders/lap.png tools/render-harness/scenes/laptop.js
tools/render-harness/suite.sh renders/once     # tüm referans sahneler; değişiklikten sonra renders/sonra
tools/render-harness/compare.sh renders/once renders/sonra
```

## Mimari haritası

| Dosya | İçerik |
|---|---|
| `src/main.js` | giriş: UI panellerini içe aktarır, sahneyi kurar, render döngüsünü başlatır |
| `src/debug.js` | yalnızca dev: modülleri test düzeneğine `window.__app` olarak açar |
| `src/util.js` | `$`, `$$`, `D2R`, `V3`, `clamp`, `wrap`, `mkCanvas`, `roundRect`, `rng` |
| `src/state/constants.js` | `TYPES`, `DEFAULT_SCENE`, `COLORS`, `THEMES`, `PRESETS` (sahne açıları), `COMPS` (hazır kompozisyonlar), `DEFAULT_FINISH` |
| `src/state/templates.js` | 20 hazır şablon (`TEMPLATES`, `FORMATS`): oran, sahne, arka plan, ışık preset adı, cihazlar. `ui/templates.js` `applyTemplate` ile normal duruma çevirir; `?template=<id>` stüdyoyu o şablonla açar |
| `src/state/state.js` | `state`, `newDevice()`, `byId`, `sel`, `view` (`fitRadius`, `fitBox`, `aspect`) |
| `src/render/pcss.js` | `patchShadows`: `THREE.ShaderChunk.shadowmap_pars_fragment` yaması; `BasicShadowMap`'in `getShadow` / `getPointShadow`'unu PCSS sürümleriyle değiştirir (aşağıya bak) |
| `src/render/renderer.js` | renderer (ACES, sRGB çıkış, `BasicShadowMap`), sahne, kamera, `LIGHT_SCALE`, `req()` (render kirli bayrağı; `onChange` kancalarını çağırır), `overlays` (fotoğrafa/dışa aktarıma girmeyen yardımcılar: gizmo), `onIdle` (raster yakınsadıktan sonra her kare) |
| `src/render/stage.js` | ortam ışığı, `SHADOW_CHUNK` (zemin gölgesi maskesi), zemin + duvar gölge yakalayıcıları, `lightRoot`, `pivot` > `comp` |
| `src/render/transform.js` | `refit` (kadraj), `extents`, `camDist`, `applyTransform` (her değişiklikte çağrılan ana güncelleme) |
| `src/render/environment.js` | ışıklara göre üretilen PMREM ortamı: `rebuildEnv`, `scheduleEnv` (debounce + imza) |
| `src/render/pathtrace.js` | fotoğraf kalitesi (three-gpu-pathtracer, ilk kullanımda yüklenir). `setupStudio` sahneyi geçici olarak hazırlar ve geri alma fonksiyonu döndürür: ışıklar → alan ışıkları, ekranlar → ışık yayan cam, ortam → stüdyo HDRI'ı (`public/hdri`, CC0, eski gradyanla aynı ortalama parlaklığa ölçeklenir), cila katmanlı malzemeler → cilasız kopya (bu kütüphane clearcoat'u siyah çiziyor), zemin açık + düz/gradyan arka planda hafif ışıyan stüdyo fonu. Dışa aktarım (`renderPathTraced`) ve önizleme (`previewTick` / `stopPreview`) aynı kurulumu kullanır. Tek parça (tiles 1×1), örnek sayısına göre güçlenen/zayıflayan gürültü giderme |
| `src/render/photo-preview.js` | kalite "Fotoğraf" iken raster render bitip sahne 0,7 sn değişmeyince önizlemeyi yol izlemeye geçirir; her değişiklik (`req`) anında geri döndürür. Gizmo görünürken ve test düzeneğinde (`window.__noPhotoPreview`) devre dışı |
| `src/render/backgrounds.js` | desenli arka planlar (`drawPattern`: kırık ışık, ızgara, parıltı, daire). Önizleme ve dışa aktarım aynı çizimi kullanır |
| `src/render/accumulation.js` | ilerlemeli render: `ACC`, `hookSeed`, `renderSample`, `present`, `renderNow`, `startLoop` |
| `src/devices/materials.js` | `M` (cam, lens, tuş, port, kauçuk, ekran camı yansıma katmanı `M.glare`), `tex`, prosedürel fırçalanmış/kumlanmış haritalar, `FINISHES`, `applyFinish`, `applyColorTo` |
| `src/devices/geometry.js` | `rrShape(w,h,r,cx,cy)` (köşe başına yarıçap destekler), `flatRR`, `slab` (pahlı ekstrüzyon), `lens`, `hole`, `onSide`, doku üreticiler |
| `src/devices/{phone,tablet,laptop,monitor,browser,page,custom}.js` | cihaz kurucuları; `details/phone.js` (anten bantları, portlar), `keyboard.js` (`KB_ROWS` Türkçe Q, `buildKeyboard` genişlik başına `InstancedMesh`), `index.js` (`BUILDERS`) |
| `src/devices/rt.js` | `RT` Map (id → mesh grubu + materyaller), `setHolder` |
| `src/devices/runtime.js` | `buildRT`, `disposeRT`, `rebuild` |
| `src/devices/screen.js` | `setScreenTexture` (aynı boyutta tuvali ve dokuyu yeniden kullanır), `scrollScreen` / `scrollScreens` (uzun ekran görüntüsünde kaydırma, kare başına bir çizim), `drawFit`, `customCanvas`, `updateChrome`, `detectScreen` (çerçeve PNG'sinde şeffaf ekran alanını flood-fill ile bulur) |
| `src/lights/mods.js` | `MODS` (şekillendiriciler), `LIGHT_PRESETS`, `newLight`, `lightTan`, `shadowCharacter` |
| `src/lights/runtime.js` | `LRT` Map, `buildLight`, `disposeLight`, `applyAmbient`, `updateLights` (gölge parametrelerini paketler), `onLightsUpdated` |
| `src/lights/actions.js` | `rebuildLights`, `applyLightPreset` |
| `src/ui/sync.js` | `syncUI` / `syncAll`: her panel kendi parçasını `onSyncUI(d => …)` ile kaydeder |
| `src/ui/ui-state.js` | belgeye girmeyen editör durumu: `ui.kind` (sağ panel ne gösteriyor: `board` / `device` / `light`), `ui.tool` (`select` / `move` / `rotate` / `orbit` / `hand`), `ui.space` (Boşluk basılı). `setUi`, `onUi` |
| `src/ui/boards.js` | **artboardlar.** Belge = artboard listesi; her biri tam bir sahne anlık görüntüsü (`snapshot`) + tuvaldeki konumu (çıktı pikseli cinsinden). Yalnızca aktif artboard canlıdır (`state` + WebGL tuvali); diğerleri son render'larının küçük resmini gösterir. Geçişte canlı sahne kendi artboard'una yazılır (`snapshot` + küçük resim), hedefinki `restore` edilir; böylece paneller hiç değişmeden çalışır. `docSnapshot` / `applyDoc` / `docSignature`: geri al, otomatik kayıt ve proje dosyası belge düzeyinde çalışır; geri alma değişen artboard'a geçer |
| `src/ui/workspace.js` | sonsuz tuval: kaydırma (H, Boşluk, orta tuş, tekerlek), yakınlaştırma (⌘/Ctrl + tekerlek, pinch, ⇧1 tümü, ⇧2 aktif), artboard'u adından sürükleme ve diğer artboard'ların kenar/merkezine yapışma (kırmızı kılavuz; Shift tek eksen, ⌘/Ctrl yapışmasız). `layout()`'a geometri sağlar: canlı `#frame` aktif artboard'un ekrandaki yerine oturur (piksel oranı en fazla 2600 px'e sınırlı) |
| `src/ui/shell.js` | editör kabuğu: seçime göre sağ panel (artboard / cihaz / ışık), katman ağacı (klavyeyle gezilir, çift tıkla yeniden adlandır), araçlar ve kısayollar (V W E O H, A artboard, Esc, Sil, ⌘S, ⌘O), menüler (cihaz/ışık ekle, dışa aktar), tema, Şablonlar sekmesi (şablon = yeni artboard), tüm artboard'ları ZIP olarak indirme |
| `src/ui/transform-box.js` | serbest dönüştürme kutusu (Photoshop Ctrl+T): Seç aracında seçili cihazın kendi sınır kutusu ekrana yansıtılır (açıdan bağımsız sarar). Köşe tutamacını sürüklemek cihazı orantılı ölçekler (0,3–2,5, Shift 0,1 adım, Esc iptal); en alt noktası yerinde kalır, zemindeki cihaz zeminde durur. T (tarayıcı izin verirse Ctrl/⌘+T) Seç aracına geçip kutuyu gösterir |
| `src/ui/icons.js` | **üretilir, elle düzenleme:** `node tools/icons/build-icons.mjs` (Solar "linear" seti, `@iconify-json/solar`, CC BY 4.0; el ikonu Solar'da olmadığı için aynı stilde çizildi). `icon(ad)`, `hydrateIcons()` (`data-icon` öğeleri) |
| `src/ui/capture.js`, `tools/capture/vite-plugin.mjs` | her cihazın kendi adresi (`siteUrl`): "Bu cihaza yakala" / "Tüm cihazlara": URL'yi her cihazın kendi görüntü alanında (telefon 390 mobil, tablet 820 mobil, dizüstü/tarayıcı 1440, monitör 1920; yükseklik ekran oranından) Playwright ile tam sayfa yakalar (en fazla 8000 CSS px), aynı görüntü alanını isteyen cihazlar tek yakalamayı paylaşır. Uç nokta (`/api/capture`) yalnızca dev sunucusunda var; yayınlanmış sürüm için ayrı bir servis gerekir |
| `src/io/project.js` | sahnenin tam anlık görüntüsü (`snapshot` / `restore` / `signature`): durum + cihazlar + ışıklar + kadraj; görseller anahtarla, bellekte. Proje dosyası (`.mockup.json`, görseller gömülü) ve IndexedDB otomatik kaydı (görseller blob olarak, tek bağlantı, tek transaction, sıralı) |
| `src/ui/history.js` | geri al / yinele: durumu her 150 ms yoklar, değişip bir yoklama sabit kalınca (sürükleme bittiğinde) adım kaydeder; yeni bir işlem (fareye ya da tuşa basma) bekleyen değişikliği hemen kaydeder. Her adımdan sonra otomatik kayıt, sekme gizlenince/kapanınca anında kayıt. Açılışta şablon yoksa son çalışmayı geri yükler. Proje kaydet/aç düğmeleri |
| `src/ui/arrange.js` | "Zemine oturt" (şablonlardaki `settleDevices`) ve "Eşit dağıt" (soldan sağa eşit aralık, uçtakiler sabit). Gizmo'da Shift: 1 cm / 15° adım (`gizmo.js`) |
| `src/ui/navigator.js` | canlı artboard'un sağ üstündeki görünüm küpü (64 px; yüzler Ön/Arka/Sağ/Sol/Üst/Alt, sahneyle döner, ışık haritasıyla aynı görsel dil). Yüzün ortasına tıkla: o yönden görünüm; kenar/köşeye yakın tıkla: aradaki ¾ açı (yüz normallerinin toplamından yükseklik → `rx`, yön → `ry`); sürükle: yörünge; açı üzerine gelince görünür ve odaklanma ("Odakla", F, çift tıklama): `comp` seçili cihaza göre ortalanır ve kadraj ona göre ayarlanır, sahne o cihazın etrafında döner; "Kadraja sığdır" tüm kompozisyona döner. Geçişler animasyonlu; sahneye basmak ya da tekerlek iptal eder |
| `src/ui/layers.js` | katman sırası (En öne / Öne / Arkaya / En arkaya, ⌘/Ctrl + [ ]). 3B'de "önde" kameraya yakın demek: komut cihazı diğerlerini geçene kadar derinlikte taşır (zemin açıksa zemin boyunca), ölçeği mesafe oranıyla telafi eder; ekrandaki yeri ve boyutu korunur. Sıra kameraya göredir |
| `src/ui/gizmo.js` | cihaz başına taşı/döndür gizmo'su (three `TransformControls`). Kanvasa bağlı değil: `pointer.js` olayları önce gizmo'ya iletir. Konum modunda gizmo, `comp` uzayındaki bir vekili (proxy) sürer: oklar zemine hizalıdır. Dönüş modunda tutucunun kendisini, yerel eksenlerde döndürür. Dışa aktarımda gizlenir |
| `src/ui/*.js` | `layout` (canlı tuval boyutu `workspace`'ten, arka plan), `sliders`, `controls` (genel segmentler, anahtarlar), `devices-panel` (cihaz listesi, tip, kompozisyon, renk/yüzey), `lights-panel`, `angles` (hazır/kayıtlı açılar), `image-input`, `pointer` (sahne sürükleme, `pickLight`, `dragLight3D`), `dome` (ışık haritası, `renderDome`, `setFromDome`), `toast` |
| `src/export/export.js` | `renderExport(onProgress)` (`state.quality`: `fast` raster / `photo` yol izleme), `offer` (`<a download>` ile indirme), ZIP toplu dışa aktarma (JSZip dinamik import) |
| `tools/blender/phone.py` | deneysel: telefonun Blender'da (headless, `blender -b --python … -- out.glb`) parametrik modeli; malzeme adları uygulamanın slotlarıyla aynı. Henüz uygulamada kullanılmıyor (yol izlemede mevcut modelle farkı küçük çıktı) |
| `index.html`, `src/style.css` | editör arayüzü (üst bar, sol katmanlar, tuval + alt araç çubuğu, sağ özellikler) ve stiller. Tasarım referansı: `wireframes/design.html`. Token'lar `:root`'ta; JS/SVG `--field`, `--line`, `--muted`, `--accent`, `--axis-*` adlarını kullanır |
| `showcases.html`, `src/showcases.js`, `src/showcases.css` | şablon galerisi (3B motoru yüklemez). Önizlemeler `public/showcases/<id>.jpg`: şablon ya da cihaz görünümü değişince `tools/showcases/thumbs.sh [id…]` ile yeniden üret |

**Bağımlılık yönü:** `state` → `render`/`devices`/`lights` → `io` → `ui` → `main`. Döngüsel import yok, öyle kalsın. Alt katman UI'a ihtiyaç duyarsa kanca kullan (ör. `onLightsUpdated`, `onSyncUI`). Başka modülden yeniden atanması gereken değerler `export let` yerine bir nesnede tutulur (`view`, `redraw`).

## Durum modeli

- `state.scene` — sahne açısı (rx/ry/rz, zoom, fov, pan). `pivot` bu açıyla döner; ışıklar dönmez.
- `state.devices[]` — her cihaz: tip, renk, `finish`, konum/dönüş/ölçek, ekran görüntüsü, tipe özel alanlar. Çalışma zamanı nesneleri `RT` içinde.
- `state.lights[]` — her ışık: `mod` (şekillendirici), `type`, `az`/`el`/`dist`, `size`, `intensity`, `color`, `shadow`, spot için `angle`/`penumbra`. Çalışma zamanı `LRT` içinde.
- Etkileşim (araçlar, `pointer.js`): Seç/Taşı/Döndür'de cihaza tıklamak onu seçer, cihazı sürüklemek ekranda taşır, boş alanı sürüklemek sahneyi döndürür; Taşı (W) ve Döndür (E) ayrıca gizmo'yu gösterir. Yörünge (O) her yerde döndürür. Kaydır (H) tuvali kaydırır. Alt + tekerlek kamera yakınlığı; seçili cihazın uzun ekran görüntüsünün üzerinde tekerlek ekranı kaydırır. Gizmo değerleri cihazın `px/py/pz/rx/ry/rz` alanlarına yazar.
- Belge birden fazla artboard içerir (`ui/boards.js`); `state` her zaman **aktif** artboard'un sahnesidir.
- UI → state → `applyTransform()` → `req()` (render kirli bayrağı). Yapısal değişiklikler `rebuild(d, refit)` ile.

## Koordinat ve birim kuralları

- **Birim ≈ cm** (telefon 7.15 × 14.7). Kaynak boyutları ve ışık uzaklığı `view.fitRadius`'a göre göreli.
- Işıklar **kameraya göre sabit** (stüdyo ışığı gibi): `az = 0` kamera tarafı, `90` sağ, `180` arka; `el` ufuktan yükseklik. Sahne döndürmek ürünü döner tabla üzerinde çevirmek gibidir.
- Cihazlar `buildRT`'de sınır kutusuna göre ortalanır. Kompozisyonlarda cihazlar aynı zemine oturacak şekilde `py` verilir.
- **Eş merkezli köşeler:** yuvarlak bir çerçevenin içindeki açıklığın (ekran, cam, kesik) köşe yarıçapı = dış yarıçap − et kalınlığı. Kenar kalınlıkları farklıysa her köşe iki komşu kenardan kalın olanı düşer: `innerRadii(r, üst, sağ, alt, sol)` (`devices/geometry.js`). Sabit yarıçap yazma.
- Gölge düşürmemesi gereken ince yüzeyler (ızgara, havalandırma, tuş yazıları) `userData.decal = true` taşır.
- **Temas gölgesi:** `aoPlane(w, d, opaklık, y, yumuşaklık)` (`devices/geometry.js`) cihazın zemine değdiği yerin altına bulanık koyu bir düzlem koyar (`userData.ao`). `applyTransform` onu yalnızca zemin açıkken ve düzlem yukarı bakarken gösterir; yol izleyici gizler. Kadraj ve ortalama hesaplarına girmez; dizüstününki geçmişle uyum için girer (`userData.fit`).

## Kırılgan noktalar (değiştirmeden önce oku)

1. **PCSS gölge paketi.** `shadow.radius` gerçek bir yarıçap değil, ışık başına yumuşaklık parametresi taşır:
   - `> 0` yönlü ışık: `P * 1000`, `P = (far - near) * tan / frustumGenişliği`
   - `< 0` spot: `Q * 1000`, `Q = S / (near * 2 * tan(açı))`; shader **far = 10 × near** varsayar (`pcssLin`). Spot gölge kamerasının near/far oranını değiştirme.
   - nokta ışık: `S * 100` (dünya birimiyle kaynak boyutu)
   Formüller `updateLights` içinde (`lights/runtime.js`); shader `patchShadows` içinde (`render/pcss.js`). Biri değişirse diğeri de değişmeli.
   Gölge tipi **`BasicShadowMap` olmalı**: PCF'de harita `sampler2DShadow` olur ve engelleyici araması ham derinlik okuyamaz. Yama, chunk'taki fonksiyonları gövdelerindeki tekil satırlardan bulur (npm build'i shader yorumlarını siler); three yükseltilip bulamazsa açık bir hatayla durur. Nokta ışık küp haritası yüz eksenine göre perspektif derinlik saklar; `pcssCubeDist` bunu radyal mesafeye çevirir.
2. **Zemin gölgesi** (`SHADOW_CHUNK`) her ışığın gölgesini o ışığın renk/şiddet payıyla ağırlıklandırır. three, gölge düşüren ışıkları dizilerin başına sıralar; döngüler buna dayanır.
3. **İlerlemeli render.** Örnek hedefi (`ACC.frame`) `isXRRenderTarget = true` taşır: three ton eşlemesini ve çıktı renk uzayını yalnızca ekrana ya da bu bayrağı taşıyan hedeflere uygular. Böylece her örnek ekrandaki gibi (malzeme başına `toneMapped`, sRGB kodlu, `RGBA8`) yazılır ve ortalama görüntü uzayında alınır. Bayrağı kaldırırsan ekran dokuları ton eşlemesinden geçer ve renkler bozulur. `renderer.shadowMap.autoUpdate = false`; gölge haritaları yalnızca `renderSample(0)`'da yenilenir. Sahnede bir şey değişip `req()` çağrılmazsa gölgeler eski kalır. Gürültü tohumu her materyale `hookSeed` ile `onBeforeCompile` üzerinden enjekte edilir. Yeni materyal türleri otomatik yakalanır, `ShaderMaterial` hariç.
4. **Derinlik hassasiyeti.** Örnek render hedefi `stencilBuffer: true` ile oluşturulur (24 bit derinlik + stencil). Ekran camı ile çerçeve gibi 0.002 aralıklı katmanlar buna dayanır.
5. **Ortam yansımaları** ışıklardan türetilir (`rebuildEnv`): softbox dikdörtgen, oktabox sekizgen, güneş parlak nokta. Sürükleme sırasında debounce edilir; gölgeler anlık, yansımalar 140 ms sonra güncellenir.
6. **Renk yönetimi ve ışık birimleri.** three'nin renk yönetimi açık: CSS/hex renkler (`color.set('#…')`) otomatik lineere çevrilir, `convertSRGBToLinear()` çağırma. r128'de lineer olarak ayarlanmış sabitler `lin(0x…)` ile verilir (`devices/materials.js`). Doku canvas'ları `colorSpace = SRGBColorSpace`. Ekran dokuları `toneMapped: false`. Işık şiddetleri durumda r128 anlamını korur; three'ye geçerken `LIGHT_SCALE` (π) ile çarpılır (doğrudan ışıklar, ortam ışığı ve zemin gölgesinin `uAmbientW` ağırlığı birlikte). Spot ve nokta ışık `decay = 0` (mesafeyle zayıflama yok).
7. Tuş yazıları yazı tipi yüklendikten sonra yeniden çizilmek için dizüstü yeniden kurulur (`document.fonts.ready`).
8. **Yol izleme (fotoğraf kalitesi).** Önizleme canlı sahneyi değiştirir: `req()` çağrılmadan sahneyi okuyan ya da değiştiren yeni bir kod yolu eklersen önce `onChange` ile önizlemenin kapandığından emin ol. Yol izleyici `InstancedMesh`'i okuyamaz (klavye düz mesh'lerle kurulur) ve `MeshBasicMaterial` ışık yaymaz (ekranlar render süresince ışık yayan malzemeye geçirilir). Sahneye yeni bir şey eklersen `renderPathTraced` içindeki geçici değişiklik/geri alma listesine bak. Zemin gölgesi yalnızca stüdyo fonu ile (zemin açık + opak arka plan) vardır; şeffaf arka planda gölge yakalanmaz. İlerleme gerçek: her örnekten sonra hedeften bir piksel okunur (yoksa GPU kuyruğu şişer ve bağlam düşer). Hız: 1080 px / 128 örnek ≈ 85 sn (M1 Pro, headless).

## Fotoğraf kalitesi (yol izleme)

- Dışa aktarım: `renderPathTraced(PHOTO_SAMPLES, onProgress, PHOTO_BUDGET_MS)` (`src/export/export.js`, 64 örnek / 30 sn). Ham görüntü `present(1e-3)` ile alınır (0 eşik filtrede NaN üretir), sonra OIDN (`denoiser` paketi, WebGL, `useTiling`, `tileSize 256`, `srgb = true`; ağırlıklar `public/oidn/`). OIDN çıktısı boşsa ya da boyutu tutmuyorsa ham görüntüye düşülür.
- Test düzeneğinde `NO_OIDN=1` OIDN'i kapatır, `OIDN_SRGB=0/1` srgb ayarını zorlar.
- Canlı önizleme isteğe bağlı (`state.photoPreview`, "Canlı fotoğraf" anahtarı); varsayılan kalite "Hızlı".
- Tuş yazısı dokusu 4096 px genişliğinde (yakın çekimde keskinlik).

## Geçmişten kalanlar

- **r128 kalibrasyonu.** Işık şiddetleri, preset'ler ve lineer renk sabitleri r128'de göz kararı ayarlandı; r186'ya taşınırken görünüm korunacak şekilde çevrildi (bkz. kırılgan nokta 6).
- **İndirme** yerel: `offer(name, blob)` geçici bir `<a download>` + `URL.createObjectURL` kullanır. JSZip yüklenemezse toplu dışa aktarım her açıyı ayrı dosya olarak indirir.
- `localStorage` erişimleri try/catch içinde; öyle kalsın.

## Tasarım ve hukuki kurallar

- **Dizüstü** ince, jenerik bir model (6,75 mm gövde, alçak profilli tuşlar). Telefon ve tablet: eloksal kasa (varsayılan), 2.5D ön cam (yuvarlak kenarlı ince slab), temas gölgesi. Monitör: 7,5 mm panel, yumuşak arka gövde, kablo delikli ayak, ince taban; arka plakanın UV'leri cm ölçeğinde.
- **Cihazlar jenerik kalmalı.** Apple veya başka bir markanın ürün tasarımını, logosunu ya da imza niteliğindeki detaylarını (ör. belirli kamera adası düzeni, çentik/ada şekli, ayırt edici kasa formu) birebir modelleme. Gerçek ürün görünümü isteyen kullanıcı, lisanslı görselini "Kendi çerçeven" ile yükler.
- **UI metinleri Türkçe**, cümle düzeninde (yalnızca ilk harf büyük). Kod yorumları İngilizce olabilir.
- Erişilebilirlik korunmalı: segment butonlarında `aria-pressed`, form alanlarında `label`/`aria-label`, ışık haritasında klavye desteği.
- Görsel dil: açık/koyu tema token'ları `:root`'ta. Sabit renk yazma, token kullan.

## Çalışma şekli

- Küçük, doğrulanabilir adımlar. Her görsel değişiklikten sonra ilgili sahneyle render al ve PNG'yi incele; önce/sonra karşılaştır.
- Gerçekçilik kararlarında fotoğraf davranışını referans al (kaynak büyüdükçe/yaklaştıkça gölge yumuşar, temas noktasında gölge sertleşir vb.).
- Büyük refaktörde (ör. three yükseltmesi) önce bugünkü sahnelerden render al, sonra `diff.js` ile önce/sonra karşılaştır.
