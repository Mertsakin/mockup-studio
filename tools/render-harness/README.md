# Headless render düzeneği

`mockup-studio.html` içindeki uygulamayı tarayıcı olmadan çalıştırıp bir PNG üretir. Amaç: her görsel değişiklikten sonra sonucu gerçekten **görmek**.

## Kurulum

```bash
npm install
```

- `gl` (headless-gl) native olarak derlenir. Linux'ta gerekenler:
  `build-essential python3 pkg-config libxi-dev libglu1-mesa-dev libglew-dev xvfb`
  Derleme `uintptr_t` hatası verirse: `CXXFLAGS="-include cstdint" npm install`
- `canvas` hazır binary ile gelir; gelmezse cairo geliştirme paketleri gerekir.
- macOS'ta `xvfb` gerekmez; doğrudan `node ...` ile çalıştır.

## Kullanım

```bash
# Linux
W=800 H=1000 FRAMES=34 ACC=1 xvfb-run -a -s "-screen 0 640x480x24" \
  node tools/render-harness/harness.js mockup-studio.html renders/out.png tools/render-harness/scenes/laptop.js
```

| Değişken | Anlamı |
|---|---|
| `W`, `H` | çıktı boyutu (px) |
| `FRAMES` | çalıştırılacak animasyon karesi. İlerlemeli render 64 örneğe ~33 karede ulaşır. Tek geçişli hızlı önizleme için `2` |
| `ACC=1` | float birikim hedeflerini zorla, böylece ilerlemeli render çalışır. Olmadan tek geçiş render alınır (gölgeler grenli) |
| `REALPMREM=1` | three'nin PMREM'ini kullan (headless-gl'de siyah çıkar, yalnızca hata ayıklama için) |
| sahneye özel | `COLOR`, `FIN`, `PRESET`, `RX`, `RY`, `ZOOM`, `C`… sahne dosyalarının başındaki açıklamalara bak |

## Sahneler (`scenes/`)

- `default.js` — açılış sahnesi
- `laptop.js` — tek dizüstü
- `keyboard-closeup.js` — klavye yakın çekim (tuşlar, yazılar, ızgara, fırçalanmış yüzey)
- `phone.js` — telefon; `RY=150` arka, `RX=-70 RY=-35 ZOOM=1.5` alt kenar
- `composition.js` — hazır kompozisyonlar (`C=0..5`)
- `light-drag.js` — ışık sürükleme mantık testi (konsola değer yazar)
- `spheres.js` — malzeme/yansıma kontrolü için metal küreler

Sahne dosyası `async (app, {W, H, createCanvas, loadImage}) => {}` imzalı bir modüldür. `app('isim')` uygulama kapsamındaki herhangi bir değişken/fonksiyonu döndürür (ör. `app('state')`, `app('applyComp')`).

## Bilinen sınırlar

- **WebGL1 (headless-gl).** Tarayıcıda WebGL2 kullanılır; MSAA render hedefleri test edilmez.
- **PMREM çalışmıyor.** Düzenek ortam yansımalarını CPU'da kurulan bir küp dokuyla taklit eder. Metal/cam görünümü tarayıcıdakine yakın ama birebir değildir; pürüzlü yüzeylerde küp dikişleri görülebilir.
- `requestAnimationFrame` bir kuyrukla taklit edilir; zamanlayıcıya bağlı davranışlar (ör. ortam yeniden kurma debounce'u) gecikebilir.
- DOM büyük ölçüde stub'lanmıştır. UI etkileşimlerini değil render sonucunu test eder.
- Uygulama `/* ---------- init ---------- */` işaretine kanca atılarak yüklenir. Kod modüllere ayrılınca düzeneğin giriş noktası güncellenmeli.
