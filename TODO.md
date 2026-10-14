# Yol haritası

Öncelik sırası, gerçekçilik ve iş akışı hızı birlikte düşünülerek verildi. Her maddeden sonra render düzeneğiyle görsel doğrulama yap.

_Son güncelleme: 14 Ekim 2026 (`main` @ `bf48e52`)._

## Mevcut durum

Stüdyo uçtan uca kullanılabilir durumda: boş belgeyle açılır (ya da son çalışmayı geri yükler), artboard'lar ve şablonlar eklenir, cihazlar yerleştirilip ışıklandırılır, ekran görüntüsü yüklenir ya da bir web sitesi yakalanır, PNG/JPG (3840 px'e kadar), ZIP ya da MP4 olarak dışa aktarılır.

- **Render:** three r186, PCSS gölgeler, ilerlemeli raster ("Hızlı", varsayılan) ve yol izleme ("Fotoğraf": 64 örnek / 30 sn, karolu örnekleme, kendi OIDN karolamamız, albedo + normal yardımcı girdileri, Neutral ton eşleme, kalibre edilmiş gölge yakalayıcı zemin, stüdyo HDRI'ı).
- **Editör:** Figma benzeri kabuk, sonsuz tuval, çoklu artboard, katman ağacı, gizmo, serbest dönüştürme kutusu, görünüm küpü, geri al/yinele, proje dosyası (sistem kaydet/aç pencereleri) + IndexedDB otomatik kayıt.
- **İçerik:** 7 cihaz tipi, 20 şablon, 2B öğeler ve varlık kütüphanesi, arka plan (şeffaf / düz / gradyan / görsel), web sitesi yakalama (yalnızca dev sunucusunda).
- **Animasyon:** Tasarla / Canlandır modları, zaman çizelgesi, anahtar kareler, hazır hareketler, MP4 dışa aktarım.
- **Pazarlama:** `landing/` örnek SaaS açılış sayfası; görselleri stüdyonun kendisiyle üretiliyor.
- Açık dal / bekleyen iş yok; `main` temiz ve GitHub'a gönderilmiş.

## Sıradaki yol (14 Ekim 2026 kararı)

Yayından önce ürünün içerik eksikleri kapanır; yayın ve ürünleştirme (barındırma, hesap/ödeme, karşılama akışı, lisans sayfası) **en sona** kalır. Yakalama servisi altyapı kararı da en sonda verilir.

1. [x] **Metin katmanı** (14 Ekim): yeni bir 2B öğe türü (`kind: 'text'`). Metin kendi tuvaline çizilir, öğenin görseli o tuvaldir; seçim kutusu, yapışma, önde/arkada, dışa aktarım ve küçük resimler değişmeden çalışır. Yazı tipi (seçilmiş Google Fonts listesi + kendi fontunu yükleme, belgeye gömülü), kalınlık, boyut, renk/gradyan, hizalama, satır/harf aralığı, kutu genişliği (satır kaydırma), gölge; tuvalde çift tıklayıp yerinde düzenleme; dışa aktarım boyutunda yeniden çizim (keskin). İlk aşamada 2B (3B metin sonra).
2. [x] **2B öğe animasyonu + metin efektleri** (14 Ekim): öğelere iz (konum, ölçek, dönüş, opaklık; `animate.js` kayıt mantığı aynı); metin hazır efektleri: solarak/alttan/kayarak giriş, ölçekle belirme, daktilo, kelime/harf bazlı kademeli giriş, vurgu (altı çizilen kelime), sayaç.
3. [x] **Çoklu seçim + sağ tık menüsü** (14 Ekim): Shift/⌘ + tıklama, ⌘A, grup taşıma, hizala/dağıt, kopyala/kes/yapıştır (artboard'lar arası), ⌘D, sağ tık menüsü.
4. [ ] **Mağaza görseli üretici:** App Store (6,9", 6,5", iPad 13") ve Play Store (telefon, tablet, öne çıkan görsel) ölçüleri; tek seferde 5–8 artboard'luk "mağaza seti" (ortak fon, yazı tipi, renk; başlık + cihaz + ekran); **panorama modu** (fon ve cihazlar artboard sınırlarını aşarak akar). Yerelleştirme (dil başına metin varyantı, toplu ZIP) bundan sonra.
5. [ ] **Şablonlar:** metinli ve mağaza seti şablonları, animasyonlu şablonlar, kendi sahneni şablon olarak kaydetme, kartlarda gerçek örnek ekranlar.

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
2. [ ] **Mağaza görseli üretici + yerelleştirme:** metin katmanı, marka yazı tipleri, App Store / Play Store ölçüleri, dil başına toplu çıktı (10 dil × 8 ekran = 80 görsel tek seferde).
3. [ ] **Gömülebilir etkileşimli 3B mockup:** açılış sayfasına PNG yerine döndürülebilen, kaydırılabilen hafif bir web bileşeni.
4. [ ] **Yapay zekâ ile sahne:** 3B cihazı yapay zekâyla üretilmiş ortama ışığı ve gölgesi tutarlı oturtma (ortamdan HDRI / ışık yönü tahmini → yol izleyici); referans fotoğrafın ışığını taklit; istemden kompozisyon önerisi.
5. [ ] **Ekranda video:** cihaz ekranında MP4 ekran kaydı; 9:16 ve 1:1 sosyal formatlar; artboard'lar arası kamera geçişleri; WebM/GIF.
6. [ ] **Gerçekçilikte son mil:** alan derinliği, yansıtıcı/dokulu zemin, jenerik 3B eller (telefonu tutan el), dekor nesneleri, GLB içe aktarma.
7. [ ] **Ekip ve bulut:** bulut proje, paylaşım linki, yorumlar, ekip kütüphanesi (marka kiti, ortak şablonlar); ücretli ekip planının dayanağı.

İlk sırada 1, 2 ve 5 gelir (gelir getiren iş akışı); 3 ve 4 vitrin özellikleri.

**Önce kapatılması gerekenler:**

- [ ] Üretimde yakalama servisi (1 ve 2 buna bağlı).
- [ ] Düşük donanımda akıcı canlı görüntü; uzun fotoğraf render'ı için bulutta render seçeneği.
- [ ] İlk 60 saniye: boş tuval yerine "URL ver → hazır görsel" karşılama akışı.
- [ ] Jenerik cihaz algısı: "Neden iPhone gibi değil?" sorusuna GLB içe aktarma ve "Kendi çerçeven" ile net cevap.

## Son eklenenler (9–13 Ekim 2026)

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
- [ ] **Şeffaf arka planda zemin gölgesi** (yol izleme): şu an gölge yalnızca düz/gradyan fonda var; iki geçişli gölge yakalayıcı ya da gölgeyi alfa olarak çıkarma.
- [ ] **Alan ışıkları (raster):** `RectAreaLight` ile softbox/strip/pencere; parlak yüzeylerde doğru şekilli vurgu.
- [ ] Ekranın gövdeye yansıyan ışığı (`SCREEN_GLOW`) ve ortam kalibrasyonu: farklı sahnelerle ince ayar.
- [ ] Ekran camı yansımasına kullanıcı ayarı (yoğunluk); sıyırma açısında ekranı soldurmasın.
- [ ] **Alan derinliği (bokeh)** ve odak noktası seçimi (yol izleyicide kamera açıklığı hazır).
- [ ] **Yansıtıcı / dokulu zemin:** parlak masa, mermer, ahşap, beton.
- [ ] **GLB içe aktarma:** kullanıcının kendi (lisanslı) modeli + ekran malzemesini işaretleme.
- [ ] Cihaz detayları devamı: jenerik kamera lensleri, monitör ayağı formu.
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
- [x] Artboard'lar arası cihaz ve öğe kopyalama (⌘C → başka artboard → ⌘V). [ ] Artboard çoğaltırken yerleşim seçimi.
- [ ] **Metin katmanı:** bkz. "Sıradaki yol" 1.
- [ ] **Mağaza görseli üretici:** bkz. "Sıradaki yol" 4.
- [ ] **Toplu ekran görüntüsü:** aynı sahneye N görsel ver, N çıktı al (ZIP).
- [ ] Video: WebM/GIF seçeneği, video için fotoğraf kalitesi (yavaş ama mümkün), ses yok.
- [ ] Mobil düzen: sol panel 820 px altında gizli; çekmece olarak açılmalı.

## Şablonlar

- [x] 20 hazır şablon ve Showcases sayfası (`showcases.html`), 21:9 oran, "Sade ekran" cihazı; desenli şablonlar arka plan görseline çevrildi.
- [ ] Kullanıcının kendi sahnesini şablon olarak kaydetmesi.
- [ ] Şablon kartlarında örnek ekran görüntüleri (şu an yer tutucu).
- [ ] Animasyonlu şablonlar (hazır hareketli).

## Web sitesi yakalama

- [x] Uzun ekran görüntüsü kaydırma (kaydırıcı, tekerlek, tümünü eşitle) ve kaydırma videosu ("Ekranı kaydır" hareketi).
- [x] URL ile cihaz başına / tüm cihazlara yakalama; cihaz başına görüntü alanı ve `dpr`.
- [ ] **Yayınlanmış sürüm için yakalama servisi** (altyapı kararı bekliyor; şu an yalnızca dev sunucusu).
- [ ] Yakalama seçenekleri: bekleme süresi, belirli bir bölümden (CSS seçici) başlama, koyu tema (`prefers-color-scheme`).

## Yayın ve tanıtım

- [x] Örnek açılış sayfası (`landing/`), görsel üretim betikleri (`tools/landing/`).
- [ ] Yayınlama: barındırma, alan adı, yakalama servisiyle birlikte dağıtım.
- [ ] Açılış sayfasına kısa ürün videosu (stüdyonun kendi MP4 çıktısıyla).

## Bilinen sorunlar

- Fırçalanmış metal ve dizüstü hoparlör ızgarası uzak mesafede hafif hare (moiré) oluşturabiliyor.
- Yol izlemede zemin cihazdan uzaklaştıkça fondan %2–5 koyu kalabiliyor (yumuşak vinyet).
- Çok geniş açılı spotlarda gölge haritası çözünürlüğü düşüyor (gölge kamerası fov = 2 × açı).
- Işık küreleri bazı sahnelerde kadraja giriyor; asıl kontrol ışık haritası.
- Küçük ekranlarda ışık haritası ve görünüm küpü sahnenin köşelerini örtüyor; daraltılabilir olmalı.
- 3840 px dışa aktarım mobil tarayıcılarda bellek sınırına takılabilir.
- Spot/nokta ışıkta mesafeyle zayıflama yok (`decay = 0`, r128 davranışı); fiziksel `decay = 2` preset'lerin yeniden ayarlanmasını gerektirir.
