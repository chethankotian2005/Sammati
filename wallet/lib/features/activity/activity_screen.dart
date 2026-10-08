import 'package:flutter/material.dart';

import '../../l10n/generated/app_localizations.dart';
import '../shell/empty_state.dart';

/// W6 activity. The live feed arrives with W-06; until then only the empty state.
class ActivityScreen extends StatelessWidget {
  const ActivityScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(t.nav_activity)),
      body: EmptyState(icon: Icons.bolt_outlined, message: t.activity_empty),
    );
  }
}
