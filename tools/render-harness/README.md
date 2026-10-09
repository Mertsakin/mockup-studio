# Headless render düzeneği

Uygulamayı (`src/main.js`) tarayıcı olmadan çalıştırıp bir PNG üretir. Amaç: her görsel değişiklikten sonra sonucu gerçekten **görmek**.

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
  node tools/render-harness/harness.js renders/out.png tools/render-harness/scenes/laptop.js
```

| Değişken | Anlamı |
|---|---|
| `W`, `H` | çıktı boyutu (px) |
| `FRAMES` | çalıştırılacak animasyon karesi. İlerlemeli render 64 örneğe ~33 karede ulaşır. Tek geçişli hızlı önizleme için `2` |
| `ACC=1` | float birikim hedeflerini zorla, böylece ilerlemeli render çalışır. Olmadan tek geçiş render alınır (gölgeler grenli) |
| `REALPMREM=1` | three'nin PMREM'ini kullan (headless-gl'de siyah çıkar, yalnızca hata ayıklama için) |
| sahneye özel | `COLOR`, `FIN`, `PRESET`, `RX`, `RY`, `ZOOM`, `C`… sahne dosyalarının başındaki açıklamalara bak |

Önce/sonra karşılaştırması:

```bash
node tools/render-harness/diff.js renders/once.png renders/sonra.png renders/fark.png
```

En büyük kanal farkını ve 2/255'ten fazla değişen piksel sayısını yazar. Fark varsa çıkış kodu 1 olur; üçüncü argüman verilirse farkı 8 kat büyütülmüş bir görüntü olarak kaydeder.

## Sahneler (`scenes/`)

- `default.js` — açılış sahnesi
- `laptop.js` — tek dizüstü
- `keyboard-closeup.js` — klavye yakın çekim (tuşlar, yazılar, ızgara, fırçalanmış yüzey)
- `phone.js` — telefon; `RY=150` arka, `RX=-70 RY=-35 ZOOM=1.5` alt kenar
- `composition.js` — hazır kompozisyonlar (`C=0..5`)
- `light-drag.js` — ışık sürükleme mantık testi (konsola değer yazar)
- `spheres.js` — malzeme/yansıma kontrolü için metal küreler

Sahne dosyası `async (app, {W, H, createCanvas, loadImage}) => {}` imzalı bir modüldür. `app('isim')`, `src/` altındaki herhangi bir modülün **dışa aktardığı** adı döndürür (ör. `app('state')`, `app('applyComp')`). Dışa aktarılmayan bir şeye sahneden erişmek gerekirse ilgili modülde `export` listesine ekle.

## Bilinen sınırlar

- **WebGL1 (headless-gl).** Tarayıcıda WebGL2 kullanılır; MSAA render hedefleri test edilmez.
- **PMREM çalışmıyor.** Düzenek ortam yansımalarını CPU'da kurulan bir küp dokuyla taklit eder. Metal/cam görünümü tarayıcıdakine yakın ama birebir değildir; pürüzlü yüzeylerde küp dikişleri görülebilir.
- `requestAnimationFrame` bir kuyrukla taklit edilir; zamanlayıcıya bağlı davranışlar (ör. ortam yeniden kurma debounce'u) gecikebilir.
- DOM büyük ölçüde stub'lanmıştır. UI etkileşimlerini değil render sonucunu test eder.
- Uygulama esbuild ile tek bir IIFE'ye paketlenip çalıştırılır. `three` importu, düzeneğin yamaladığı global `THREE`'ye yönlendirilir (renderer ve PMREM taklidi bu yüzden çalışır). `jszip` paketlenmez; dışa aktarım düzenekte test edilmez.
