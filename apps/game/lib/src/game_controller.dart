import 'dart:async';
import 'dart:math';

import 'package:characters/characters.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';

import 'models.dart';
import 'word_rules.dart';

const _roundDuration = Duration(seconds: 75);
const _letterCount = 12;
const _maxPlayers = 4;

class GameController extends ChangeNotifier {
  GameController({FirebaseFirestore? firestore, FirebaseAuth? auth})
      : _firestoreOverride = firestore,
        _authOverride = auth;

  final FirebaseFirestore? _firestoreOverride;
  final FirebaseAuth? _authOverride;
  FirebaseFirestore get _firestore => _firestoreOverride ?? FirebaseFirestore.instance;
  FirebaseAuth get _auth => _authOverride ?? FirebaseAuth.instance;
  final _random = Random();

  StreamSubscription<DocumentSnapshot<Map<String, dynamic>>>? _roomSub;
  StreamSubscription<QuerySnapshot<Map<String, dynamic>>>? _playersSub;
  Timer? _clock;
  bool _finishing = false;

  GamePhase phase = GamePhase.home;
  String roomCode = '';
  String currentWord = '';
  String status = 'Oda kur veya kodla katıl';
  String? error;
  DateTime? endsAt;
  List<String> letters = const [];
  List<PlayerView> players = const [];
  String? localPlayerId;
  String? _hostId;
  int _combo = 0;

  int get remainingSeconds {
    final end = endsAt;
    if (end == null) return 0;
    final milliseconds = end.difference(DateTime.now()).inMilliseconds;
    return milliseconds <= 0 ? 0 : (milliseconds / 1000).ceil();
  }

  bool get localPlayerIsHost => _hostId != null && _hostId == localPlayerId;
  bool get canStart => players.length >= 2 && players.every((player) => player.ready);

  Future<String> _ensureSignedIn() async {
    final existing = _auth.currentUser;
    if (existing != null) return existing.uid;
    final credential = await _auth.signInAnonymously();
    final uid = credential.user?.uid;
    if (uid == null) throw StateError('Oturum açılamadı');
    return uid;
  }

  CollectionReference<Map<String, dynamic>> get _rooms => _firestore.collection('rooms');

  Future<void> createRoom(String playerName) async {
    error = null;
    phase = GamePhase.connecting;
    status = 'Oda kuruluyor…';
    notifyListeners();
    try {
      final uid = await _ensureSignedIn();
      var attempts = 0;
      late String code;
      while (true) {
        code = generateRoomCode(6, randomInt: _random.nextInt);
        final ref = _rooms.doc(code);
        final created = await _firestore.runTransaction<bool>((tx) async {
          final snapshot = await tx.get(ref);
          if (snapshot.exists) return false;
          tx.set(ref, <String, dynamic>{
            'hostId': uid,
            'phase': 'lobby',
            'letters': <String>[],
            'endsAt': null,
            'createdAt': FieldValue.serverTimestamp(),
          });
          tx.set(ref.collection('players').doc(uid), _newPlayer(playerName));
          return true;
        });
        if (created) break;
        attempts += 1;
        if (attempts > 8) throw StateError('Oda kodu üretilemedi, tekrar dene.');
      }
      localPlayerId = uid;
      roomCode = code;
      _combo = 0;
      _listenToRoom(code);
    } catch (exception) {
      _fail('Oda kurulamadı: ${_reason(exception)}');
    }
  }

  Future<void> joinRoom(String playerName, String codeInput) async {
    error = null;
    phase = GamePhase.connecting;
    status = 'Odaya katılıyor…';
    notifyListeners();
    final code = normalizeRoomCode(codeInput);
    try {
      final uid = await _ensureSignedIn();
      final ref = _rooms.doc(code);
      final roomSnapshot = await ref.get();
      if (!roomSnapshot.exists) throw StateError('ROOM_NOT_FOUND');
      final data = roomSnapshot.data()!;
      if (data['phase'] != 'lobby') throw StateError('ROOM_ALREADY_STARTED');
      final existingPlayers = await ref.collection('players').get();
      final alreadyJoined = existingPlayers.docs.any((doc) => doc.id == uid);
      if (!alreadyJoined && existingPlayers.docs.length >= _maxPlayers) {
        throw StateError('ROOM_FULL');
      }
      await ref.collection('players').doc(uid).set(_newPlayer(playerName));
      localPlayerId = uid;
      roomCode = code;
      _combo = 0;
      _listenToRoom(code);
    } catch (exception) {
      _fail(_reason(exception));
    }
  }

  Map<String, dynamic> _newPlayer(String name) => <String, dynamic>{
        'name': name.trim(),
        'ready': false,
        'score': 0,
        'combo': 0,
        'connected': true,
        'joinedAt': FieldValue.serverTimestamp(),
      };

  void _listenToRoom(String code) {
    _roomSub?.cancel();
    _playersSub?.cancel();
    _roomSub = _rooms.doc(code).snapshots().listen(
          _handleRoomSnapshot,
          onError: (Object value) => _fail('Bağlantı hatası: $value'),
        );
    _playersSub = _rooms.doc(code).collection('players').orderBy('score', descending: true).snapshots().listen(
          _handlePlayersSnapshot,
          onError: (Object value) => _fail('Bağlantı hatası: $value'),
        );
  }

  void _handleRoomSnapshot(DocumentSnapshot<Map<String, dynamic>> snapshot) {
    final data = snapshot.data();
    if (data == null) {
      _fail('Oda kapatıldı.');
      return;
    }
    _hostId = data['hostId'] as String?;
    letters = List<String>.from(data['letters'] as List<dynamic>? ?? const []);
    final timestamp = data['endsAt'];
    endsAt = timestamp is Timestamp ? timestamp.toDate() : null;
    final nextPhase = switch (data['phase']) {
      'lobby' => GamePhase.lobby,
      'playing' => GamePhase.playing,
      'results' => GamePhase.results,
      _ => GamePhase.home,
    };
    if (nextPhase != phase) {
      phase = nextPhase;
      status = switch (phase) {
        GamePhase.lobby => 'Oyuncuların hazırlanması bekleniyor',
        GamePhase.results => 'Tur tamamlandı',
        _ => status,
      };
    }
    if (phase == GamePhase.playing && _clock == null) {
      _finishing = false;
      _clock = Timer.periodic(const Duration(milliseconds: 250), (_) => _tick());
    }
    if (phase != GamePhase.playing) {
      _clock?.cancel();
      _clock = null;
    }
    notifyListeners();
  }

  void _handlePlayersSnapshot(QuerySnapshot<Map<String, dynamic>> snapshot) {
    players = snapshot.docs
        .map(
          (doc) => PlayerView(
            id: doc.id,
            name: doc.data()['name'] as String? ?? '',
            score: (doc.data()['score'] as num?)?.toInt() ?? 0,
            ready: doc.data()['ready'] as bool? ?? false,
            connected: doc.data()['connected'] as bool? ?? true,
            isHost: doc.id == _hostId,
          ),
        )
        .toList(growable: false);
    notifyListeners();
  }

  void _tick() {
    notifyListeners();
    if (_finishing || remainingSeconds > 0) return;
    _finishing = true;
    _rooms.doc(roomCode).update(<String, dynamic>{'phase': 'results'}).catchError((Object _) {});
  }

  void setReady(bool value) {
    final uid = localPlayerId;
    if (uid == null) return;
    _rooms.doc(roomCode).collection('players').doc(uid).update({'ready': value});
  }

  Future<void> startMatch() async {
    if (!localPlayerIsHost) return _fail('Maçı yalnızca oda sahibi başlatabilir');
    if (!canStart) return _fail(players.length < 2 ? 'En az iki oyuncu gerekli' : 'Tüm oyuncular hazır değil');
    final generated = generateLetters(_letterCount, randomInt: _random.nextInt);
    await _rooms.doc(roomCode).update(<String, dynamic>{
      'phase': 'playing',
      'letters': generated,
      'endsAt': Timestamp.fromDate(DateTime.now().add(_roundDuration)),
    });
  }

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

  Future<void> submitWord() async {
    final rawWord = currentWord;
    final uid = localPlayerId;
    if (rawWord.isEmpty || phase != GamePhase.playing || uid == null) return;
    currentWord = '';
    status = '"$rawWord" doğrulanıyor…';
    notifyListeners();

    final word = normalizeTurkishWord(rawWord);
    if (word.characters.length < 2) return _reject('WORD_TOO_SHORT');
    if (!canBuildWord(word, letters)) return _reject('LETTERS_NOT_AVAILABLE');
    if (!developmentDictionary.contains(word)) return _reject('WORD_NOT_FOUND');
    if (remainingSeconds <= 0) return _reject('MATCH_NOT_ACTIVE');

    final points = scoreWord(word, _combo);
    final roomRef = _rooms.doc(roomCode);
    final claimRef = roomRef.collection('claimedWords').doc(word);
    final playerRef = roomRef.collection('players').doc(uid);
    try {
      await _firestore.runTransaction<void>((tx) async {
        final claimSnapshot = await tx.get(claimRef);
        if (claimSnapshot.exists) throw StateError('WORD_ALREADY_CLAIMED');
        final playerSnapshot = await tx.get(playerRef);
        final currentScore = (playerSnapshot.data()?['score'] as num?)?.toInt() ?? 0;
        tx.set(claimRef, <String, dynamic>{
          'playerId': uid,
          'points': points,
          'createdAt': FieldValue.serverTimestamp(),
        });
        tx.update(playerRef, <String, dynamic>{'score': currentScore + points, 'combo': _combo + 1});
      });
      _combo += 1;
      status = '+$points puan · $word';
      notifyListeners();
    } catch (exception) {
      _reject(_reason(exception));
    }
  }

  void _reject(String code) {
    status = _reason(code);
    notifyListeners();
  }

  void reset() {
    final uid = localPlayerId;
    if (uid != null && roomCode.isNotEmpty) {
      _rooms.doc(roomCode).collection('players').doc(uid).update({'connected': false}).catchError((Object _) {});
    }
    _clock?.cancel();
    _clock = null;
    _finishing = false;
    _roomSub?.cancel();
    _playersSub?.cancel();
    phase = GamePhase.home;
    roomCode = '';
    currentWord = '';
    letters = const [];
    players = const [];
    localPlayerId = null;
    _hostId = null;
    endsAt = null;
    error = null;
    status = 'Oda kur veya kodla katıl';
    notifyListeners();
  }

  void _fail(String message) {
    error = message;
    status = message;
    if (phase == GamePhase.connecting) phase = GamePhase.home;
    notifyListeners();
  }

  String _reason(Object codeOrError) {
    final code = codeOrError is StateError ? codeOrError.message : codeOrError.toString();
    return switch (code) {
      'ROOM_NOT_FOUND' => 'Oda bulunamadı',
      'ROOM_FULL' => 'Oda dolu',
      'ROOM_ALREADY_STARTED' => 'Maç başlamış',
      'WORD_TOO_SHORT' => 'Kelime çok kısa',
      'LETTERS_NOT_AVAILABLE' => 'Bu harfler havuzda yok',
      'WORD_NOT_FOUND' => 'Kelime sözlükte bulunamadı',
      'WORD_ALREADY_CLAIMED' => 'Bu kelime daha önce bulundu',
      'MATCH_NOT_ACTIVE' => 'Maç aktif değil',
      _ => code.contains('permission-denied') ? 'Bu kelime daha önce bulundu' : code,
    };
  }

  @override
  void dispose() {
    _clock?.cancel();
    _roomSub?.cancel();
    _playersSub?.cancel();
    super.dispose();
  }
}
