import 'package:flutter/material.dart';

import '../../core/activity.dart';
import '../../core/consents.dart';
import '../../core/data_categories.dart';
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

/// A category's name inside a sentence: lower case, except an acronym like PAN (W-18).
String _categoryName(String language, String id) {
  final c = categoryById(id);
  if (c == null) return id;
  final label = c.label.forLanguage(language);
  return RegExp('[A-Z]{2}').hasMatch(label) ? label : label.toLowerCase();
}

/// "PAN and yearly income", "PAN, yearly income and type of work", in the app's language (W-18).
String categoriesText(BuildContext context, List<String> ids) {
  final t = AppLocalizations.of(context);
  final language = Localizations.localeOf(context).languageCode;
  final names = [for (final id in ids) _categoryName(language, id)];
  if (names.length < 2) return names.join();
  return t.list_and(names.sublist(0, names.length - 1).join(', '), names.last);
}

/// The decision label that left the Processor, in the app's language; anything else is shown as it is.
String outcomeText(AppLocalizations t, String outcome) => switch (outcome) {
      'approved' => t.outcome_approved,
      'declined' => t.outcome_declined,
      _ => outcome,
    };

/// "QuickLoan used your PAN and yearly income for the credit check. Decision shared: approved." (W-18). Null when the
/// entry says nothing about data, so the row keeps its ordinary wording.
String? dataUseSentence(BuildContext context, ActivityItem item, String purpose) {
  final t = AppLocalizations.of(context);
  if (!item.isDataUse) return null;
  if (item.decision == Decision.blocked) return t.activity_used_blocked(item.fiduciaryName, purpose);
  final ids = item.dataCategories ?? const <String>[];
  if (ids.isEmpty) return null;
  return t.activity_used(item.fiduciaryName, categoriesText(context, ids), purpose, outcomeText(t, item.outcome!));
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
