import 'package:flutter/material.dart';

import '../../l10n/generated/app_localizations.dart';
import '../shell/empty_state.dart';

/// W1 home. Company passes arrive with W-04; until then only the empty state.
class ConsentsScreen extends StatelessWidget {
  const ConsentsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(t.nav_consents)),
      body: EmptyState(icon: Icons.verified_user_outlined, message: t.consents_empty),
    );
  }
}
