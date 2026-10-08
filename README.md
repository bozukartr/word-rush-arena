# Word Rush Arena

Gerçek zamanlı Türkçe kelime düellosu. Tek kod tabanıyla tarayıcıda, ana ekrana
yüklenebilir PWA olarak ve Capacitor ile Android/iOS uygulaması olarak çalışır.
Yalnızca HTML, CSS ve tarayıcı JavaScript'i kullanır; derleme adımı gerekmez.

## Oyun

- 12 harflik havuzdan 75 saniyede kelime kur, ilk bulan kelimeyi alır.
- **Canlı doğrulama:** kelime sözlükteyse kutu yeşile döner ve kazanacağın puan görünür;
  turda başkasının aldığı kelime "ALINDI" olarak işaretlenir.
- **Seri sistemi:** 10 saniye içinde yeni kelime bulursan seri büyür (her adım +%10, en
  fazla +%50). Sayaç çubuğu kalan süreyi gösterir.
- Uzunluk çarpanı (4 harf ×1,25 … 7+ harf ×2) ve nadir harf vurgusu (J, Ğ, F, V, Ö).
- Seçili harfe tekrar dokunarak geri alma, seçim sırası rozetleri, fiziksel klavye
  desteği (harf yaz, Enter gönder, Backspace sil, Boşluk karıştır).
- Rakiplerin bulduğu kelimeler anlık akışta ve skor kartında görünür.
- Son 10 saniyede gerilim efekti, geri sayım ipuçları, "BAŞLA!" anı, kazanana konfeti.

## Modlar

| Mod | Açıklama |
| --- | --- |
| Hızlı maç | Rastgele rakiple 1'e 1. Sıra her 4 saniyede yenilenir; 12 saniye sonra bota geçme önerilir. |
| Bota karşı | Kolay / Orta / Zor. İnternetsiz ve girişsiz oynanır, rekorlar cihazda saklanır, rövanş serisi tutulur. |
| Özel oda | 2–4 oyuncu, 5 haneli kod, arkadaş daveti, paylaş düğmesi. |

Bot, kendi harfleriyle gerçekten kurulabilen sözlük kelimelerini oynar; argo ve sözlükteki
kesik kökler (ör. "pisl", "üyes") bot için filtrelenir. Ortalama tur skorları yaklaşık
40 / 100 / 200 puandır.

## İlerleme ve market

Galibiyet +40, katılım +5 jeton, her 3 galibiyette +1 elmas. Rütbeler galibiyetlere göre
(Çaylak → Kalfa → Usta → Üstat → Efsane). Marketten A Kilidi gücü ve taş temaları
(Aurora, Obsidian, Royal Gold) alınır; temalar istenirse Klasik'e geri alınabilir.

## Native/mobil özellikler

- PWA: manifest, maskable ikonlar, ana ekran kısayolları (`?mode=bot`, `?mode=quick`),
  ayarlarda "Uygulamayı yükle" ve iOS için ana ekrana ekleme ipucu.
- Service worker (`sw.js`): uygulama kabuğu ve sözlük önbelleğe alınır, bot modu çevrimdışı
  çalışır. Kod dosyaları önce ağdan istenir, böylece yayın sonrası modüller tutarlı kalır.
- Oyun sırasında ekran açık kalır (Screen Wake Lock), bot maçı arka plana alınınca duraklar.
- Dokunmatik geri bildirim: Web Vibration veya Capacitor Haptics (iOS dahil), ayarlardan
  ses ve titreşim ayrı ayrı kapatılabilir.
- Android geri tuşu: açık pencereyi kapatır → maçtan çıkışı sorar → ana ekrana döner.
- Animasyon ve sesler platform API'leriyle (Web Animations, Canvas, Web Audio) yapılır;
  harici CDN'e bağımlı efekt kütüphanesi yoktur.

## Yerel çalıştırma

ES module kullandığı için dosyayı doğrudan açmayın:

```bash
npm run serve        # http://localhost:5000
```

Firebase emülatörleriyle:

```bash
firebase emulators:start
```

Sonra `http://localhost:5000/?emulator=1` adresini açın.

## Android / iOS (Capacitor)

```bash
npm install
npm run cap:add:android   # ilk sefer; iOS için cap:add:ios (macOS + Xcode)
npm run android           # www/ üretir, senkronlar ve Android Studio'yu açar
```

`scripts/build-web.mjs` oyunu `www/` klasörüne kopyalar. Uygulama ikonu ve açılış ekranı
için `icons/icon-512.png` kaynağıyla `npx @capacitor/assets generate` kullanılabilir.

Notlar:

- Native kabukta Firebase Auth, WebView'da takılmaması için IndexedDB kalıcılığıyla
  başlatılır ve misafir hesabı kullanılır. Google ile girişin native'de çalışması için
  `@capacitor-firebase/authentication` gibi bir native eklenti gerekir; şimdilik Google
  düğmesi native'de gizlenir.
- Firebase API anahtarında HTTP referrer kısıtlaması varsa `capacitor://localhost` ve
  `https://localhost` izinli olmalıdır.

## Firebase ayarları

Proje kimliği `.firebaserc` içinde `wordrusharena` olarak ayarlıdır. Firebase Console'da:

1. Authentication → Anonymous ve Google sağlayıcıları (destek e-postası seçili)
2. Authentication → Settings → Authorized domains: oyunun alan adı (yerelde `localhost`)
3. Firestore Database ve Hosting
4. App Check kullanılıyorsa `firebase-config.js` içindeki `appCheckSiteKey`

Giriş önce popup kullanır. Popup engellenirse yalnızca oyunun alan adı
`firebaseConfig.authDomain` ile aynıysa redirect denenir; farklı alan adından redirect
Safari/Chrome depolama kısıtları yüzünden sessizce başarısız olabilir. Ayrıntı:
https://firebase.google.com/docs/auth/web/redirect-best-practices

Hesap değiştirirken misafir puanları birleştirilmez; oyuncuya geçişten önce sorulur.

## Yayınlama

```bash
firebase deploy --only hosting,firestore:rules --project wordrusharena
```

Bu sürüm Firestore kurallarında değişiklik gerektirmez.

## Türkçe sözlük

`tr_words.txt`, [tdd-ai/hunspell-tr](https://github.com/tdd-ai/hunspell-tr) sözlüğünden
türetilmiş kök kelime listesidir. Kaynak ve lisans ayrıntıları `NOTICE.md` ve
`LICENSE-MPL-2.0.txt` dosyalarındadır.

## Kod yapısı

| Dosya | Görev |
| --- | --- |
| `app.js` | Ekranlar, Firebase akışları, çevrimiçi ve bot maç döngüsü |
| `game-core.js` | Saf oyun kuralları: puan, torba, harf yenileme, bot seçimi, rütbe |
| `words.js` | Sözlük yükleme, doğrulama, tahtadan kurulabilen kelimeleri bulma |
| `effects.js` | Animasyon, parçacık, ses ve dokunsal geri bildirim |
| `auth-flow.js` | Google giriş hatalarından kurtarma |
| `sw.js` | Çevrimdışı önbellek |

## Kontroller

```bash
npm test                          # sözdizimi + birim testleri (kurallar, sözlük, bot, giriş)
npm install --no-save --package-lock=false playwright@1.62.1
npx playwright install chromium
npm run test:mobile               # tarayıcı testleri
```

Tarayıcı testleri gerçek arayüz, oyun kuralları, sözlük ve efekt kodunu çalıştırır; yalnızca
Firebase taklit edilir: dokunma/klavye, canlı doğrulama, seçimi geri alma, alınmış kelime,
gönderim kilidi, geri alma, 320–430 px portre ve yatay ekran yerleşimi ile bota karşı tam
bir tur (kelime, bot hamlesi, sonuç, rekor, rövanş, çıkış). Gerçek Google OAuth, Firestore
yetkileri ve iki cihazlı maç ayrıca canlı/emülatör ortamında denenmelidir.

## Güvenlik notu ve sonraki adımlar

1. Kelime, puan ve tur bitişini sunucuda (Cloud Function) doğrulamak. İstemci skor alanları
   hâlâ güvenilir kabul ediliyor; ödüllü/rekabetçi yayın öncesinde önceliklidir.
2. Bağlantısı kesilen host için sunucu zamanına dayalı presence ve otomatik devir.
3. Native Google girişi için Capacitor Firebase Authentication eklentisi.
4. Gerçek iPhone/Safari ve Android/Chrome üzerinde iki cihazlı maç ve rövanş testi.
