# Yol haritası

Öncelik sırası, gerçekçilik ve iş akışı hızı birlikte düşünülerek verildi. Her maddeden sonra render düzeneğiyle görsel doğrulama yap.

_Son güncelleme: 24 Ekim 2026._

## Mevcut durum

Stüdyo uçtan uca kullanılabilir durumda: boş belgeyle açılır (ya da son çalışmayı geri yükler), artboard'lar ve şablonlar eklenir, cihazlar yerleştirilip ışıklandırılır, ekran görüntüsü yüklenir ya da bir web sitesi yakalanır, PNG/JPG (3840 px'e kadar), ZIP ya da MP4 olarak dışa aktarılır.

- **Render:** three r186, PCSS gölgeler, ilerlemeli raster ("Hızlı", varsayılan) ve yol izleme ("Fotoğraf": 64 örnek / 30 sn, karolu örnekleme, kendi OIDN karolamamız, albedo + normal yardımcı girdileri, Neutral ton eşleme, kalibre edilmiş gölge yakalayıcı zemin, stüdyo HDRI'ı).
- **Editör:** Figma benzeri kabuk, sonsuz tuval, çoklu artboard, katman ağacı, gizmo, serbest dönüştürme kutusu, görünüm küpü, geri al/yinele, proje dosyası (sistem kaydet/aç pencereleri) + IndexedDB otomatik kayıt.
- **İçerik:** 7 cihaz tipi, 20 şablon, 2B öğeler ve varlık kütüphanesi, arka plan (şeffaf / düz / gradyan / görsel), web sitesi yakalama ve etkileşimli ekran kaydı (yalnızca dev sunucusunda).
- **Animasyon:** Tasarla / Canlandır modları, zaman çizelgesi, anahtar kareler, hazır hareketler, MP4 dışa aktarım.
- **Hesaplar (hesaplı yapı):** giriş sayfası, Figma benzeri ana sayfa (projeler, şablonlar, çöp kutusu), bulut projeleri (Supabase + Cloudflare R2, Worker), sayfa adresleri; yerel Supabase ile testli (`npm run accounts:test`, `tools/accounts/test-*.mjs`). Üretim hesapları henüz açılmadı (`docs/uyelik.md`, `docs/lansman.md`).
- **Pazarlama:** `landing/` geçici açılış sayfası (gizlilik notu taslağı, og görseli, telefon ölçüm sayfası); görselleri stüdyonun kendisiyle üretiliyor.
- Açık dal / bekleyen iş yok; `main` temiz ve GitHub'a gönderilmiş.

## Sıradaki yol (14 Ekim 2026 kararı)

Yayından önce ürünün içerik eksikleri kapanır; yayın ve ürünleştirme (barındırma, hesap/ödeme, karşılama akışı, lisans sayfası) **en sona** kalır. Yakalama servisi altyapı kararı da en sonda verilir.

1. [x] **Metin katmanı** (14 Ekim): yeni bir 2B öğe türü (`kind: 'text'`). Metin kendi tuvaline çizilir, öğenin görseli o tuvaldir; seçim kutusu, yapışma, önde/arkada, dışa aktarım ve küçük resimler değişmeden çalışır. Yazı tipi (seçilmiş Google Fonts listesi + kendi fontunu yükleme, belgeye gömülü), kalınlık, boyut, renk/gradyan, hizalama, satır/harf aralığı, kutu genişliği (satır kaydırma), gölge; tuvalde çift tıklayıp yerinde düzenleme; dışa aktarım boyutunda yeniden çizim (keskin). İlk aşamada 2B (3B metin sonra).
2. [x] **2B öğe animasyonu + metin efektleri** (14 Ekim): öğelere iz (konum, ölçek, dönüş, opaklık; `animate.js` kayıt mantığı aynı); metin hazır efektleri: solarak/alttan/kayarak giriş, ölçekle belirme, daktilo, kelime/harf bazlı kademeli giriş, vurgu (altı çizilen kelime), sayaç.
3. [x] **Çoklu seçim + sağ tık menüsü** (14 Ekim): Shift/⌘ + tıklama, ⌘A, grup taşıma, hizala/dağıt, kopyala/kes/yapıştır (artboard'lar arası), ⌘D, sağ tık menüsü.
4. [x] **Mağaza görseli üretici** (14 Ekim; yerelleştirme hariç): App Store (6,9", 6,5", iPad 13") ve Play Store (telefon, tablet, öne çıkan görsel) ölçüleri; tek seferde 5–8 artboard'luk "mağaza seti" (ortak fon, yazı tipi, renk; başlık + cihaz + ekran); **panorama modu** (fon ve cihazlar artboard sınırlarını aşarak akar). Yerelleştirme (dil başına metin varyantı, toplu ZIP) bundan sonra.
4b. [x] **Çerçeveler ve auto layout** (14 Ekim, Figma mantığı): metin ve görseller çerçevelere girer; yön, aralık, iç boşluk, 3×3 hizalama, eşit aralık, esnet; Sabit / Sar / Doldur / % boyutlar; X, Y, W, H sayısal alanları; sürükleyerek sıralama, çerçeveye bırakma, ⌥⌘G / ⇧A / ⇧⌘G. [x] Mağaza setinde başlık + alt başlık auto layout çerçevesinde. [ ] Sonra: kenar kısıtları (constraints), sarma (wrap), min/maks boyut, çerçeve gölgesi ve kenarlığı. [x] İçeriğe saran çerçeve büyürken üst kenar sabit (anc).
4c. [x] **Uzay ortamı** (14 Ekim): artboard ayarında Stüdyo / Uzay; Uzay'da zemin yok, sahne iz topuyla her yöne döner, isteğe bağlı "Işık sahneyle döner"; "Serbest takla" ve "Yörünge turu" hazır hareketleri.
4d. [x] **Sağ panel sadeleşti** (14 Ekim): katlanan bölümler ve özet satırları, kaydırıcılar yerine değer alanları, hazırlar menüde, boyut tek listede, seyrek ayarlar "Ayrıntılar" altında, cihazda Ekran üstte.
5. [x] **Şablonlar** (18 Ekim): 12 şablon × açık/koyu (açılış, mağaza seti, sosyal, video; metinli, hareketli), Şablonlar sekmesinde galeri, karşılama kartı önerileri şablonlardan, kendi şablonun (tarayıcıda). [x] Kartlarda hareket önizlemesi, vurgu rengi, Google Play mağaza setleri, kendi şablonunu yeniden adlandırma ve dışa/içe aktarma, `?template=` (18 Ekim).

## Strateji

**Konumlandırma:** "Tarayıcıdaki ürün fotoğraf stüdyosu." Hedef kitle önce SaaS ve web ürünü pazarlamacıları. Vaat: _siteni ver, açılış sayfan, mağaza görsellerin ve tanıtım videon fotoğraf kalitesinde hazır olsun ve güncel kalsın._

**Rakipler ve boşluk** (genel bilgiye dayanır; fiyat ve özellikler ayrıca doğrulanmadı):

| Rakip | Güçlü | Zayıf |
|---|---|---|
| Shots.so, Mockuuups | hızlı, çok şablon | 2B / sahte 3B, sığ ışık-gölge |
| Rotato | gerçek 3B, animasyon | yalnızca Mac, web yakalama ve ekip yok |
| Previewed, Artboard Studio | web'de 3B, şablon | oyun motoru kalitesi |
| Placeit, Smartmockups (Canva) | fotoğraf tabanlı gerçek ortam | açı ve ışık sabit |
| AppLaunchpad, screenshots.pro | mağaza görseli | düşük görsel kalite, 3B yok |

Bizi ayıran: tarayıcıda yol izleme + gerçek ışık kurulumu + URL'den otomatik yakalama + animasyon bir arada.

**Farklılaştırıcılar (öncelik sırası):**

1. [ ] **Yaşayan mockup:** URL ver, telefon/tablet/dizüstü yakalanıp seçili şablonlara yerleşsin, tüm varlıklar tek seferde çıksın. Site değişince yeniden üretim (API, GitHub Action: "her sürümde açılış görsellerini güncelle"). Ön koşul: üretimde yakalama servisi.
2. [x] **Mağaza görseli üretici + yerelleştirme:** metin katmanı, marka yazı tipleri, App Store / Play Store ölçüleri, dil başına toplu çıktı (18 Ekim: belge dilleri, çeviri tablosu CSV, metin panelinde çeviriler, "Tüm diller (ZIP)"). [ ] Sonra: dile göre yazı tipi (CJK, Arapça), sağdan sola hizalama, dil başına ekran görüntüsü.
3. [ ] **Gömülebilir etkileşimli 3B mockup:** açılış sayfasına PNG yerine döndürülebilen, kaydırılabilen hafif bir web bileşeni. [x] Aşama 1 başladı (17 Ekim, `feat/embed`): stüdyonun çekirdeğiyle çizen oynatıcı (iframe), `<mockup-view>` yükleyici, fare / sürükle / kaydırma / döngü / sabit, poster, Dışa aktar → "Web'e göm" ZIP + gömme kodu. [x] Oynatıcıda 2B öğeler (metin efektleri ve öğe izleriyle) ve ekran videoları (17 Ekim). [ ] Sonra: mobil GPU ölçümü, model yükleyicilerini isteğe bağlı yükleme, zaman çizelgesinde "sürücü" seçimi (hangi iz neyle oynar). [x] Sürücüler birleşir (18 Ekim): `mouse+scroll`, `mouse+loop` (Web'e göm menüsünde). [ ] Aşama 2: barındırılan gömme (proje kimliği, CDN, Yayınla, filigran / limitler; hesap ve ödemeyle birlikte).
4. [ ] **Yapay zekâ ile sahne:** 3B cihazı yapay zekâyla üretilmiş ortama ışığı ve gölgesi tutarlı oturtma (ortamdan HDRI / ışık yönü tahmini → yol izleyici); referans fotoğrafın ışığını taklit; istemden kompozisyon önerisi.
5. [ ] **Ekranda video:** [x] v1 (17 Ekim): cihaz ekranında MP4/WebM, sessiz; Canlandır'da imleçle senkron, Tasarla'da poster karesi; video dışa aktarımında kare kare; otomatik kayıt ve `.mockup.zip`. [x] **Etkileşimli ekran kaydı** (17 Ekim): site stüdyonun içindeki lightbox'ta canlı (dev sunucusunun Chrome'u, kalıcı profil, CDP screencast), kullanıcı gezer / giriş yapar / doğrulamayı geçer, Başlat–Durdur ile en çok 30 sn kayıt MP4 olarak cihaz ekranlarına gömülür; otomatik kaydırma; "Ayrı pencerede aç" yedeği. [x] İmleç görünümü ve 2 dk'ya kadar kayıt (18 Ekim; kayıt sırasında canlı kodlama). [ ] Sonra: kaydı yayınlanmış sürümde de sunmak (yakalama servisiyle birlikte), kayıtta ses (v2). [x] 9:16 ve 1:1 sosyal formatlar (artboard oranı; şablonlarda Story, Süzülen başlık, Döner tabla). [x] WebM (VP9) ve GIF çıktı (18 Ekim; GIF en çok 720 px / 15 fps, şeffaf artboard'da saydam; WebM saydamlığı tarayıcı `alpha:'keep'` kodlayınca, Chrome'da henüz yok). [x] Fotoğraf kalitesinde video (18 Ekim; kare başına yol izleme 12 örnek + OIDN, 1080 px'te ≈ 5,5 sn). [x] **Video dışa aktarımında ekran videosu kareleri WebCodecs ile** (24 Ekim; `devices/video-decode.js`: mediabunny demux + `VideoDecoder`, seek yolu yedek, `window.__noWebCodecs=true` ile denenir; kare alma 32–39 ms → ≈ 10,5 ms, 10 sn / 30 fps / 1080 px dışa aktarım MP4 11,1 → 9,5 sn, WebM 13,4 → 9,4 sn (gerisi render); MP4'te seek yolunun her üçüncü karede bir kare geride kalması da bitti, çözücü 300/300 doğru karede; `node tools/video/test-decode.mjs`). [ ] Sonra: kareler arasında kurulumu paylaşan yol izleme oturumu (hazırlık 0,7 sn/kare), hareket bulanıklığı, ses, artboard'lar arası kamera geçişleri.
6. [ ] **Gerçekçilikte son mil:** ~~alan derinliği~~ (bitti), yansıtıcı/dokulu zemin, jenerik 3B eller (telefonu tutan el), dekor nesneleri, ~~GLB içe aktarma~~ (bitti, 17 Ekim).
7. [ ] **Ekip ve bulut:** [x] bulut proje (18–19 Ekim: hesaplar, giriş sayfası, ana sayfa, Projelerim, çakışma penceresi, adresler). [x] Verini indir / hesabı sil (24 Ekim; hesap menüsü, `docs/uyelik.md` 5. adımın stüdyo tarafı). [ ] Sonra: otomatik eşitleme ve çevrimdışı kuyruk (4. adım), gecelik temizlik (5. adım), paylaşım linki, yorumlar, ekip kütüphanesi (marka kiti, ortak şablonlar); ücretli ekip planının dayanağı.

İlk sırada 1, 2 ve 5 gelir (gelir getiren iş akışı); 3 ve 4 vitrin özellikleri.

**Önce kapatılması gerekenler:**

- [ ] Üretimde yakalama servisi (1 ve 2 buna bağlı).
- [x] Düşük donanımda akıcı canlı görüntü (18 Ekim): hareket sırasında uyarlamalı çözünürlük (`accumulation.js`), SwiftShader'da yörünge 2 kat hızlı. [ ] Uzun fotoğraf render'ı için bulutta render seçeneği (v2).
- [x] İlk 60 saniye: boş tuval yerine "URL ver → hazır görsel" karşılama akışı (17 Ekim, `ui/welcome.js`, tasarım `wireframes/onboarding.html`): adres ya da ekran görüntüsü/video → 4 önerilen sahne (gerçek artboard, küçük resimli) → seçilenler artboard olur, tek geri al adımı; amaç çipleri (açılış görseli, sosyal 1:1 + 9:16, tanıtım videosu, mağaza seti formu); bir kez "Dışa aktar" ipucu. [ ] Sonra: son çalışmalar listesi (otomatik kayıt şu an tek belge), önerilerde şablon setinden sahneler, yayınlanmış sürümde adres yolu (yakalama servisi).
- [x] Jenerik cihaz algısı: "Neden iPhone gibi değil?" sorusuna GLB içe aktarma ve "Kendi çerçeven" ile net cevap (GLB içe aktarma 17 Ekim'de eklendi; ekran malzemesini işaretleme sonra).

## Son eklenenler (9–17 Ekim 2026)

- [x] **GLB içe aktarma** (17 Ekim): `devices/model.js`; kendi 3B modelin (GLB/glTF, Draco/meshopt/KTX2) sahneye cihaz gibi girer: Varlıklar sekmesinde karo (render küçük resmi), tıkla ya da artboarda sürükle (zemine, işaret edilen yere), cihaz menüsünde "3B model (GLB)…"; panelde Boyut (cm), "Gerçek ölçü", "Modeli değiştir…"; proje dosyası `.mockup.zip` (`media/<anahtar>.glb`), otomatik kayıt, geri al, kopyala/yapıştır; yol izleyicide dosyanın malzemeleriyle.
- [x] **Ekranda video v1** (17 Ekim): Ekran bölümüne MP4/WebM bırakılır (`devices/video.js`); Başlangıç (kırpma) ve Döngü; Canlandır'da imleç ve oynatma videoyla senkron, Tasarla ve durağan görsel poster karesi; video dışa aktarımı her karede `seeked` bekler (24 Ekim'den beri WebCodecs çözücüsü, seek yedek); otomatik kayıtta blob, proje dosyası videoluyken `.mockup.zip`; yüklemede Canlandır süresi videodan, Tasarla için "Gösterilen an" (poster saniyesi) ve "İmleçteki kare". Sessiz; ses ve Fotoğraf kalitesinde video v2'ye kaldı.

- [x] **Ekranda titreyen karo deseni düzeltildi** (17 Ekim): uzun objektif + düşük Yakınlık'ta ekran ile ön cam derinlikte yarışıyordu (GPU karosu biçiminde koyu bloklar). Yakın düzlem mesafenin %6'sı, ekran katmanlarına `polygonOffset`.
- [x] **Kamera ve ışık animasyonu** (17 Ekim): Canlandır'da kamera (açılar, Yakınlık, objektif, kayma) ve ışıklar (yön, yükseklik, uzaklık, yoğunluk, boyut, huzme) cihazlar gibi anahtar kare alır; zaman çizelgesinde Kamera ve ışık satırları, panellerde ◆ ve "Anahtar kare", kamera ve ışık hazır hareketleri; videoda kamera/ışık hareketine bulanıklık, ışık hareketinde yansımalar kare kare.
- [x] Yol izleme: kalibre edilmiş gölge yakalayıcı zemin diski, parlak stüdyo ortamı, fon duvarı kaldırıldı; fon rengi birebir.
- [x] Yol izleme hız/kalite: 4096 px dokular, Neutral ton eşleme, sakin ekran camı, karolu örnekleme ve OIDN (3840×4800 ≈ 25 sn, eskiden 116 sn), bantlı aux geçişleri; dışa aktarımda keskin ekranlar (`crispScreens`).
- [x] Dışa aktarım varsayılanı 3840 px; canlı görüntü dışa aktarımdan keskinse uyarı.
- [x] Yakalama: ekran görüntüsü cihazın ekran dokusuna göre ölçeklenir (yüksek `dpr`); dev sunucusu yoksa açık hata mesajı.
- [x] "Projeyi kapat": kaydedilmemiş değişiklik varsa Kaydet / Kaydetme / Vazgeç.
- [x] Kaydet / Farklı kaydet (⇧⌘S) sistem pencereleriyle; üst barda dosya adı.
- [x] Artboard yeniden adlandırma (tuval, ağaç, menü, F2); son cihaz ve son artboard silinebilir; boş başlangıç (varsayılan sahne yanıp sönmez).
- [x] Artboard'lar tuvalde en yüksek dışa aktarım boyutunda durur.
- [x] Gradyan: açılı doğrusal ya da dairesel.
- [x] Yeni cihaz artboard'un ortasına, diğerlerinin önüne ve her zaman görünür yere gelir.
- [x] Aralıklar: Yakınlık 10×'e kadar (logaritmik, 1,2 yarıçaptan sonra uzun lens), ölçek 0,1–10× (logaritmik), konumda ±60 cm sınırı kalktı.
- [x] **Animasyon:** Canlandır modu, zaman çizelgesi, MP4 video (WebCodecs, 180° hareket bulanıklığı); Tasarla'da cihaz başına tasarım karesi.
- [x] **2B öğeler ve varlık kütüphanesi;** arka plan görseli (kapla/sığdır, ölçek, kaydırma, kaldır) desenlerin yerini aldı.
- [x] Kaydırıcı stili (kalın yuvarlak iz, vurgu dolgusu, gölgeli tutamak).
- [x] Keskin canlı görüntü (ekranın gerçek piksel yoğunluğu), tam çözünürlüklü küçük resimler, 4096 px ekran dokuları.
- [x] Dizüstü klavye çukuru gövde rengini izler, tuşlar koyu kalır.
- [x] Görünüm küpü (eksen göstergesinin yerine), serbest dönüştürme kutusu (T), sürükleme davranışı (cihaz sürükle = taşı, boş alan = yörünge).
- [x] Landing: Midas tarzı örnek SaaS açılış sayfası, görseller stüdyoyla render edildi.
- [x] Dışa aktarım: küçük boyutlarda keskin ekranlar (`CRISP_MAX` 16); boyut artık **genişlik** (1080 / 1920 / 3840 px, uzun kenar en çok 3840) (13 Ekim).

## 1. Temel

- [x] **Yerel indirme:** `<a download>` tabanlı indirme; ZIP toplu indirme de aynı yoldan.
- [x] **Modüllere ayırma:** Vite + ES modülleri, ESLint, Playwright tabanlı render düzeneği.
- [x] **three.js yükseltmesi (r128 → r186):** renk yönetimi (`lin()`), `LIGHT_SCALE`, `decay = 0`, `BasicShadowMap` üzerinde PCSS (nokta ışıkta küp harita), MSAA hedefi.

## 2. Gerçekçilik

- [x] **Yol izleme (Fotoğraf kalitesi):** three-gpu-pathtracer, OIDN (kendi karolamamız, albedo + normal), zaman bütçesi, ilerleme göstergesi, gölge yakalayıcı zemin, stüdyo HDRI'ı.
- [x] **Canlı fotoğraf önizlemesi:** isteğe bağlı anahtar; kamera 700 ms durunca yol izlemeye geçer.
- [x] **Telefon, tablet, monitör:** eloksal kasa, 2.5D ön cam, temas gölgesi, cam arka (mat/parlak), eş merkezli köşeler; monitörde yeni arka gövde, ayak ve taban.
- [x] **Zemin kalibrasyonu kararlı** (15 Ekim): `calibrateFloor` sabit tohumla (`stableNoise`) 64 örnek alır, ana render da sabit tohumla; `ensurePT` paketin rastgelelik kaynaklarını (mavi gürültü ofsetleri, örnekleyici sıfırlaması, uuid sırası) sabitler. Ölçek çalıştırmalar arasında ≈ %2–3, zemin ±1 seviye; telefon ve dizüstü sabit örnek sayısında bayt bayt aynı.
- [x] **Zeminde ince dalgalı çizgiler (raster PCSS)** (18 Ekim, `dfd78bf`): zemin gölgesinin yarı gölgesindeki sabit moiré; PCSS çekirdek döndürmeleri piksel başına eşit dağıtıldı (`render/pcss.js`), stüdyo, dışa aktarım ve gömmede.
- [x] **Şeffaf arka planda zemin gölgesi** (yol izleme, 18 Ekim): gri yakalayıcı disk, render sonrası gölge alfaya çevrilir.
- [ ] **Alan ışıkları (raster)** (v2): `RectAreaLight` ile softbox/strip/pencere; parlak yüzeylerde doğru şekilli vurgu.
- [ ] Ekranın gövdeye yansıyan ışığı (`SCREEN_GLOW`) ve ortam kalibrasyonu: farklı sahnelerle ince ayar (v2).
- [x] Ekran camı yansımasına kullanıcı ayarı (yoğunluk %0–150, 18 Ekim). [ ] Sıyırma açısında ekranı soldurmasın (v2).
- [x] **Alan derinliği (bokeh)** ve odak noktası seçimi: objektif hazırları (24–200 mm), mm alanı, Bokeh anahtarı (diyafram, odak: cihaz ya da sahneden nokta, diyafram şekli, arka planı bulanıklaştır); Hızlı ve Fotoğraf kalitesinde, videoda.
- [x] **Kameraya bağlı odak kipleri** (17 Ekim): Odak segmenti Hedef / Kadraj noktası (tuvalde sürüklenen artı; altındaki cihaz netleşir, kamera animasyonunda öne gelen netleşir, kare üretmez) / Uzaklık (`scene.focusDist`, m olarak; "Buna odakla" ile odak çekme anahtar kareleri); diyafram da kameranın animasyonlanabilir alanı. Odak etiketi tuvalde. [ ] Sonra: kadraj kipinde boş alanda yumuşak geçiş (şu an en yakın cihaza atlıyor), odak çekme için hazır hareket çipi, Kayıtlı açılarda diyafram/odak.
- [ ] **Yansıtıcı / dokulu zemin** (v2): parlak masa, mermer, ahşap, beton; raster'da ayna geçişi + lisanslı/prosedürel dokular.
- [x] **GLB içe aktarma** (17 Ekim): Varlıklar sekmesine ya da cihaz menüsünden `.glb` yüklenir, cihaz gibi yerleşir (gizmo, kaydırıcılar, katman ağacı, Zemine oturt, Odakla, animasyon izleri), Boyut (cm) + "Gerçek ölçü", malzemeler dosyadan, Hızlı ve Fotoğraf kalitesinde; `.mockup.zip` içinde saklanır. [ ] Sonra: ekran malzemesini işaretleme (GLB'deki bir yüzeye ekran görüntüsü), modelden gölge/temas ayarı, büyük dosyalarda ilerleme göstergesi.
- [ ] Cihaz detayları devamı (v2): jenerik kamera lensleri, monitör ayağı formu.
- [ ] Blender modelleri (`tools/blender/phone.py`, deneysel): yalnızca yakın çekim kazancı görülürse.
- [ ] WebGPU yol izleyici (`WebGPUPathTracer`) denemesi.

## 3. İş akışı

- [x] **Editör arayüzü:** Figma benzeri düzen, Solar ikonları, açık/koyu tema.
- [x] **Çoklu artboard:** sürükleme + yapışma, yeniden adlandırma, şablon = yeni artboard, ZIP indirme, sonuncusu dahil silme.
- [x] **Proje kaydet/aç:** tek dosya (görseller gömülü), sistem pencereleri, Farklı kaydet, Projeyi kapat; IndexedDB otomatik kayıt.
- [x] **Geri al / yinele** (belge düzeyinde).
- [x] **Hizalama:** gizmo'da Shift adımları, "Zemine oturt", "Eşit dağıt", katman sırası.
- [x] **2B öğeler + varlık kütüphanesi** (logo, rozet, metin görseli; önde/arkada).
- [x] **Video:** Canlandır modu, hazır hareketler (aşağıdan yüksel, döner tabla, süzülme, kapağı aç, ekranı kaydır), MP4.

**Sıradaki öncelik:** yukarıdaki "Sıradaki yol" bölümüne bak.

- [x] **Çoklu seçim:** Shift/⌘ ile cihaz ve 2B öğe seçip birlikte taşıma, silme, çoğaltma, kopyalama. (Grubu birlikte döndürme / ölçekleme ve sürükleyerek kutu seçimi henüz yok.)
- [x] **Sağ tık bağlam menüsü:** kopyala, yapıştır, çoğalt, sil, katman sırası, odakla, metni düzenle. (Katman ağacında sağ tık henüz yok.)
- [x] Artboard'lar arası cihaz ve öğe kopyalama (⌘C → başka artboard → ⌘V). [x] Artboard çoğaltırken yerleşim seçimi (yanına / altına, 18 Ekim).
- [x] **Metin katmanı** (14 Ekim): bkz. "Sıradaki yol" 1.
- [x] **Mağaza görseli üretici** (14 Ekim; yerelleştirme hariç): bkz. "Sıradaki yol" 4.
- [x] **Toplu ekran görüntüsü:** aynı sahneye N görsel ver, N çıktı al (ZIP) (18 Ekim).
- [x] Video: WebM/GIF seçeneği ve fotoğraf kalitesi (18 Ekim). Ses yok.
- [x] Mobil düzen: 820 px altında paneller çekmece, tuval tam genişlik (18 Ekim).
- [x] Web sitesinden ekran görüntüsü canlı pencereden (24 Ekim): Ekran bölümünde tek düğme "Siteyi aç…" siteyi ekran kaydı penceresinde açar; gez, giriş yap, bannerları kapat, sonra Görünen / Tam sayfa görüntüyü al (her cihaz kendi genişliğinde, yakalama keskinliğinde).
- [x] Dışa aktar menüsü ve Ekran bölümü yerleşim düzeltmeleri (24 Ekim): taşan seçim kutuları ve düğmeler, kaydırma düğmesi.
- [x] Sunum kipi (24 Ekim): ▶ ile etkin artboard tam ekranda (Figma'nın Present'i), ok tuşlarıyla artboard'lar arasında, animasyonlu artboard döngüde oynar, Esc çıkar.

## Şablonlar

- [x] 21:9 oran, "Sade ekran" cihazı. (İlk 20 şablon ve galeri sayfası 14 Ekim'de kaldırıldı; tasarım dili stüdyoya uymuyordu. Yeni şablon seti gelecek.)
- [x] **Yeni şablon seti** (stüdyonun kendi tasarım diliyle) ve galeri (18 Ekim).
- [x] Kullanıcının kendi sahnesini şablon olarak kaydetmesi (18 Ekim; tarayıcıda saklanır).
- [x] Şablon kartlarında örnek ekran görüntüleri (18 Ekim).
- [x] Animasyonlu şablonlar (hazır hareketli; 18 Ekim: Yaklaşarak giriş, Süzülen başlık, Döner tabla).

## Web sitesi yakalama

- [x] Uzun ekran görüntüsü kaydırma (kaydırıcı, tekerlek, tümünü eşitle) ve kaydırma videosu ("Ekranı kaydır" hareketi).
- [x] URL ile cihaz başına / tüm cihazlara yakalama; cihaz başına görüntü alanı ve `dpr`.
- [x] **Yayınlanmış sürüm için yakalama servisi** (18 Ekim, kod hazır): `services/capture/` (Cloud Run konteyneri, SSRF koruması, CORS, günlük sınır), stüdyo `VITE_CAPTURE_URL` ile bağlanır. [ ] Kurulum: hesaplar ve `docs/lansman.md` adımları (kullanıcıda). [ ] Sonra: Turnstile, ortak sınır deposu, ağ katmanında çıkış filtresi (DNS rebinding).
- [x] Yakalama seçenekleri: bekleme süresi, belirli bir bölümden (CSS seçici) başlama, koyu tema (`prefers-color-scheme`) (18 Ekim).

## Yayın ve tanıtım

- [x] Örnek açılış sayfası (`landing/`), görsel üretim betikleri (`tools/landing/`). [x] Hero videosu ürünün video dışa aktarımıyla (`tools/landing/video.mjs`), fiyat bölümü ücretsiz beta (18 Ekim). [x] Yayın derlemesi `npm run build:site` (açılış kökte, stüdyo `/studio/`, Cloudflare Pages başlıkları). [x] Lansman kontrol listesinin bizdeki yarısı (24 Ekim): og görseli ve paylaşım etiketleri (`SITE_URL`), gizlilik notu taslağı (`landing/gizlilik.html`), geri bildirim bağlantısı, telefon ölçüm sayfası (`landing/olcum.html`). [ ] Sende: hukuki inceleme, adresin kesinleşmesi, telefonda ölçüm (`docs/lansman.md` §4).
- [ ] Yayınlama: barındırma, alan adı, yakalama servisiyle birlikte dağıtım.
- [ ] Açılış sayfasına kısa ürün videosu (stüdyonun kendi MP4 çıktısıyla).

## Bilinen sorunlar

- Fırçalanmış metal ve dizüstü hoparlör ızgarası uzak mesafede hafif hare (moiré) oluşturabiliyor.
- Yol izlemede zemin kalibrasyonu çalıştırmadan çalıştırmaya ±10 seviye oynuyor (bkz. Gerçekçilik).
- Yol izlemede zemin cihazdan uzaklaştıkça fondan %2–5 koyu kalabiliyor (yumuşak vinyet).
- Çok geniş açılı spotlarda gölge haritası çözünürlüğü düşüyor (gölge kamerası fov = 2 × açı).
- Işık küreleri bazı sahnelerde kadraja giriyor; asıl kontrol ışık haritası.
- Küçük ekranlarda ışık haritası ve görünüm küpü sahnenin köşelerini örtüyor; daraltılabilir olmalı.
- 3840 px dışa aktarım mobil tarayıcılarda bellek sınırına takılabilir.
- Spot/nokta ışıkta mesafeyle zayıflama yok (`decay = 0`, r128 davranışı); fiziksel `decay = 2` preset'lerin yeniden ayarlanmasını gerektirir.
