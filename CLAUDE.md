# Mockup stüdyosu — Claude Code rehberi

Tarayıcıda çalışan 3B cihaz mockup aracı. Kullanıcı ekran görüntüsünü yükler, cihaz(lar)ı sahneye dizer, ışık kurar, istediği açıdan yüksek çözünürlüklü PNG/JPG alır. Öncelik **gerçekçilik**: malzeme, ışık, gölge ve detay kalitesi her özellikten önce gelir.

Proje Vite + ES modülleri yapısında (`src/`), three **r128** npm'den geliyor. İlk sürüm claude.ai'de tek dosyalık bir artifact olarak geliştirildi; r128 ve bazı kararlar o ortamın kısıtlarından kalma (aşağıda "Geçmişten kalanlar").

## Çalıştırma ve test

```bash
npm install
npm run dev            # http://localhost:5173
npm run build          # dist/ (göreli yollar, herhangi bir klasörden açılır)
npm run check          # ESLint: tanımsız isim, kullanılmayan değişken, import hataları
npm run render         # headless render -> renders/out.png  (Linux: npm run render:linux)
```

Her görsel değişiklikten sonra **render alıp PNG'ye bak**. Ayrıntılar ve sınırlar: `tools/render-harness/README.md`.

Örnek ve önce/sonra karşılaştırması:
```bash
W=800 H=1000 FRAMES=34 ACC=1 COLOR=silver PRESET=1 \
  node tools/render-harness/harness.js renders/lap.png tools/render-harness/scenes/laptop.js
node tools/render-harness/diff.js renders/lap-before.png renders/lap.png renders/lap-diff.png
```
(Linux'ta `node` komutunun önüne `xvfb-run -a -s "-screen 0 640x480x24"` ekle.)

## Mimari haritası

| Dosya | İçerik |
|---|---|
| `src/main.js` | giriş: UI panellerini içe aktarır, sahneyi kurar, render döngüsünü başlatır |
| `src/util.js` | `$`, `$$`, `D2R`, `V3`, `clamp`, `wrap`, `mkCanvas`, `roundRect`, `rng` |
| `src/state/constants.js` | `TYPES`, `DEFAULT_SCENE`, `COLORS`, `THEMES`, `PRESETS` (sahne açıları), `COMPS` (hazır kompozisyonlar), `DEFAULT_FINISH` |
| `src/state/state.js` | `state`, `newDevice()`, `byId`, `sel`, `view` (`fitRadius`, `fitBox`, `aspect`) |
| `src/render/pcss.js` | `patchShadows`: `THREE.ShaderChunk.shadowmap_pars_fragment` yaması, PCSS yumuşak gölge (aşağıya bak) |
| `src/render/renderer.js` | renderer (ACES, sRGB çıkış, PCF gölge), sahne, kamera, `req()` (render kirli bayrağı) |
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
2. **Zemin gölgesi** (`SHADOW_CHUNK`) her ışığın gölgesini o ışığın renk/şiddet payıyla ağırlıklandırır. three, gölge düşüren ışıkları dizilerin başına sıralar; döngüler buna dayanır.
3. **İlerlemeli render.** `renderer.shadowMap.autoUpdate = false`; gölge haritaları yalnızca `renderSample(0)`'da yenilenir. Sahnede bir şey değişip `req()` çağrılmazsa gölgeler eski kalır. Gürültü tohumu her materyale `hookSeed` ile `onBeforeCompile` üzerinden enjekte edilir. Yeni materyal türleri otomatik yakalanır, `ShaderMaterial` hariç.
4. **Derinlik hassasiyeti.** Örnek render hedefi `stencilBuffer: true` ile oluşturulur. Bunu kaldırırsan 16 bit derinliğe düşer ve ekran camı ile çerçeve gibi 0.002 aralıklı katmanlar titreşir.
5. **Ortam yansımaları** ışıklardan türetilir (`rebuildEnv`): softbox dikdörtgen, oktabox sekizgen, güneş parlak nokta. Sürükleme sırasında debounce edilir; gölgeler anlık, yansımalar 140 ms sonra güncellenir.
6. **Renk yönetimi.** Materyal renkleri `convertSRGBToLinear()` ile verilir. Ekran dokuları `toneMapped: false` olduğu için görsel renkleri doğru kalır.
7. Tuş yazıları yazı tipi yüklendikten sonra yeniden çizilmek için dizüstü yeniden kurulur (`document.fonts.ready`).

## Geçmişten kalanlar

- **three r128.** claude.ai'nin CSP'si yalnızca cdnjs/jsdelivr'a izin verdiği için seçilmişti. Artık npm'den geliyor; yükseltme `TODO.md`'de.
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
