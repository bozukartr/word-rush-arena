const SOURCE = `
ada adam adım aile akıl alan alem alet altın ana anı anne ara arı arka arma asıl aşk ateş atık ayak ayı azim
baba bağ bahar bal balık barış baş batı bebek belge belli beyaz bilgi bilme bina bir biz boya boyun büyük
cam can cevap ceviz cümle çaba çam çare çay çiçek çocuk çok dağ dal damla dans dar deniz ders dil diş doğru dolu dost dünya
ekmek el elma emek erken eski eş ev evet fare fark fazla fikir film gece genç geri gezi göz gül gün güneş güzel haber hafıza hak halk hava hayat hazır hız hiç ışık
iç iki ince insan iyi izin kadın kalem kale kalp kapı kara karar kardeş karşı kavun kaya kedi kelime kendi kent kırmızı kısa kitap kolay kol komik konu koşu köpek kötü kutu kuş küçük
lale limon mavi masa mektup merak meyve mor mutlu müzik nasıl neden nehir nesil okul olmak orman oyun önce para pazar pembe plan puan rahat renk resim ruh rüya
saat sabah saç sade sahil sakin sarı savaş saygı sebep ses sevgi sıcak sınıf soru söz su süre süt şehir şimdi takım taş tatlı tavuk telefon temiz toprak tur turuncu tuz
uçak umut uzun üç üzüm var vatan yaz yazı yemek yeni yeşil yıldız yol yumurta yüz zaman zeka zengin zor
oy oyla oyunlar oyuncu kelimeler kelimeli yarış yarışma hızlı hızla rakip skor lider kazan kazanan hazırla başla bul bulmak
`.trim();

export const WORDS = new Set(SOURCE.split(/\s+/u).map(normalizeWord));
export const SEED_WORDS = [...WORDS].filter((word) => [...word].length >= 4 && [...word].length <= 7);

export function normalizeWord(value) {
  return value.trim().normalize("NFC").toLocaleLowerCase("tr-TR");
}

export function isValidWord(value) {
  return WORDS.has(normalizeWord(value));
}
