# Word Rush Arena

Firebase Hosting ve Firestore üzerinde çalışan, yalnızca HTML, CSS ve tarayıcı JavaScript'i ile yazılmış gerçek zamanlı kelime oyunu.

## Özellikler

- 2–4 oyunculu özel oda
- Yalnızca rakamlardan oluşan 5 haneli oda kodu
- Anonim Firebase Authentication
- Firestore gerçek zamanlı lobi, skor ve maç durumu
- 75 saniyelik tur
- Dokunmatik harf seçimi ve mobil safe-area desteği
- Tek kelimeyi ilk bulan oyuncuya atomik sahiplik
- Ana menüye dönmeden güvenli yeni tur / tekrar oynama
- TDD `tr_TR` Hunspell sözlüğünden türetilmiş yaklaşık 76 bin kök kelime

## Firebase ayarları

Proje kimliği `.firebaserc` içinde `wordrusharena` olarak ayarlıdır. Firebase Console'da şunlar açık olmalıdır:

1. Authentication → Anonymous
2. Firestore Database
3. Hosting
4. App Check kullanılıyorsa `firebase-config.js` içindeki `appCheckSiteKey`

## Türkçe sözlük

`tr_words.txt`, [tdd-ai/hunspell-tr](https://github.com/tdd-ai/hunspell-tr) sözlüğünden türetilmiş kök kelime listesidir. Kaynak ve lisans ayrıntıları `NOTICE.md` ve `LICENSE-MPL-2.0.txt` dosyalarındadır.

## Yerel çalıştırma

ES module kullandığı için dosyayı doğrudan açmayın:

```bash
npx serve .
```

Firebase emülatörleriyle:

```bash
firebase emulators:start
```

Sonra `http://localhost:5000/?emulator=1` adresini açın.

## Yayınlama

```bash
firebase deploy --only hosting,firestore:rules --project wordrusharena
```

## Güvenlik notu

Bu ilk oynanabilir sürüm kelime sözlüğü ve puan hesabını tarayıcıda yapar. Firestore transaction aynı kelimenin iki kez alınmasını engeller; ancak ciddi rekabetçi/ödüllü yayın öncesinde kelime doğrulama ve skor hesabı trusted bir Cloud Function'a taşınmalıdır.


## Google girişi ve mobil düzeltmeler

Google ile yeni giriş, misafir hesabını Google'a bağlama ve önceden kayıtlı Google
hesabına geçiş desteklenir. Hesap değiştirirken misafir puanları birleştirilmez;
oyuncuya geçişten önce sorulur. Aynı anda ikinci giriş denemesi başlatılmaz.

Firebase Console'da **Authentication → Sign-in method → Google** etkin olmalı ve
projenin destek e-postası seçilmiş olmalıdır. **Authentication → Settings →
Authorized domains** altında oyunun çalıştığı alan adı bulunmalıdır. Yerel geliştirme
için `localhost` gerekiyorsa ayrıca eklenmelidir. Bu ayarlar kaynak koduyla değişmez.

Giriş önce popup kullanır. Popup engellenirse yalnızca oyunun alan adı
`firebaseConfig.authDomain` ile aynı olduğunda redirect denenir. Farklı alan adından
redirect, Safari/Chrome depolama kısıtları yüzünden sessizce başarısız olabilir;
bu durumda oyuncuya popup izni vermesi söylenir. Özel alan adında redirect kullanmak
istenirse Firebase'in resmi kurulum adımları uygulanmalıdır:
https://firebase.google.com/docs/auth/web/redirect-best-practices

### Kontroller

```bash
node --check app.js
node --test tests/auth-flow.test.mjs
# Tarayıcı testleri için geliştirme bağımlılığı:
npm install --no-save --package-lock=false playwright@1.62.1
npx playwright install chromium
node tests/mobile.mjs
```

Mobil testler Firebase yerine kontrollü test verisi kullanır: dokunma/klavye,
DOM kararlılığı, gönderim kilidi, tur sonu, karıştırma sürümü, başarısız gönderim
geri alma ve 320–430 px portre / yatay ekran kontrolleri. Gerçek Google OAuth,
Firestore yetkileri ve iki cihazlı maç ayrıca canlı/emülatör ortamında denenmelidir.

### Sonraki geliştirme öncelikleri

1. Kelime, puan ve tur bitişini sunucuda doğrulama; istemci skor alanları hâlâ
   güvenilir kabul ediliyor. Rekabetçi oyunda hileyi engellemek için önceliklidir.
2. Bağlantısı kesilen host için sunucu zamanına dayalı presence ve otomatik devir.
3. Gerçek iPhone/Safari ve Android/Chrome üzerinde iki cihazlı maç, yeniden bağlanma
   ve rövanş testi; ardından ekran açık tutma ve çevrimdışı durum deneyimi.
