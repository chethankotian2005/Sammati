import 'package:flutter/material.dart';

import '../../core/consents.dart';
import '../../l10n/generated/app_localizations.dart';
import '../../theme/tokens.dart';

const _secondsPerDay = 86400;
// Past two months a count of days stops being readable; the notice uses the same cut-off.
const _monthsThresholdDays = 60;

/// "Expires in 5 months" for an active consent, "Expired 3 days ago, give consent again"
/// for an expired one (ui.md "Edge states"), nothing for a withdrawn one.
String? expiryLine(AppLocalizations t, ConsentView consent, DateTime now) {
  final expiry = consent.expiresAt;
  if (expiry == null) return null;
  final nowSeconds = now.millisecondsSinceEpoch ~/ 1000;

  switch (consent.stateAt(now)) {
    case ConsentState.withdrawn:
      return null;
    case ConsentState.expired:
      return t.expired_ago((nowSeconds - expiry) ~/ _secondsPerDay);
    case ConsentState.active:
      return _expiresIn(t, expiry - nowSeconds);
  }
}

/// Same wording for a whole pass: the soonest expiry among its active purposes.
String? passExpiryLine(AppLocalizations t, CompanyConsents company, DateTime now) {
  final expiry = company.nextExpiry(now);
  if (expiry == null) return null;
  return _expiresIn(t, expiry - now.millisecondsSinceEpoch ~/ 1000);
}

String _expiresIn(AppLocalizations t, int seconds) {
  final days = (seconds / _secondsPerDay).ceil().clamp(1, 1 << 30);
  if (days < _monthsThresholdDays) return t.expires_in_days(days);
  return t.expires_in_months((days / 30.4375).round());
}

/// Status never relies on colour alone: every state has a label and an icon (ui.md §7).
class StatusChip extends StatelessWidget {
  const StatusChip({super.key, required this.state, this.onDark = false});

  final ConsentState state;

  /// Draws on a white pill so it stays legible on a coloured pass header.
  final bool onDark;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final (label, icon, color) = switch (state) {
      ConsentState.active => (t.status_active, Icons.check_circle, SammatiColors.allow),
      ConsentState.expired => (t.status_expired, Icons.schedule, SammatiColors.mute),
      ConsentState.withdrawn => (t.status_withdrawn, Icons.block, SammatiColors.block),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: onDark ? SammatiColors.surface : color.withValues(alpha: 0.1),
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
