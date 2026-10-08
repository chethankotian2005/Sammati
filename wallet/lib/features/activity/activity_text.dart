import 'package:flutter/material.dart';

import '../../core/activity.dart';
import '../../core/consents.dart';
import '../../l10n/generated/app_localizations.dart';
import '../../theme/tokens.dart';

/// "Just now", "2 s ago", "5 min ago", "3 h ago", "2 d ago".
String relativeTime(AppLocalizations t, int atSeconds, DateTime now) {
  final seconds = now.millisecondsSinceEpoch ~/ 1000 - atSeconds;
  if (seconds < 1) return t.time_now; // also covers a Core clock a little ahead of the phone's
  if (seconds < 60) return t.time_seconds(seconds);
  if (seconds < 3600) return t.time_minutes(seconds ~/ 60);
  if (seconds < 86400) return t.time_hours(seconds ~/ 3600);
  return t.time_days(seconds ~/ 86400);
}

/// Text for the five reason codes (AGENTS.md); `OK` and anything unknown need no explanation.
String? reasonText(AppLocalizations t, String reason) => switch (reason) {
      'CONSENT_WITHDRAWN' => t.reason_consent_withdrawn,
      'CONSENT_EXPIRED' => t.reason_consent_expired,
      'NO_CONSENT' => t.reason_no_consent,
      'LEDGER_UNAVAILABLE' => t.reason_ledger_unavailable,
      'NO_PRINCIPAL' => t.reason_no_principal,
      _ => null,
    };

/// The purpose's title in the user's language, from the consents the wallet already holds.
/// A purpose the wallet has no consent for (e.g. a BLOCKED NO_CONSENT row) falls back to its code.
String purposeTitle(ConsentsSnapshot? snapshot, ActivityItem item, String language) {
  final company = snapshot?.company(item.fiduciary);
  if (company != null) {
    for (final consent in company.consents) {
      if (consent.code == item.purposeCode) return consent.title.forLanguage(language);
    }
  }
  final words = item.purposeCode.replaceAll('_', ' ');
  return words.isEmpty ? words : words[0].toUpperCase() + words.substring(1);
}

/// ALLOWED or BLOCKED: text and icon as well as colour (ui.md §7).
class DecisionChip extends StatelessWidget {
  const DecisionChip({super.key, required this.decision});

  final Decision decision;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final (label, icon, color) = switch (decision) {
      Decision.allowed => (t.allowed, Icons.check_circle, SammatiColors.allow),
      Decision.blocked => (t.blocked, Icons.block, SammatiColors.block),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(SammatiRadius.pill),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 16, color: color),
          const SizedBox(width: 4),
          Text(label, style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: color, fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }
}
