import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

import 'firebase_bootstrap.dart';
import 'models.dart';

class GameController extends ChangeNotifier {
  GameController({
    String? endpoint,
  }) : endpoint = endpoint ??
            const String.fromEnvironment(
              'GAME_SERVER_URL',
              defaultValue: 'ws://localhost:8080/game',
            );

  final String endpoint;
  WebSocketChannel? _channel;
  StreamSubscription<dynamic>? _subscription;
  Timer? _clock;
  int _requestSequence = 0;

  GamePhase phase = GamePhase.home;
  String roomCode = '';
  String currentWord = '';
  String status = 'Oda kur veya kodla katıl';
  String? error;
  DateTime? endsAt;
  List<String> letters = const [];
  List<PlayerView> players = const [];
  String? localPlayerId;

  int get remainingSeconds {
    final end = endsAt;
    if (end == null) return 0;
    final milliseconds = end.difference(DateTime.now()).inMilliseconds;
    return milliseconds <= 0 ? 0 : (milliseconds / 1000).ceil();
  }

  bool get localPlayerIsHost =>
      players.any((player) => player.id == localPlayerId && player.isHost);
  bool get canStart => players.length >= 2 && players.every((player) => player.ready);

  Future<void> createRoom(String playerName) =>
      _connectAndSend('create_room', playerName: playerName);

  Future<void> joinRoom(String playerName, String code) => _connectAndSend(
        'join_room',
        playerName: playerName,
        roomCode: code.trim().toUpperCase(),
      );

  Future<void> _connectAndSend(
    String type, {
    required String playerName,
    String? roomCode,
  }) async {
    error = null;
    phase = GamePhase.connecting;
    status = 'Sunucuya bağlanıyor…';
    notifyListeners();
    try {
      await _subscription?.cancel();
      await _channel?.sink.close();
      final channel = WebSocketChannel.connect(Uri.parse(endpoint));
      _channel = channel;
      await channel.ready;
      _subscription = channel.stream.listen(
        _handleMessage,
        onError: (Object value) => _fail('Bağlantı hatası: $value'),
        onDone: () {
          if (phase != GamePhase.home) _fail('Sunucu bağlantısı kapandı.');
        },
      );
      final token = await FirebaseBootstrap.idToken();
      _send({
        'type': type,
        'requestId': _nextRequestId(),
        'playerName': playerName.trim(),
        if (roomCode != null) 'roomCode': roomCode,
        if (token != null) 'idToken': token,
      });
    } catch (exception) {
      _fail('Bağlantı kurulamadı: $exception');
    }
  }

  void setReady(bool value) => _send({
        'type': 'set_ready',
        'ready': value,
        'requestId': _nextRequestId(),
      });

  void startMatch() => _send({
        'type': 'start_match',
        'requestId': _nextRequestId(),
      });

  void selectLetter(String letter) {
    if (phase != GamePhase.playing || currentWord.length >= 24) return;
    currentWord += letter;
    status = 'Göndermek için hazır';
    notifyListeners();
  }

  void backspace() {
    if (currentWord.isEmpty) return;
    currentWord = currentWord.substring(0, currentWord.length - 1);
    notifyListeners();
  }

  void clearWord() {
    currentWord = '';
    notifyListeners();
  }

  void submitWord() {
    final word = currentWord;
    if (word.isEmpty || phase != GamePhase.playing) return;
    currentWord = '';
    status = '“$word” doğrulanıyor…';
    notifyListeners();
    _send({
      'type': 'submit_word',
      'word': word,
      'requestId': _nextRequestId(),
    });
  }

  void reset() {
    _clock?.cancel();
    _subscription?.cancel();
    _channel?.sink.close();
    _channel = null;
    phase = GamePhase.home;
    roomCode = '';
    currentWord = '';
    letters = const [];
    players = const [];
    localPlayerId = null;
    endsAt = null;
    error = null;
    status = 'Oda kur veya kodla katıl';
    notifyListeners();
  }

  void _handleMessage(dynamic raw) {
    final message = jsonDecode(raw as String) as Map<String, dynamic>;
    switch (message['type']) {
      case 'room_snapshot':
        localPlayerId = message['youId'] as String?;
        _applySnapshot(message['room'] as Map<String, dynamic>);
        return;
      case 'word_result':
        final accepted = message['accepted'] as bool;
        status = accepted
            ? '+${message['points']} puan · ${message['word']}'
            : _reason(message['reason'] as String?);
        notifyListeners();
        return;
      case 'error':
        _fail(_reason(message['code'] as String?));
        return;
    }
  }

  void _applySnapshot(Map<String, dynamic> room) {
    roomCode = room['code'] as String;
    players = (room['players'] as List<dynamic>)
        .map((item) => PlayerView.fromJson(item as Map<String, dynamic>))
        .toList(growable: false);
    letters = List<String>.from(room['letters'] as List<dynamic>);
    final serverEndsAt = room['endsAt'] as num?;
    endsAt = serverEndsAt == null
        ? null
        : DateTime.fromMillisecondsSinceEpoch(serverEndsAt.toInt());
    phase = switch (room['phase']) {
      'lobby' => GamePhase.lobby,
      'playing' || 'countdown' => GamePhase.playing,
      'results' => GamePhase.results,
      _ => GamePhase.home,
    };
    status = switch (phase) {
      GamePhase.lobby => 'Oyuncuların hazırlanması bekleniyor',
      GamePhase.playing => status,
      GamePhase.results => 'Tur tamamlandı',
      _ => status,
    };
    if (phase == GamePhase.playing && _clock == null) {
      _clock = Timer.periodic(const Duration(milliseconds: 250), (_) {
        notifyListeners();
      });
    }
    if (phase == GamePhase.results) {
      _clock?.cancel();
      _clock = null;
    }
    notifyListeners();
  }

  void _send(Map<String, dynamic> message) {
    _channel?.sink.add(jsonEncode(message));
  }

  String _nextRequestId() => '${DateTime.now().microsecondsSinceEpoch}-${_requestSequence++}';

  void _fail(String message) {
    error = message;
    status = message;
    if (phase == GamePhase.connecting) phase = GamePhase.home;
    notifyListeners();
  }

  String _reason(String? code) => switch (code) {
        'ROOM_NOT_FOUND' => 'Oda bulunamadı',
        'ROOM_FULL' => 'Oda dolu',
        'ROOM_ALREADY_STARTED' => 'Maç başlamış',
        'PLAYERS_NOT_READY' => 'Tüm oyuncular hazır değil',
        'NOT_ENOUGH_PLAYERS' => 'En az iki oyuncu gerekli',
        'HOST_ONLY' => 'Maçı yalnızca oda sahibi başlatabilir',
        'WORD_TOO_SHORT' => 'Kelime çok kısa',
        'LETTERS_NOT_AVAILABLE' => 'Bu harfler havuzda yok',
        'WORD_NOT_FOUND' => 'Kelime sözlükte bulunamadı',
        'WORD_ALREADY_CLAIMED' => 'Bu kelime daha önce bulundu',
        'AUTH_REQUIRED' => 'Oturum doğrulanamadı',
        _ => code ?? 'Beklenmeyen hata',
      };

  @override
  void dispose() {
    _clock?.cancel();
    _subscription?.cancel();
    _channel?.sink.close();
    super.dispose();
  }
}
