import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';

import '../../app/router.dart';
import '../../l10n/generated/app_localizations.dart';
import '../../theme/tokens.dart';
import '../shell/hash_text.dart';
import 'proof_sheet.dart';
import 'receipt_data.dart';

/// W4 confirmation: an animated stamp, then the receipt.
class ReceiptScreen extends StatelessWidget {
  const ReceiptScreen({super.key, required this.receipt});

  final ReceiptData receipt;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final style = Theme.of(context).textTheme;
    final language = Localizations.localeOf(context).languageCode;

    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: ListView(
                padding: const EdgeInsets.all(24),
                children: [
                  const SizedBox(height: 16),
                  Center(child: _Stamp(color: receipt.companyColor)),
                  const SizedBox(height: 24),
                  Text(t.recorded, textAlign: TextAlign.center, style: style.headlineMedium),
                  const SizedBox(height: 4),
                  Text(receipt.companyName, textAlign: TextAlign.center, style: style.bodyLarge),
                  const SizedBox(height: 24),
                  for (final item in receipt.items) ...[
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: SammatiColors.surface,
                        borderRadius: BorderRadius.circular(SammatiRadius.row),
                        border: Border.all(color: SammatiColors.line),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(item.title.forLanguage(language), style: style.titleMedium),
                          const SizedBox(height: 4),
                          Text(
                            t.receipt_expires(MaterialLocalizations.of(context).formatMediumDate(
                              DateTime.fromMillisecondsSinceEpoch(item.expiresAt * 1000),
                            )),
                            style: style.bodyMedium,
                          ),
                          const SizedBox(height: 8),
                          Text(t.receipt_tx, style: style.bodySmall),
                          HashText(item.txHash),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),
                  ],
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(16),
              child: SizedBox(
                width: double.infinity,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (receipt.items.isNotEmpty) ...[
                      OutlinedButton(
                        style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(56)),
                        onPressed: () => showConsentProofSheet(context, receipt.items.first.txHash),
                        child: Text(t.receipt_view_proof),
                      ),
                      const SizedBox(height: 8),
                    ],
                    FilledButton(
                      style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(56)),
                      onPressed: () => context.go(Routes.consents),
                      child: Text(t.done),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// The stamp lands with a short scale-in. Reduced motion shows it already in place (ui.md §7).
class _Stamp extends StatefulWidget {
  const _Stamp({required this.color});

  final Color color;

  @override
  State<_Stamp> createState() => _StampState();
}

class _StampState extends State<_Stamp> with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 450),
  );

  bool _started = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_started) return;
    _started = true;
    if (MediaQuery.disableAnimationsOf(context)) {
      _controller.value = 1;
    } else {
      _controller.forward().whenComplete(HapticFeedback.lightImpact);
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final curved = CurvedAnimation(parent: _controller, curve: Curves.easeOutBack);
    return ScaleTransition(
      scale: curved,
      child: FadeTransition(
        opacity: _controller,
        child: Container(
          width: 120,
          height: 120,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: SammatiColors.allow,
            border: Border.all(color: widget.color, width: 6),
          ),
          child: const Icon(Icons.check, size: 64, color: SammatiColors.surface),
        ),
      ),
    );
  }
}
