# Headless render düzeneği

Uygulamayı headless Chromium'da (Playwright, WebGL2) çalıştırıp bir PNG üretir. Amaç: her görsel değişiklikten sonra sonucu gerçekten **görmek** ve önceki hâliyle karşılaştırmak.

## Kurulum

```bash
npm install
npx playwright install chromium     # bir kez (~100 MB)
```

Linux'ta da aynı; ekran (xvfb) gerekmez. Chromium eksik sistem kütüphanesi isterse: `npx playwright install-deps chromium`.

## Kullanım

```bash
W=800 H=1000 COLOR=silver PRESET=1 \
  node tools/render-harness/harness.js renders/out.png tools/render-harness/scenes/laptop.js
```

Düzenek bir Vite dev sunucusunu kendi başlatır, sayfayı açar (uygulama boş belgeyle açılır; düzenek varsayılan sahneli bir artboard ekler), sahne dosyasını sayfa içinde çalıştırır, sonra dışa aktarım gibi `W × H` boyutunda render alıp açık gri zeminin üzerine yazar. Sayfada hata ya da `console.error` olursa çıkış kodu 1 olur.

| Değişken | Anlamı |
|---|---|
| `W`, `H` | çıktı boyutu (px) |
| `SAMPLES` | ilerlemeli render örnek sayısı. Varsayılan `64` (tam yakınsamış). Hızlı önizleme için `1` |
| `MARKERS=0` | ışık kürelerini gizle |
| `EXPORT=1` | ham render yerine gerçek dışa aktarım yolunu (`renderExport`) çalıştırır: arka plan ve kodlama dahil. `QUALITY=photo` ile yol izlemeli fotoğraf kalitesi (SwiftShader'da çok yavaş, `GPU=1` ile kullan) |
| `GPU=1` | SwiftShader yerine ANGLE/Metal. Daha hızlı ama sürücüye bağlı, bayt bayt kararlı değil. Karşılaştırma yaparken kullanma |
| sahneye özel | `COLOR`, `FIN`, `PRESET`, `RX`, `RY`, `ZOOM`, `C`, `MOD`… sahne dosyalarının başındaki açıklamalara bak |

Varsayılan SwiftShader (CPU) render'ı **deterministiktir**: aynı kod aynı PNG'yi üretir. Bu yüzden piksel farkı anlamlıdır.

## Önce/sonra karşılaştırması

```bash
tools/render-harness/suite.sh renders/once     # referans sahne paketi (~6 dk)
# … değişiklik …
tools/render-harness/suite.sh renders/sonra
tools/render-harness/compare.sh renders/once renders/sonra   # sonra/diff/*.png: 8× büyütülmüş fark
node tools/render-harness/sheet.js renders/yanyana.png 2 500 renders/once/laptop.png renders/sonra/laptop.png
```

- `diff.js a.png b.png [fark.png]` en büyük kanal farkını ve 2/255'ten fazla değişen piksel sayısını yazar; fark varsa çıkış kodu 1.
- `sheet.js çıktı.png sütun hücreYüksekliği a.png b.png …` görselleri tek sayfada yan yana dizer.

## Sahneler (`scenes/`)

- `default.js` — açılış sahnesi
- `laptop.js` — tek dizüstü
- `keyboard-closeup.js` — klavye yakın çekim (tuşlar, yazılar, ızgara, fırçalanmış yüzey)
- `phone.js` — telefon; `RY=150` arka, `RX=-70 RY=-35 ZOOM=1.5` alt kenar
- `composition.js` — hazır kompozisyonlar (`C=0..5`)
- `light-type.js` — tek ışıklı telefon; `MOD=sun|flash|softbox|bulb…` ile yönlü / spot / nokta ışık ve gölgesi
- `light-drag.js` — ışık sürükleme mantık testi (konsola değer yazar)
- `spheres.js` — malzeme/yansıma kontrolü için metal küreler

Sahne dosyası `module.exports = async (app, {env, W, H}) => {}` biçimindedir ve **sayfanın içinde** çalışır: Node modüllerine, `process` ya da `require`'a erişemez; ortam değişkenleri `env` ile gelir. `app('isim')`, `src/` altındaki herhangi bir modülün dışa aktardığı adı döndürür (ör. `app('state')`, `app('applyComp')`, `app('THREE')`). Dışa aktarılmayan bir şeye erişmek gerekirse ilgili modülde `export` listesine ekle.

## Nasıl bağlanıyor

- `src/main.js`, yalnızca dev modunda (`import.meta.env.DEV`) `src/debug.js`'i yükler; o da tüm modülleri `window.__app` üzerinden açar. Production build'de bu kod yoktur.
- Konsoldaki `console.log` çıktıları terminale aktarılır.

## Bilinen sınırlar

- SwiftShader yavaştır (800×1000, 64 örnek ≈ 20 sn). Hızlı bakış için `SAMPLES=1` ya da `GPU=1`.
- Dışa aktarım (indirme) ve UI etkileşimleri test edilmez; bunları gerçek tarayıcıda dene.
