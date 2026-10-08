import 'package:flutter/material.dart';

import '../../theme/tokens.dart';

class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.icon, required this.message, this.action});

  final IconData icon;
  final String message;

  /// An optional button under the message, e.g. a retry.
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 48, color: SammatiColors.mute),
            const SizedBox(height: 16),
            Text(message, textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodyLarge),
            if (action != null) ...[const SizedBox(height: 24), action!],
          ],
        ),
      ),
    );
  }
}
