import 'package:flutter/material.dart';

import 'game_controller.dart';
import 'models.dart';

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
        theme: ThemeData(
          colorScheme: ColorScheme.fromSeed(
            seedColor: const Color(0xFF7657FF),
            brightness: Brightness.dark,
          ),
          scaffoldBackgroundColor: const Color(0xFF0B0D18),
          useMaterial3: true,
          inputDecorationTheme: const InputDecorationTheme(
            filled: true,
            border: OutlineInputBorder(
              borderRadius: BorderRadius.all(Radius.circular(16)),
            ),
          ),
        ),
        home: AnimatedBuilder(
          animation: controller,
          builder: (context, _) => SafeArea(
            child: Scaffold(
              body: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 620),
                  child: Padding(
                    padding: const EdgeInsets.all(20),
                    child: switch (controller.phase) {
                      GamePhase.home => _Home(controller: controller),
                      GamePhase.connecting => const Center(child: CircularProgressIndicator()),
                      GamePhase.lobby => _Lobby(controller: controller),
                      GamePhase.playing => _Match(controller: controller),
                      GamePhase.results => _Results(controller: controller),
                    },
                  ),
                ),
              ),
            ),
          ),
        ),
      );
}

class _Home extends StatefulWidget {
  const _Home({required this.controller});
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
  Widget build(BuildContext context) => ListView(
        children: [
          const SizedBox(height: 32),
          Text('WORD RUSH', style: Theme.of(context).textTheme.displaySmall?.copyWith(fontWeight: FontWeight.w900)),
          Text('ARENA', style: Theme.of(context).textTheme.displaySmall?.copyWith(color: const Color(0xFFFFC857), fontWeight: FontWeight.w900)),
          const SizedBox(height: 12),
          Text('75 saniye. Aynı harfler. En hızlı kelime ustası kazanır.', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 32),
          TextField(controller: name, textInputAction: TextInputAction.next, maxLength: 20, decoration: const InputDecoration(labelText: 'Oyuncu adı', prefixIcon: Icon(Icons.person_outline))),
          const SizedBox(height: 12),
          SizedBox(height: 56, child: FilledButton.icon(onPressed: () { if (validName) widget.controller.createRoom(name.text); }, icon: const Icon(Icons.add_circle_outline), label: const Text('ODA KUR'))),
          const Padding(padding: EdgeInsets.symmetric(vertical: 20), child: Row(children: [Expanded(child: Divider()), Padding(padding: EdgeInsets.symmetric(horizontal: 12), child: Text('VEYA')), Expanded(child: Divider())])),
          TextField(controller: code, textCapitalization: TextCapitalization.characters, maxLength: 6, decoration: const InputDecoration(labelText: '6 karakterli oda kodu', prefixIcon: Icon(Icons.key))),
          const SizedBox(height: 8),
          SizedBox(height: 56, child: OutlinedButton.icon(onPressed: () { if (validName && code.text.trim().length == 6) widget.controller.joinRoom(name.text, code.text); }, icon: const Icon(Icons.login), label: const Text('KODLA KATIL'))),
          if (widget.controller.error != null) Padding(padding: const EdgeInsets.only(top: 16), child: Text(widget.controller.error!, style: TextStyle(color: Theme.of(context).colorScheme.error))),
        ],
      );
}

class _Lobby extends StatelessWidget {
  const _Lobby({required this.controller});
  final GameController controller;

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _TopBar(title: 'ODA ${controller.roomCode}', onExit: controller.reset),
          Text('Kodu arkadaşlarınla paylaş', textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodyLarge),
          const SizedBox(height: 24),
          Expanded(child: ListView.separated(itemCount: controller.players.length, separatorBuilder: (_, __) => const SizedBox(height: 8), itemBuilder: (context, index) { final player = controller.players[index]; return Card(child: ListTile(minTileHeight: 64, leading: CircleAvatar(child: Text('${index + 1}')), title: Text(player.name), subtitle: Text(player.isHost ? 'Oda sahibi' : (player.connected ? 'Bağlı' : 'Bağlantı koptu')), trailing: Icon(player.ready ? Icons.check_circle : Icons.hourglass_bottom, color: player.ready ? Colors.greenAccent : null))); })),
          Text(controller.status, textAlign: TextAlign.center),
          const SizedBox(height: 12),
          SizedBox(height: 56, child: FilledButton(onPressed: () => controller.setReady(true), child: const Text('HAZIRIM'))),
          if (controller.localPlayerIsHost) Padding(padding: const EdgeInsets.only(top: 10), child: SizedBox(height: 56, child: OutlinedButton(onPressed: controller.canStart ? controller.startMatch : null, child: const Text('MAÇI BAŞLAT')))),
        ],
      );
}

class _Match extends StatelessWidget {
  const _Match({required this.controller});
  final GameController controller;

  @override
  Widget build(BuildContext context) => LayoutBuilder(builder: (context, constraints) {
        final columns = constraints.maxWidth > 520 ? 6 : 4;
        return Column(children: [
          Row(children: [Expanded(child: _Metric(label: 'SÜRE', value: '${controller.remainingSeconds}')), const SizedBox(width: 10), Expanded(child: _Metric(label: 'LİDER', value: controller.players.isEmpty ? '—' : '${controller.players.first.score}'))]),
          const SizedBox(height: 12),
          SizedBox(height: 48, child: ListView.separated(scrollDirection: Axis.horizontal, itemCount: controller.players.length, separatorBuilder: (_, __) => const SizedBox(width: 8), itemBuilder: (_, index) { final player = controller.players[index]; return Chip(label: Text('${player.name}  ${player.score}')); })),
          const SizedBox(height: 12),
          Expanded(child: GridView.builder(gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: columns, mainAxisSpacing: 10, crossAxisSpacing: 10), itemCount: controller.letters.length, itemBuilder: (_, index) { final letter = controller.letters[index]; return Semantics(button: true, label: '$letter harfi', child: InkWell(borderRadius: BorderRadius.circular(18), onTap: () => controller.selectLetter(letter), child: Ink(decoration: BoxDecoration(color: const Color(0xFF242844), borderRadius: BorderRadius.circular(18), border: Border.all(color: const Color(0xFF7657FF), width: 2)), child: Center(child: Text(letter, style: Theme.of(context).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w900))))); })),
          Container(minHeight: 64, padding: const EdgeInsets.all(14), decoration: BoxDecoration(color: const Color(0xFF171A2C), borderRadius: BorderRadius.circular(18)), child: Row(children: [Expanded(child: Text(controller.currentWord.isEmpty ? 'Harfleri seç' : controller.currentWord, style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.bold))), IconButton(onPressed: controller.backspace, tooltip: 'Son harfi sil', icon: const Icon(Icons.backspace_outlined)), IconButton(onPressed: controller.clearWord, tooltip: 'Temizle', icon: const Icon(Icons.clear))])),
          const SizedBox(height: 8),
          Text(controller.status, maxLines: 1, overflow: TextOverflow.ellipsis),
          const SizedBox(height: 8),
          SizedBox(height: 60, width: double.infinity, child: FilledButton(onPressed: controller.currentWord.isEmpty ? null : controller.submitWord, child: const Text('KELİMEYİ GÖNDER'))),
        ]);
      });
}

class _Results extends StatelessWidget {
  const _Results({required this.controller});
  final GameController controller;
  @override
  Widget build(BuildContext context) => Column(children: [
        const Spacer(),
        const Icon(Icons.emoji_events, size: 88, color: Color(0xFFFFC857)),
        const SizedBox(height: 20),
        Text(controller.players.isEmpty ? 'Tur tamamlandı' : '${controller.players.first.name} kazandı!', style: Theme.of(context).textTheme.headlineMedium, textAlign: TextAlign.center),
        const SizedBox(height: 24),
        ...controller.players.asMap().entries.map((entry) => ListTile(leading: CircleAvatar(child: Text('${entry.key + 1}')), title: Text(entry.value.name), trailing: Text('${entry.value.score}', style: Theme.of(context).textTheme.titleLarge))),
        const Spacer(),
        SizedBox(height: 56, width: double.infinity, child: FilledButton(onPressed: controller.reset, child: const Text('ANA MENÜ'))),
      ]);
}

class _TopBar extends StatelessWidget {
  const _TopBar({required this.title, required this.onExit});
  final String title;
  final VoidCallback onExit;
  @override
  Widget build(BuildContext context) => Padding(padding: const EdgeInsets.only(bottom: 16), child: Row(children: [IconButton(onPressed: onExit, tooltip: 'Odadan çık', icon: const Icon(Icons.close)), Expanded(child: Text(title, textAlign: TextAlign.center, style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold))), const SizedBox(width: 48)]));
}

class _Metric extends StatelessWidget {
  const _Metric({required this.label, required this.value});
  final String label;
  final String value;
  @override
  Widget build(BuildContext context) => Container(padding: const EdgeInsets.all(14), decoration: BoxDecoration(color: const Color(0xFF171A2C), borderRadius: BorderRadius.circular(18)), child: Column(children: [Text(label, style: Theme.of(context).textTheme.labelMedium), Text(value, style: Theme.of(context).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w900))]));
}
