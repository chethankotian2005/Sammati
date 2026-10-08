import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/requests.dart';
import '../../core/requests_controller.dart';
import '../../l10n/generated/app_localizations.dart';
import '../../theme/app_theme.dart';
import '../../theme/tokens.dart';
import '../vault/vault_status.dart';

/// W12 your Sammati ID (N-01): the handle companies can address a request to. Registering is a signed message behind
/// one device-credential prompt; no phone number or email is ever asked for.
class SammatiIdScreen extends ConsumerStatefulWidget {
  const SammatiIdScreen({super.key});

  @override
  ConsumerState<SammatiIdScreen> createState() => _SammatiIdScreenState();
}

class _SammatiIdScreenState extends ConsumerState<SammatiIdScreen> {
  final _name = TextEditingController();
  bool _touched = false;
  bool _busy = false;
  RequestsProblem _problem = RequestsProblem.none;

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  bool get _valid => isValidHandleName(_name.text);

  Future<void> _register(AppLocalizations t) async {
    if (!_valid || _busy) return;
    setState(() {
      _busy = true;
      _problem = RequestsProblem.none;
    });
    final problem = await ref.read(identityProvider.notifier).register(_name.text, reason: t.auth_reason_id);
    if (!mounted) return;
    setState(() {
      _busy = false;
      _problem = problem;
      if (problem == RequestsProblem.none) {
        _name.clear();
        _touched = false;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final style = Theme.of(context).textTheme;
    final handle = ref.watch(identityProvider).value;
    final invalid = _touched && _name.text.isNotEmpty && !_valid;

    return Scaffold(
      appBar: AppBar(),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Semantics(header: true, child: Text(t.id_title, style: style.headlineSmall)),
          const SizedBox(height: 8),
          Text(t.id_explain, style: style.bodyLarge),
          const SizedBox(height: 16),
          DecoratedBox(
            decoration: BoxDecoration(
              color: SammatiColors.surface,
              borderRadius: BorderRadius.circular(SammatiRadius.row),
              border: Border.all(color: SammatiColors.line),
            ),
            child: ListTile(
              minTileHeight: 64,
              leading: const Icon(Icons.alternate_email),
              title: Text(handle ?? t.id_none, style: handle == null ? style.bodyLarge?.copyWith(color: SammatiColors.mute) : monoStyle(size: 18)),
              trailing: handle == null
                  ? null
                  : IconButton(
                      tooltip: t.copied,
                      icon: const Icon(Icons.copy),
                      onPressed: () async {
                        final messenger = ScaffoldMessenger.of(context);
                        await Clipboard.setData(ClipboardData(text: handle));
                        messenger.showSnackBar(SnackBar(content: Text(t.copied)));
                      },
                    ),
            ),
          ),
          const SizedBox(height: 24),
          TextField(
            controller: _name,
            enabled: !_busy,
            autocorrect: false,
            enableSuggestions: false,
            maxLength: 30,
            inputFormatters: [FilteringTextInputFormatter.allow(RegExp('[A-Za-z0-9._-]')), _Lower()],
            decoration: InputDecoration(
              labelText: t.id_choose,
              helperText: t.id_hint,
              helperMaxLines: 3,
              suffixText: sammatiSuffix,
              errorText: invalid ? t.id_invalid : null,
              errorMaxLines: 4,
              counterText: '',
            ),
            onChanged: (_) => setState(() => _touched = true),
          ),
          const SizedBox(height: 16),
          FilledButton(
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(56)),
            onPressed: _valid && !_busy ? () => _register(t) : null,
            child: Text(t.id_register),
          ),
          const SizedBox(height: 16),
          if (_busy) const Center(child: CircularProgressIndicator()),
          if (_problem != RequestsProblem.none)
            StatusLine(
              icon: Icons.error_outline,
              color: SammatiColors.block,
              text: switch (_problem) {
                RequestsProblem.taken => t.id_taken,
                RequestsProblem.authFailed => t.wallet_auth_failed,
                RequestsProblem.unreachable => t.error_unreachable,
                _ => t.error_generic,
              },
            ),
        ],
      ),
    );
  }
}

class _Lower extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(TextEditingValue oldValue, TextEditingValue newValue) => newValue.copyWith(text: newValue.text.toLowerCase());
}
