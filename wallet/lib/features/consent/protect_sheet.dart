import 'package:flutter/material.dart';

import '../../l10n/generated/app_localizations.dart';
import '../../theme/tokens.dart';

/// "How this protects you" (L-02, ui.md W3). Four plain points that are each true of the build, then a
/// note that this is a prototype aligned with the principles of the law, not legal advice or a certification.
/// It deliberately claims nothing that `docs/dpdp-mapping.md` marks VERIFY: no section numbers, and never
/// "compliant" or "certified".
class ProtectLink extends StatelessWidget {
  const ProtectLink({super.key});

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    return TextButton.icon(
      style: TextButton.styleFrom(minimumSize: const Size(48, 48)),
      icon: const Icon(Icons.shield_outlined, size: 20),
      label: Text(t.protect_link),
      onPressed: () => showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        showDragHandle: true,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(SammatiRadius.pass)),
        ),
        // Hindi and Kannada run longer than English, so the sheet scrolls rather than clips.
        builder: (_) => const _ProtectSheet(),
      ),
    );
  }
}

class _ProtectSheet extends StatelessWidget {
  const _ProtectSheet();

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final style = Theme.of(context).textTheme;
    final points = [t.protect_1, t.protect_2, t.protect_3, t.protect_4];
    return SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.85),
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(24, 0, 24, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(t.protect_link, style: style.titleLarge),
              const SizedBox(height: 16),
              for (final point in points)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Padding(
                        padding: EdgeInsets.only(top: 2),
                        child: Icon(Icons.check_circle, size: 20, color: SammatiColors.allow),
                      ),
                      const SizedBox(width: 12),
                      Expanded(child: Text(point, style: style.bodyLarge)),
                    ],
                  ),
                ),
              const Divider(height: 32),
              Text(t.protect_note, style: style.bodyMedium?.copyWith(color: SammatiColors.mute)),
            ],
          ),
        ),
      ),
    );
  }
}
