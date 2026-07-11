enum GamePhase { home, connecting, lobby, playing, results }

class PlayerView {
  const PlayerView({
    required this.id,
    required this.name,
    required this.score,
    required this.ready,
    required this.connected,
    required this.isHost,
  });

  factory PlayerView.fromJson(Map<String, dynamic> json) => PlayerView(
        id: json['id'] as String,
        name: json['name'] as String,
        score: (json['score'] as num).toInt(),
        ready: json['ready'] as bool,
        connected: json['connected'] as bool,
        isHost: json['isHost'] as bool,
      );

  final String id;
  final String name;
  final int score;
  final bool ready;
  final bool connected;
  final bool isHost;
}
