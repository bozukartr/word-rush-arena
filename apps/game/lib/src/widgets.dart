import 'package:flutter/material.dart';

import 'theme.dart';

/// A Scrabble-tile-style key with tactile press feedback. Feedback starts on
/// pointer-down so it renders on the next frame, independent of any network
/// round-trip.
class LetterTile extends StatefulWidget {
  const LetterTile({super.key, required this.letter, required this.onTap});

  final String letter;
  final VoidCallback onTap;

  @override
  State<LetterTile> createState() => _LetterTileState();
}

class _LetterTileState extends State<LetterTile> {
  bool _pressed = false;

  void _setPressed(bool value) {
    if (_pressed == value) return;
    setState(() => _pressed = value);
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Semantics(
      button: true,
      label: '${widget.letter} harfi',
      child: GestureDetector(
        onTapDown: (_) => _setPressed(true),
        onTapCancel: () => _setPressed(false),
        onTapUp: (_) => _setPressed(false),
        onTap: widget.onTap,
        child: AnimatedScale(
          scale: _pressed ? 0.9 : 1,
          duration: const Duration(milliseconds: 80),
          curve: Curves.easeOut,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 80),
            decoration: BoxDecoration(
              color: scheme.surface,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(
                color: _pressed ? scheme.primary : (isDark ? AppColors.darkBorder : AppColors.lightBorder),
                width: _pressed ? 2 : 1.4,
              ),
              boxShadow: _pressed
                  ? const []
                  : [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: isDark ? 0.24 : 0.06),
                        blurRadius: 8,
                        offset: const Offset(0, 3),
                      ),
                    ],
            ),
            child: Center(
              child: Text(
                widget.letter,
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Small circular initials badge used for player rows.
class PlayerAvatar extends StatelessWidget {
  const PlayerAvatar({super.key, required this.name, required this.index});

  final String name;
  final int index;

  static const _palette = [AppColors.indigo, AppColors.gold, Color(0xFF31B37A), Color(0xFFE5636B)];

  @override
  Widget build(BuildContext context) {
    final initial = name.trim().isEmpty ? '?' : name.trim().characters.first.toUpperCase();
    return CircleAvatar(
      radius: 22,
      backgroundColor: _palette[index % _palette.length].withValues(alpha: 0.18),
      foregroundColor: _palette[index % _palette.length],
      child: Text(initial, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
    );
  }
}

/// A rounded pill used for the match countdown, tinting red as time runs low.
class TimerPill extends StatelessWidget {
  const TimerPill({super.key, required this.seconds, required this.totalSeconds});

  final int seconds;
  final int totalSeconds;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final urgent = totalSeconds > 0 && seconds <= (totalSeconds * 0.2).ceil();
    final color = urgent ? scheme.error : scheme.primary;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 10),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.timer_outlined, size: 18, color: color),
          const SizedBox(width: 6),
          Text(
            '$seconds sn',
            style: TextStyle(fontWeight: FontWeight.w700, color: color, fontSize: 16),
          ),
        ],
      ),
    );
  }
}

/// A bordered card surface consistent with the rest of the design system.
class SurfaceCard extends StatelessWidget {
  const SurfaceCard({super.key, required this.child, this.padding = const EdgeInsets.all(20)});

  final Widget child;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      padding: padding,
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: isDark ? AppColors.darkBorder : AppColors.lightBorder),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: isDark ? 0.28 : 0.05),
            blurRadius: 24,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: child,
    );
  }
}
