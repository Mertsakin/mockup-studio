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
| `src/state/state.js` | `state`, `newDevice()`, `byId`, `sel`, `view` (`fitRadius`, `fitBox`, `aspect`) |
| `src/render/pcss.js` | `patchShadows`: `THREE.ShaderChunk.shadowmap_pars_fragment` yaması; `BasicShadowMap`'in `getShadow` / `getPointShadow`'unu PCSS sürümleriyle değiştirir (aşağıya bak) |
| `src/render/renderer.js` | renderer (ACES, sRGB çıkış, `BasicShadowMap`), sahne, kamera, `LIGHT_SCALE`, `req()` (render kirli bayrağı) |
| `src/render/stage.js` | ortam ışığı, `SHADOW_CHUNK` (zemin gölgesi maskesi), zemin + duvar gölge yakalayıcıları, `lightRoot`, `pivot` > `comp` |
| `src/render/transform.js` | `refit` (kadraj), `extents`, `camDist`, `applyTransform` (her değişiklikte çağrılan ana güncelleme) |
| `src/render/environment.js` | ışıklara göre üretilen PMREM ortamı: `rebuildEnv`, `scheduleEnv` (debounce + imza) |
| `src/render/accumulation.js` | ilerlemeli render: `ACC`, `hookSeed`, `renderSample`, `present`, `renderNow`, `startLoop` |
| `src/devices/materials.js` | `M` (cam, lens, tuş, port, kauçuk, ekran camı yansıma katmanı `M.glare`), `tex`, prosedürel fırçalanmış/kumlanmış haritalar, `FINISHES`, `applyFinish`, `applyColorTo` |
| `src/devices/geometry.js` | `rrShape(w,h,r,cx,cy)` (köşe başına yarıçap destekler), `flatRR`, `slab` (pahlı ekstrüzyon), `lens`, `hole`, `onSide`, doku üreticiler |
| `src/devices/{phone,tablet,laptop,monitor,browser,custom}.js` | cihaz kurucuları; `details/phone.js` (anten bantları, portlar), `keyboard.js` (`KB_ROWS` Türkçe Q, `buildKeyboard` genişlik başına `InstancedMesh`), `index.js` (`BUILDERS`) |
| `src/devices/rt.js` | `RT` Map (id → mesh grubu + materyaller), `setHolder` |
| `src/devices/runtime.js` | `buildRT`, `disposeRT`, `rebuild` |
| `src/devices/screen.js` | `setScreenTexture`, `drawFit`, `customCanvas`, `updateChrome`, `detectScreen` (çerçeve PNG'sinde şeffaf ekran alanını flood-fill ile bulur) |
| `src/lights/mods.js` | `MODS` (şekillendiriciler), `LIGHT_PRESETS`, `newLight`, `lightTan`, `shadowCharacter` |
| `src/lights/runtime.js` | `LRT` Map, `buildLight`, `disposeLight`, `applyAmbient`, `updateLights` (gölge parametrelerini paketler), `onLightsUpdated` |
| `src/lights/actions.js` | `rebuildLights`, `applyLightPreset` |
| `src/ui/sync.js` | `syncUI` / `syncAll`: her panel kendi parçasını `onSyncUI(d => …)` ile kaydeder |
| `src/ui/*.js` | `layout` (kadraj, arka plan), `sliders`, `controls` (genel segmentler, anahtarlar), `devices-panel` (cihaz listesi, tip, kompozisyon, renk/yüzey), `lights-panel`, `angles` (hazır/kayıtlı açılar), `image-input`, `pointer` (sahne sürükleme, `pickLight`, `dragLight3D`), `dome` (ışık haritası, `renderDome`, `setFromDome`), `toast` |
| `src/export/export.js` | `renderExport`, `offer` (`<a download>` ile indirme), ZIP toplu dışa aktarma (JSZip dinamik import) |
| `index.html`, `src/style.css` | arayüz iskeleti ve stiller |

**Bağımlılık yönü:** `state` → `render`/`devices`/`lights` → `ui` → `main`. Döngüsel import yok, öyle kalsın. Alt katman UI'a ihtiyaç duyarsa kanca kullan (ör. `onLightsUpdated`, `onSyncUI`). Başka modülden yeniden atanması gereken değerler `export let` yerine bir nesnede tutulur (`view`, `redraw`).

## Durum modeli

- `state.scene` — sahne açısı (rx/ry/rz, zoom, fov, pan). `pivot` bu açıyla döner; ışıklar dönmez.
- `state.devices[]` — her cihaz: tip, renk, `finish`, konum/dönüş/ölçek, ekran görüntüsü, tipe özel alanlar. Çalışma zamanı nesneleri `RT` içinde.
- `state.lights[]` — her ışık: `mod` (şekillendirici), `type`, `az`/`el`/`dist`, `size`, `intensity`, `color`, `shadow`, spot için `angle`/`penumbra`. Çalışma zamanı `LRT` içinde.
- UI → state → `applyTransform()` → `req()` (render kirli bayrağı). Yapısal değişiklikler `rebuild(d, refit)` ile.

## Koordinat ve birim kuralları

- **Birim ≈ cm** (telefon 7.15 × 14.7). Kaynak boyutları ve ışık uzaklığı `view.fitRadius`'a göre göreli.
- Işıklar **kameraya göre sabit** (stüdyo ışığı gibi): `az = 0` kamera tarafı, `90` sağ, `180` arka; `el` ufuktan yükseklik. Sahne döndürmek ürünü döner tabla üzerinde çevirmek gibidir.
- Cihazlar `buildRT`'de sınır kutusuna göre ortalanır. Kompozisyonlarda cihazlar aynı zemine oturacak şekilde `py` verilir.
- Gölge düşürmemesi gereken ince yüzeyler (ızgara, havalandırma, tuş yazıları) `userData.decal = true` taşır.

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

## Geçmişten kalanlar

- **r128 kalibrasyonu.** Işık şiddetleri, preset'ler ve lineer renk sabitleri r128'de göz kararı ayarlandı; r186'ya taşınırken görünüm korunacak şekilde çevrildi (bkz. kırılgan nokta 6).
- **İndirme** yerel: `offer(name, blob)` geçici bir `<a download>` + `URL.createObjectURL` kullanır. JSZip yüklenemezse toplu dışa aktarım her açıyı ayrı dosya olarak indirir.
- `localStorage` erişimleri try/catch içinde; öyle kalsın.

## Tasarım ve hukuki kurallar

- **Cihazlar jenerik kalmalı.** Apple veya başka bir markanın ürün tasarımını, logosunu ya da imza niteliğindeki detaylarını (ör. belirli kamera adası düzeni, çentik/ada şekli, ayırt edici kasa formu) birebir modelleme. Gerçek ürün görünümü isteyen kullanıcı, lisanslı görselini "Kendi çerçeven" ile yükler.
- **UI metinleri Türkçe**, cümle düzeninde (yalnızca ilk harf büyük). Kod yorumları İngilizce olabilir.
- Erişilebilirlik korunmalı: segment butonlarında `aria-pressed`, form alanlarında `label`/`aria-label`, ışık haritasında klavye desteği.
- Görsel dil: açık/koyu tema token'ları `:root`'ta. Sabit renk yazma, token kullan.

## Çalışma şekli

- Küçük, doğrulanabilir adımlar. Her görsel değişiklikten sonra ilgili sahneyle render al ve PNG'yi incele; önce/sonra karşılaştır.
- Gerçekçilik kararlarında fotoğraf davranışını referans al (kaynak büyüdükçe/yaklaştıkça gölge yumuşar, temas noktasında gölge sertleşir vb.).
- Büyük refaktörde (ör. three yükseltmesi) önce bugünkü sahnelerden render al, sonra `diff.js` ile önce/sonra karşılaştır.
