# Üyelik planı: Supabase + Cloudflare R2

*18 Ekim 2026 · durum: 1., 2. ve 3. adım yerel Supabase ile bitti (§8); 0. adım (hesaplar) sende. Ödeme (Paddle) bu planın dışında.*

## 1. Hedef ve sınırlar

**Bu adımda gelenler:**
- Giriş ve çıkış.
- Bulutta projeler: liste, aç, yeniden adlandır, çoğalt, sil.
- Buluta otomatik kayıt; başka cihazda kaldığın yerden devam.
- Hesap silme ve tüm verini indirme.

**Değişmeyenler:**
- **Stüdyo giriş ister** (karar 18 Ekim; ilk plan hesabı isteğe bağlı bırakıyordu). Girişsiz açılan stüdyonun yerinde tam ekran bir giriş kartı durur, arkası kullanılamaz (`inert`). Çıkışta ve başka bir hesapla girişte bu tarayıcıdaki çalışma temizlenir (ortak bilgisayarda sonraki kişi öncekinin işini görmesin); kaydedilmemiş değişiklik varsa çıkmadan önce sorulur. Hesap ayarı olmayan yapılar (render düzeneği, testler, `npm run dev`) eskisi gibi girişsiz açılır.
- **Yerel öncelikli.** Düzenleme sırasında doğruluk kaynağı yine tarayıcıdaki otomatik kayıttır (IndexedDB); bulut onun bir kopyasıdır. İnternet giderse çalışma durmaz, bağlantı gelince eşitlenir.
- **Render ve dışa aktarım tarayıcıda kalır.** Sunucuya yalnızca proje dosyaları gider.

**Bu adımda olmayanlar:** ödeme ve planlar, kotaların ücretli katmanı, barındırılan gömme, ekip çalışma alanı, aynı projede eşzamanlı düzenleme.

## 2. Mimari

```
Stüdyo (tarayıcı)
 ├─ Supabase Auth ........ giriş: Google, GitHub, Apple, e-posta bağlantısı (PKCE)
 ├─ Supabase Postgres .... profiller, projeler, medya kayıtları (satır düzeyinde yetki: herkes yalnızca kendi satırını görür)
 └─ Depolama Worker'ı .... Cloudflare Worker + R2 bağlaması
       - Supabase oturum jetonunu doğrular (JWKS)
       - yükleme ve indirme için kısa ömürlü imzalı adresler verir
       - kota ve boyut sınırlarını uygular
       - hesap silmede kullanıcının tüm nesnelerini siler
```

**Neden dosyalar Supabase Storage'da değil de R2'de:**
- Video ve model ağırlıklı bir üründe asıl maliyet indirme trafiği; R2'de çıkış trafiği ücretsiz.
- Site ve yakalama tarafı zaten Cloudflare'de.
- Bedeli: bir Worker yazıp bakımını yapmak (~200 satır).
- Daha az parça istersek, Supabase Storage ile aynı plan Worker olmadan da çalışır; bu durumda trafik ücreti göze alınır.

## 3. Veri modeli (Postgres)

```sql
profiles (
  id uuid primary key references auth.users on delete cascade,
  name text, avatar_url text,
  plan text not null default 'beta',          -- ödeme gelince: free / pro / team
  storage_bytes bigint not null default 0,    -- kotada kullanılan
  created_at timestamptz default now()
)

projects (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references profiles on delete cascade,
  name text not null,
  version int not null default 1,             -- her kayıtta +1 (çakışma denetimi)
  doc_key text not null,                      -- R2: belgenin JSON'u
  thumb_key text,                             -- R2: liste için küçük resim (webp)
  boards int, bytes bigint,                   -- listede göstermek için
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz                      -- çöp kutusu: 30 gün sonra kalıcı silinir
)

media (
  owner uuid references profiles on delete cascade,
  hash text,                                  -- sha256 (içerik adresi)
  bytes bigint, type text,
  primary key (owner, hash)
)

project_media (project uuid references projects on delete cascade, hash text, primary key (project, hash))
```

- **Satır düzeyinde yetki** her tabloda `owner = auth.uid()`.
- **Profil oluşturma:** `auth.users`'a eklenen her kullanıcı için tetikleyici bir profil satırı açar.
- **Medya içerik adresli.** Aynı ekran görüntüsü iki projede kullanılsa da bir kez yüklenir, yeniden kaydetmede tekrar yüklenmez. Hiçbir projenin kullanmadığı medya, gecelik bir temizlik işiyle silinir.
- Şema `supabase/migrations/` altında SQL dosyaları olarak sürümlenir.

## 4. Depolama (R2)

```
u/<kullanıcı>/m/<sha256>              medya (görsel, video, GLB)
u/<kullanıcı>/p/<proje>/doc-<sürüm>.json   belge (son 10 sürüm tutulur: basit geçmiş)
u/<kullanıcı>/p/<proje>/thumb.webp     küçük resim
```

- Kova özel; doğrudan erişim yok.
- Worker uç noktaları:
  - `POST /upload` `{project, files:[{hash, bytes, type}]}`: eksik olan her dosya için 10 dakikalık imzalı PUT adresi. Zaten var olanlar atlanır.
  - `GET /m/<hash>` ve `GET /p/<proje>/…`: sahiplik denetimiyle okuma; tarayıcı önbelleği için `immutable` (içerik adresi değişmez).
  - `DELETE /account`: kullanıcının önekindeki her şeyi siler.
- Sınırlar bugünkülerle aynı: video 200 MB, model 50 MB. Yalnızca bilinen içerik türleri kabul edilir.
- Kota: beta için kullanıcı başına 2 GB ve 100 proje.

## 5. Stüdyoda eşitleme

Bugünkü otomatik kayıt belgeyi (`plainDoc` + medya anahtarları) ve medyayı (anahtar → Blob) zaten ayrı saklıyor (`io/project.js` `saveNow`). Bulut kaydı bunun aynısını yapar:

1. Değişiklikten ~5 sn sonra (ya da sekme gizlenince) medyaların sha256'sı hesaplanır, Worker'a hangilerinin eksik olduğu sorulur, yalnızca onlar yüklenir.
2. Belge JSON'u, medya anahtarları hash'lere eşlenmiş olarak yüklenir. `projects` satırı `version = beklenen + 1` koşuluyla güncellenir (iyimser kilit).
3. Koşul tutmazsa (başka bir cihaz daha yeni bir sürüm kaydetmiş) şu sorulur: **Bulutakini aç** / **Benimkini kaydet** / **Kopya olarak kaydet**.
4. Açarken önce yerel kopyaya bakılır. Aynı sürümse medya IndexedDB'den gelir, buluttan yalnızca eksikler iner.

Yerel otomatik kayıt bugün tek belge tutuyor. Üyelikle birlikte açık projenin bulut kimliği de saklanır; yerel kayıt "şu an açık olan projenin çalışma kopyası" olur.

## 6. Arayüz

- **Üst bar:** girişsiz "Giriş yap"; girişli kullanıcı avatarı ve menüsü (Projelerim, Hesap, Çıkış). Dosya adının yanında kayıt durumu: *Kaydedildi* / *Kaydediliyor…* / *Çevrimdışı · sonra eşitlenecek*.
- **Giriş penceresi:** Google, GitHub, Apple, "E-postama bağlantı gönder". Şifre yok.
- **Projelerim:** küçük resimli ızgara, arama, yeni proje, aç, yeniden adlandır, çoğalt, sil (çöp kutusu), son değişiklik tarihi.
- **İlk girişte:** tarayıcıdaki çalışma varsa "Bu çalışmayı hesabına kaydet?" diye sorulur.
- **Karşılama kartı:** girişliyse "Proje aç…"ın yerinde son projeler.
- **Hesap:** ad ve avatar, kullanılan alan, tüm verini indir (ZIP: her proje bir `.mockup.zip`), hesabı sil (onaylı, geri alınamaz).
- **Gizlilik sayfası:** hangi verinin nerede tutulduğu. Supabase ve R2 bölgesi AB (KVKK ve GDPR için).

## 7. Güvenlik

- Tarayıcıya yalnızca Supabase'in herkese açık (anon) anahtarı girer. Gizli anahtar yalnızca Worker'da ve gecelik temizlik işinde.
- Worker her istekte jetonu doğrular, nesne yolunu kullanıcının kendi önekine zorlar.
- İmzalı adresler kısa ömürlü; içerik türü ve boyutu adreste sabitlenir.
- Giriş akışı PKCE. Masaüstü uygulaması aynı akışı özel bir adres şemasıyla (`shotlight://`) kullanır; bunun için ayrıca kod gerekmeyecek şekilde kurulur.
- Hesap silme: veritabanında zincirleme silme, Worker'da önek silme, Supabase'te kullanıcı silme. Hepsi tek bir uç noktadan.

## 8. Adımlar

| Adım | İş | Doğrulama |
|---|---|---|
| 0 · hesaplar (sen) | Supabase projesi (AB bölgesi), Google ve GitHub OAuth uygulamaları, Cloudflare'de R2 kovası ve Worker | rehberdeki komutlarla bağlantı denemesi |
| 1 · giriş ✓ | supabase-js (ilk kullanımda yüklenir, stüdyonun açılışı yavaşlamaz), giriş penceresi, üst bar menüsü, profil tetikleyicisi | test kullanıcısıyla headless giriş ve çıkış |
| 2 · arka uç ✓ | şema, satır düzeyinde yetki, Worker (`services/storage/`), yerel geliştirme için Supabase CLI ve `wrangler dev` | yetki testleri: bir kullanıcı ötekinin satırını ve nesnesini göremez |
| 3 · buluta kaydet ve aç ✓ | hash'leme, eksik medya yükleme, belge sürümü, Projelerim penceresi, küçük resimler | aynı proje iki tarayıcı profilinde; çakışma senaryosu |
| 4 · otomatik eşitleme | gecikmeli kayıt, çevrimdışı kuyruk, durum göstergesi, ilk girişte yerel çalışmayı taşıma | ağ kesilip geri gelince eşitlenme, büyük videoyla yükleme |
| 5 · hesap | verini indir, hesabı sil, gizlilik sayfası, gecelik temizlik | silme sonrası R2 ve veritabanı boş |

**Durum (18 Ekim):** 1. ve 2. adım yerel Supabase ile bitti ve testli: `npm run accounts:test` (yetki 25 + Worker 21 denetim), `node tools/accounts/test-signin.mjs` (stüdyoda e-posta bağlantısıyla giriş, 15 denetim). **3. adım (18 Ekim):** "Buluta kaydet" ve "Projelerim" (aç, yeniden adlandır, çoğalt, sil), küçük resimler, çakışma penceresi; `node tools/accounts/test-projects.mjs` (iki tarayıcı profili, 18 denetim). Belge her kayıtta yeni bir adla yüklenir: yarışı kaybeden kayıt diğerinin belgesini ezemez. Sırada 4. adım: otomatik eşitleme, çevrimdışı kuyruk, durum göstergesi, ilk girişte yerel çalışmayı taşıma. Worker'da yüklemeler imzalı adres yerine Worker'ın kendisinden geçiyor (yerelde de çalışsın, R2 SHA-256'yı doğrulasın diye); 90 MB üstü çok parçalı.

Kabaca: 1. ve 2. adım birkaç gün, 3. ve 4. adım bir hafta civarı, 5. adım iki üç gün. Her adım ayrı dalda, doğrulanıp main'e alınır.

## 9. Kararlar (18 Ekim 2026)

1. **Giriş yöntemleri:** Google, GitHub, Apple ve e-posta bağlantısı; şifre yok. Apple için Apple Developer hesabı gerekir (masaüstü uygulamasının imzalanması için de gerekecek).
2. **Buluta kayıt:** otomatik. Girişli kullanıcının her projesi bulutta; değişiklikten birkaç saniye sonra eşitlenir.
3. **Beta kotası:** kullanıcı başına 2 GB ve 100 proje.
4. **Depolama:** R2 + Worker.
5. **Bölge:** AB (Supabase Frankfurt, R2 AB yetki alanı). Ayrıca sorulmadı, öneri olarak alındı; değiştirmek istersen şimdi söyle, kurulumdan sonra taşımak zahmetli.

## 10. Adım 0: senin açacağın hesaplar

Sırası önemli değil; her biri bittiğinde bilgileri bana (ya da yerel `.env.local` dosyasına) ver. Gizli anahtarları sohbete yazma; nereye konacaklarını aşağıda yazdım.

**Supabase**
1. supabase.com'da hesap aç, yeni proje: ad `shotlight`, bölge **Central EU (Frankfurt)**, güçlü bir veritabanı şifresi (parola yöneticine kaydet).
2. Project Settings → API: **Project URL** ve **anon public** anahtarını not et. Bunlar tarayıcıya giren, herkese açık değerler; `.env.local` dosyasına `VITE_SUPABASE_URL` ve `VITE_SUPABASE_ANON_KEY` olarak yazılır.
3. **service_role** anahtarı gizlidir: yalnızca Worker'ın gizli değişkenine (`wrangler secret put`) girecek. Hiçbir dosyaya yazma.
4. Authentication → URL Configuration: Site URL `https://shotlight.studio`, ek yönlendirme adresleri `http://localhost:5173/**` ve `https://shotlight.studio/studio/**`.

**Google ile giriş**
1. Google Cloud Console → APIs & Services → OAuth consent screen: uygulama adı Shotlight, destek e-postası, alan adı.
2. Credentials → OAuth client ID → Web application. Yetkili yönlendirme adresi: Supabase'in Authentication → Providers → Google sayfasında gösterdiği adres (`https://<proje>.supabase.co/auth/v1/callback`).
3. Client ID ve secret'ı Supabase'teki Google sağlayıcısına gir.

**GitHub ile giriş**
1. GitHub → Settings → Developer settings → OAuth Apps → New OAuth App. Homepage `https://shotlight.studio`, callback yine Supabase'in verdiği adres.
2. Client ID ve secret'ı Supabase'teki GitHub sağlayıcısına gir.

**Apple ile giriş** (Apple Developer hesabı gerekir, yıllık ücretli)
1. Certificates, Identifiers & Profiles: bir App ID ve ona bağlı bir **Services ID** (ör. `studio.shotlight.web`), "Sign in with Apple" açık; alan adı ve dönüş adresi Supabase'in verdiği adres.
2. Bir **Sign in with Apple anahtarı** (.p8) oluştur; Team ID, Key ID ve Services ID ile Supabase'teki Apple sağlayıcısına gir. Supabase bu bilgilerden gizli değeri kendisi üretir; anahtarın 6 ayda bir yenilenmesi gerekir, hatırlatıcı kur.

**E-posta bağlantısı**
- Supabase'in kendi e-posta gönderimi saatte birkaç e-postayla sınırlıdır; beta için yeterli değil. Bir e-posta servisi (ör. Resend ya da Postmark) aç, alan adını doğrula, SMTP bilgilerini Supabase → Authentication → SMTP Settings'e gir. Gönderen: `giris@shotlight.studio`.

**Cloudflare R2 ve Worker**
1. Cloudflare panosu → R2 → Create bucket: `shotlight-projects`, konum **European Union (EU) jurisdiction**.
2. Workers & Pages → Worker oluşturmayı ben `services/storage/` altından `wrangler deploy` ile yapacağım; senden yalnızca R2'nin açık olması ve `wrangler login` ile giriş yapman gerekiyor.

**Yerel geliştirme**
- Şemayı ve Worker'ı canlı projeye dokunmadan denemek için Supabase CLI yerel bir Supabase'i Docker'da çalıştırır. Docker Desktop'ın açık olması yeterli; Adım 1 ve 2'ye bununla başlayabilirim, hesaplar sonra bağlanır.
