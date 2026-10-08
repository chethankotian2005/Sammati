import 'package:flutter/material.dart';

import '../../l10n/generated/app_localizations.dart';
import '../../theme/tokens.dart';

/// Logo only (ui.md W0). Shown while the router waits for the wallet check.
class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: SammatiColors.ink,
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.verified_user, size: 64, color: SammatiColors.marigold),
            const SizedBox(height: 16),
            Text(
              AppLocalizations.of(context).appName,
              style: Theme.of(context).textTheme.headlineMedium?.copyWith(color: SammatiColors.surface),
            ),
          ],
        ),
      ),
    );
  }
}
