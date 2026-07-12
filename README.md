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
