import 'package:characters/characters.dart';

const roomCodeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const letterPool = "AAABCDEEEFGĞHIIİJKLMNOÖPRSTUÜVYZ";

const _guaranteedSeed = "OYUN";

const _baseScore = <int, int>{2: 40, 3: 100, 4: 180, 5: 300, 6: 460};

/// Development fixture only. Replace with a licensed, versioned Turkish dictionary asset.
final Set<String> developmentDictionary =
    <String>{
      "ada", "aile", "akıl", "alan", "ana", "ara", "arı", "at", "ateş", "ay",
      "bal", "bar", "baş", "bil", "bir", "dal", "dil", "el", "ev", "gül",
      "kal", "kelime", "kır", "masa", "oyun", "sal", "sel", "sen", "söz", "taş",
      "tel", "tur", "yar", "yol", "zor",
    }.map(normalizeTurkishWord).toSet();

/// Dart has no locale-aware case conversion, so the ambiguous Turkish I/İ
/// pair must be rewritten before falling back to standard [toLowerCase].
String normalizeTurkishWord(String value) =>
    value.trim().replaceAll('İ', 'i').replaceAll('I', 'ı').toLowerCase();

bool canBuildWord(String word, List<String> letters) {
  final available = <String, int>{};
  for (final letter in letters) {
    final key = normalizeTurkishWord(letter);
    available[key] = (available[key] ?? 0) + 1;
  }
  for (final letter in normalizeTurkishWord(word).characters) {
    final remaining = available[letter] ?? 0;
    if (remaining == 0) return false;
    available[letter] = remaining - 1;
  }
  return true;
}

int scoreWord(String word, int combo) {
  final length = word.characters.length;
  final base = _baseScore[length] ?? (length >= 7 ? 650 + (length - 7) * 100 : 0);
  final multiplier = 1 + combo.clamp(0, 5) * 0.1;
  return (base * multiplier).round();
}

List<String> generateLetters(int count, {required int Function(int max) randomInt}) {
  final letters = [..._guaranteedSeed.characters];
  for (var i = _guaranteedSeed.length; i < count; i++) {
    letters.add(letterPool[randomInt(letterPool.length)]);
  }
  return letters;
}

String generateRoomCode(int length, {required int Function(int max) randomInt}) {
  return List.generate(length, (_) => roomCodeAlphabet[randomInt(roomCodeAlphabet.length)]).join();
}

String normalizeRoomCode(String value) =>
    value.trim().toUpperCase().replaceAll(RegExp('[^A-Z0-9]'), '');
