import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/wallet_providers.dart';
import '../../core/wallet_service.dart';
import '../../l10n/generated/app_localizations.dart';
import '../../theme/tokens.dart';

/// Last onboarding step: the key is created only after the device credential check.
/// On success the router sees the new address and moves to the home screen.
class CreateWalletScreen extends ConsumerStatefulWidget {
  const CreateWalletScreen({super.key});

  @override
  ConsumerState<CreateWalletScreen> createState() => _CreateWalletScreenState();
}

class _CreateWalletScreenState extends ConsumerState<CreateWalletScreen> {
  bool _busy = false;
  WalletFailure? _failure;

  Future<void> _create() async {
    final reason = AppLocalizations.of(context).auth_reason_create;
    setState(() {
      _busy = true;
      _failure = null;
    });
    try {
      await ref.read(walletAddressProvider.notifier).create(reason: reason);
    } on WalletException catch (e) {
      if (mounted) setState(() => _failure = e.failure);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  String? _message(AppLocalizations t) => switch (_failure) {
        null => null,
        WalletFailure.noDeviceLock => t.wallet_no_lock,
        WalletFailure.authFailed => t.wallet_auth_failed,
        WalletFailure.notCreated || WalletFailure.storageFailed => t.wallet_create_failed,
      };

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final message = _message(t);
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Spacer(),
              const Icon(Icons.fingerprint, size: 72, color: SammatiColors.ink),
              const SizedBox(height: 24),
              Text(t.wallet_create_title, style: Theme.of(context).textTheme.headlineMedium),
              const SizedBox(height: 12),
              Text(t.wallet_create_body, style: Theme.of(context).textTheme.bodyLarge),
              if (message != null) ...[
                const SizedBox(height: 16),
                Semantics(
                  liveRegion: true,
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Icon(Icons.error_outline, size: 20, color: SammatiColors.block),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(message, style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: SammatiColors.block)),
                      ),
                    ],
                  ),
                ),
              ],
              const Spacer(),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(56)),
                  onPressed: _busy ? null : _create,
                  child: _busy
                      ? const SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 3))
                      : Text(t.wallet_create_button),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
