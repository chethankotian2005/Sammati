import 'package:flutter/material.dart';

import '../../theme/tokens.dart';

/// "No connection. Showing last known ..." strip (ui.md "Edge states"). Announced to screen readers.
class OfflineBanner extends StatelessWidget {
  const OfflineBanner({super.key, required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      liveRegion: true,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        color: SammatiColors.block,
        child: Row(
          children: [
            const Icon(Icons.wifi_off, size: 20, color: SammatiColors.surface),
            const SizedBox(width: 8),
            Expanded(
              child: Text(message, style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: SammatiColors.surface)),
            ),
          ],
        ),
      ),
    );
  }
}
