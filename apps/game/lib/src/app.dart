import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'game_controller.dart';
import 'models.dart';
import 'theme.dart';
import 'widgets.dart';

class WordRushApp extends StatefulWidget {
  const WordRushApp({super.key});

  @override
  State<WordRushApp> createState() => _WordRushAppState();
}

class _WordRushAppState extends State<WordRushApp> {
  late final GameController controller;

  @override
  void initState() {
    super.initState();
    controller = GameController();
  }

  @override
  void dispose() {
    controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => MaterialApp(
        debugShowCheckedModeBanner: false,
        title: 'Word Rush Arena',
        theme: buildAppTheme(Brightness.light),
        darkTheme: buildAppTheme(Brightness.dark),
        themeMode: ThemeMode.system,
        home: Builder(
          builder: (context) => Container(
            decoration: BoxDecoration(gradient: appBackgroundGradient(Theme.of(context).brightness)),
            child: SafeArea(
              child: Scaffold(
                backgroundColor: Colors.transparent,
                body: Center(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 620),
                    child: Padding(
                      padding: const EdgeInsets.all(20),
                      child: AnimatedBuilder(
                        animation: controller,
                        builder: (context, _) => AnimatedSwitcher(
                          duration: const Duration(milliseconds: 220),
                          child: switch (controller.phase) {
                            GamePhase.home => _Home(key: const ValueKey('home'), controller: controller),
                            GamePhase.connecting => const Center(
                                key: ValueKey('connecting'),
                                child: CircularProgressIndicator(),
                              ),
                            GamePhase.lobby => _Lobby(key: const ValueKey('lobby'), controller: controller),
                            GamePhase.playing => _Match(key: const ValueKey('match'), controller: controller),
                            GamePhase.results => _Results(key: const ValueKey('results'), controller: controller),
                          },
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      );
}

/// Decorative, non-interactive letter tiles used as a lightweight wordmark.
class _BrandTiles extends StatelessWidget {
  const _BrandTiles({required this.word});

  final String word;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (final letter in word.split(''))
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 3),
            child: Container(
              width: 40,
              height: 40,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: scheme.primary.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text(
                letter,
                style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18, color: scheme.primary),
              ),
            ),
          ),
      ],
    );
  }
}

/// A plain icon+label row for [FilledButton]/[OutlinedButton] children.
///
/// Avoids the `.icon()` factory constructors: their internal Flexible/ellipsis
/// layout can get stuck at zero width for the label the first time a custom
/// (web-loaded) font swaps in, leaving only the icon visible.
class _IconLabel extends StatelessWidget {
  const _IconLabel({required this.icon, required this.label});
  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) => Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, size: 20),
          const SizedBox(width: 10),
          Text(label),
        ],
      );
}

class _Home extends StatefulWidget {
  const _Home({super.key, required this.controller});
  final GameController controller;

  @override
  State<_Home> createState() => _HomeState();
}

class _HomeState extends State<_Home> {
  final name = TextEditingController();
  final code = TextEditingController();

  bool get validName => name.text.trim().length >= 2;

  @override
  void dispose() {
    name.dispose();
    code.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return ListView(
      children: [
        const SizedBox(height: 20),
        const Center(child: _BrandTiles(word: 'OYUN')),
        const SizedBox(height: 20),
        Text(
          'WORD RUSH',
          textAlign: TextAlign.center,
          style: theme.textTheme.displaySmall,
        ),
        Text(
          'ARENA',
          textAlign: TextAlign.center,
          style: theme.textTheme.displaySmall?.copyWith(color: theme.colorScheme.secondary),
        ),
        const SizedBox(height: 10),
        Text(
          '75 saniye. Aynı harfler. En hızlı kelime ustası kazanır.',
          textAlign: TextAlign.center,
          style: theme.textTheme.bodyLarge?.copyWith(color: theme.textTheme.bodyMedium?.color),
        ),
        const SizedBox(height: 28),
        SurfaceCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              TextField(
                controller: name,
                textInputAction: TextInputAction.next,
                maxLength: 20,
                onChanged: (_) => setState(() {}),
                decoration: const InputDecoration(labelText: 'Oyuncu adı', prefixIcon: Icon(Icons.person_outline)),
              ),
              const SizedBox(height: 6),
              SizedBox(
                height: 56,
                child: FilledButton(
                  onPressed: validName ? () => widget.controller.createRoom(name.text) : null,
                  child: const _IconLabel(icon: Icons.add_circle_outline, label: 'ODA KUR'),
                ),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 18),
                child: Row(
                  children: [
                    const Expanded(child: Divider()),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      child: Text('VEYA', style: theme.textTheme.labelLarge),
                    ),
                    const Expanded(child: Divider()),
                  ],
                ),
              ),
              TextField(
                controller: code,
                textCapitalization: TextCapitalization.characters,
                maxLength: 6,
                onChanged: (_) => setState(() {}),
                decoration: const InputDecoration(labelText: '6 karakterli oda kodu', prefixIcon: Icon(Icons.key)),
              ),
              const SizedBox(height: 6),
              SizedBox(
                height: 56,
                child: OutlinedButton(
                  onPressed: (validName && code.text.trim().length == 6)
                      ? () => widget.controller.joinRoom(name.text, code.text)
                      : null,
                  child: const _IconLabel(icon: Icons.login, label: 'KODLA KATIL'),
                ),
              ),
              if (widget.controller.error != null)
                Padding(
                  padding: const EdgeInsets.only(top: 14),
                  child: Text(
                    widget.controller.error!,
                    textAlign: TextAlign.center,
                    style: TextStyle(color: theme.colorScheme.error),
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}

class _Lobby extends StatelessWidget {
  const _Lobby({super.key, required this.controller});
  final GameController controller;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _TopBar(title: 'LOBİ', onExit: controller.reset),
        SurfaceCard(
          padding: const EdgeInsets.symmetric(vertical: 18, horizontal: 20),
          child: Column(
            children: [
              Text('ODA KODU', style: theme.textTheme.labelMedium),
              const SizedBox(height: 8),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    controller.roomCode,
                    style: theme.textTheme.displaySmall?.copyWith(letterSpacing: 6),
                  ),
                  const SizedBox(width: 4),
                  IconButton(
                    tooltip: 'Kodu kopyala',
                    onPressed: () => Clipboard.setData(ClipboardData(text: controller.roomCode)),
                    icon: const Icon(Icons.copy_rounded),
                  ),
                ],
              ),
              Text('Kodu arkadaşlarınla paylaş', style: theme.textTheme.bodyMedium),
            ],
          ),
        ),
        const SizedBox(height: 18),
        Expanded(
          child: ListView.separated(
            itemCount: controller.players.length,
            separatorBuilder: (_, __) => const SizedBox(height: 10),
            itemBuilder: (context, index) {
              final player = controller.players[index];
              return SurfaceCard(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                child: Row(
                  children: [
                    PlayerAvatar(name: player.name, index: index),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(player.name, style: theme.textTheme.titleMedium),
                          Text(
                            player.isHost
                                ? 'Oda sahibi'
                                : (player.connected ? 'Bağlı' : 'Bağlantı koptu'),
                            style: theme.textTheme.bodyMedium,
                          ),
                        ],
                      ),
                    ),
                    Icon(
                      player.ready ? Icons.check_circle_rounded : Icons.hourglass_bottom_rounded,
                      color: player.ready ? const Color(0xFF31B37A) : theme.textTheme.bodyMedium?.color,
                    ),
                  ],
                ),
              );
            },
          ),
        ),
        const SizedBox(height: 12),
        Text(controller.status, textAlign: TextAlign.center, style: theme.textTheme.bodyMedium),
        const SizedBox(height: 12),
        SizedBox(
          height: 56,
          child: FilledButton(onPressed: () => controller.setReady(true), child: const Text('HAZIRIM')),
        ),
        if (controller.localPlayerIsHost)
          Padding(
            padding: const EdgeInsets.only(top: 10),
            child: SizedBox(
              height: 56,
              child: OutlinedButton(
                onPressed: controller.canStart ? controller.startMatch : null,
                child: const Text('MAÇI BAŞLAT'),
              ),
            ),
          ),
      ],
    );
  }
}

class _Match extends StatelessWidget {
  const _Match({super.key, required this.controller});
  final GameController controller;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final leader = controller.players.isEmpty ? null : controller.players.first;
    return LayoutBuilder(
      builder: (context, constraints) {
        final columns = constraints.maxWidth > 520 ? 6 : 4;
        return Column(
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                TimerPill(seconds: controller.remainingSeconds, totalSeconds: 75),
                if (leader != null)
                  SurfaceCard(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(Icons.emoji_events_rounded, size: 18, color: AppColors.gold),
                        const SizedBox(width: 6),
                        Text('${leader.score}', style: theme.textTheme.titleMedium),
                      ],
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 12),
            SizedBox(
              height: 44,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: controller.players.length,
                separatorBuilder: (_, __) => const SizedBox(width: 8),
                itemBuilder: (_, index) {
                  final player = controller.players[index];
                  final isSelf = player.id == controller.localPlayerId;
                  return Chip(
                    label: Text('${player.name}  ${player.score}'),
                    backgroundColor: isSelf ? theme.colorScheme.primary.withValues(alpha: 0.14) : null,
                    side: BorderSide(color: isSelf ? theme.colorScheme.primary : Colors.transparent),
                  );
                },
              ),
            ),
            const SizedBox(height: 16),
            Expanded(
              child: GridView.builder(
                gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: columns,
                  mainAxisSpacing: 10,
                  crossAxisSpacing: 10,
                ),
                itemCount: controller.letters.length,
                itemBuilder: (_, index) {
                  final letter = controller.letters[index];
                  return LetterTile(letter: letter, onTap: () => controller.selectLetter(letter));
                },
              ),
            ),
            const SizedBox(height: 12),
            SurfaceCard(
              padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 8),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      controller.currentWord.isEmpty ? 'Harfleri seç' : controller.currentWord,
                      style: theme.textTheme.headlineSmall?.copyWith(letterSpacing: 2),
                    ),
                  ),
                  IconButton(
                    onPressed: controller.backspace,
                    tooltip: 'Son harfi sil',
                    icon: const Icon(Icons.backspace_outlined),
                  ),
                  IconButton(
                    onPressed: controller.clearWord,
                    tooltip: 'Temizle',
                    icon: const Icon(Icons.clear),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 8),
            Text(controller.status, maxLines: 1, overflow: TextOverflow.ellipsis, style: theme.textTheme.bodyMedium),
            const SizedBox(height: 8),
            SizedBox(
              height: 56,
              width: double.infinity,
              child: FilledButton(
                onPressed: controller.currentWord.isEmpty ? null : controller.submitWord,
                child: const Text('KELİMEYİ GÖNDER'),
              ),
            ),
          ],
        );
      },
    );
  }
}

class _Results extends StatelessWidget {
  const _Results({super.key, required this.controller});
  final GameController controller;

  static const _medals = ['🥇', '🥈', '🥉'];

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final players = controller.players;
    return Column(
      children: [
        const Spacer(),
        const Icon(Icons.emoji_events_rounded, size: 72, color: AppColors.gold),
        const SizedBox(height: 16),
        Text(
          players.isEmpty ? 'Tur tamamlandı' : '${players.first.name} kazandı!',
          style: theme.textTheme.headlineSmall,
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 24),
        for (final entry in players.asMap().entries)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: SurfaceCard(
              padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
              child: Row(
                children: [
                  SizedBox(
                    width: 32,
                    child: Text(
                      entry.key < _medals.length ? _medals[entry.key] : '${entry.key + 1}',
                      style: theme.textTheme.titleLarge,
                      textAlign: TextAlign.center,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(child: Text(entry.value.name, style: theme.textTheme.titleMedium)),
                  Text('${entry.value.score}', style: theme.textTheme.titleLarge),
                ],
              ),
            ),
          ),
        const Spacer(),
        SizedBox(
          height: 56,
          width: double.infinity,
          child: FilledButton(onPressed: controller.reset, child: const Text('ANA MENÜ')),
        ),
      ],
    );
  }
}

class _TopBar extends StatelessWidget {
  const _TopBar({required this.title, required this.onExit});
  final String title;
  final VoidCallback onExit;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 16),
        child: Row(
          children: [
            IconButton(onPressed: onExit, tooltip: 'Odadan çık', icon: const Icon(Icons.close)),
            Expanded(
              child: Text(
                title,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.titleLarge,
              ),
            ),
            const SizedBox(width: 48),
          ],
        ),
      );
}
