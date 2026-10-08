import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/core_api.dart';
import '../../core/consent_providers.dart';
import '../../core/data_categories.dart';
import '../../core/preferences.dart';
import '../../core/profile_controller.dart';
import '../../core/requests.dart';
import '../../core/requests_controller.dart';
import '../../core/wallet_providers.dart';
import '../../core/wallet_service.dart';
import '../../l10n/generated/app_localizations.dart';
import '../../theme/tokens.dart';
import '../profile/profile_field_input.dart';
import '../vault/vault_status.dart';

enum _Availability { idle, checking, available, taken, invalid, unreachable }

/// W14 create account (W-15): choose a Sammati ID, secure the phone, fill in the profile. The wallet key is created in
/// step 2 and nothing exists before it. The router keeps a wallet that has not finished here until it has (or skipped).
class CreateAccountScreen extends ConsumerStatefulWidget {
  const CreateAccountScreen({super.key});

  @override
  ConsumerState<CreateAccountScreen> createState() => _CreateAccountScreenState();
}

class _CreateAccountScreenState extends ConsumerState<CreateAccountScreen> {
  late int _step = ref.read(walletAddressProvider).value != null ? 3 : 1;
  final _name = TextEditingController();
  Timer? _debounce;
  _Availability _availability = _Availability.idle;

  /// The bare name chosen in step 1; null for "Choose later".
  String? _chosen;
  bool _busy = false;
  WalletFailure? _walletFailure;
  RequestsProblem _registerProblem = RequestsProblem.none;
  bool _walletReady = false;

  /// The profile as typed in step 3: field to value, `null` while a field is invalid.
  final Map<String, String?> _values = {};

  @override
  void dispose() {
    _debounce?.cancel();
    _name.dispose();
    super.dispose();
  }

  bool get _walletExists => _walletReady || ref.read(walletAddressProvider).value != null;

  // ------------------------------------------------------------ step 1

  void _onNameChanged(String value) {
    _debounce?.cancel();
    if (value.isEmpty) {
      setState(() => _availability = _Availability.idle);
      return;
    }
    if (!isValidHandleName(value)) {
      setState(() => _availability = _Availability.invalid);
      return;
    }
    setState(() => _availability = _Availability.checking);
    _debounce = Timer(const Duration(milliseconds: 400), () => _check(value));
  }

  Future<void> _check(String name) async {
    try {
      final free = await ref.read(coreApiFactoryProvider)(ref.read(coreUrlProvider)).handleAvailable('${name.toLowerCase()}$sammatiSuffix', principal: ref.read(walletAddressProvider).value);
      if (!mounted || _name.text != name) return; // a newer keystroke owns the answer
      setState(() => _availability = free ? _Availability.available : _Availability.taken);
    } on CoreException {
      if (mounted && _name.text == name) setState(() => _availability = _Availability.unreachable);
    }
  }

  void _chooseId(String? name) => setState(() {
        _chosen = name;
        _step = 2;
        _registerProblem = RequestsProblem.none;
        _walletFailure = null;
      });

  // ------------------------------------------------------------ step 2

  Future<void> _secure(AppLocalizations t) async {
    setState(() {
      _busy = true;
      _walletFailure = null;
      _registerProblem = RequestsProblem.none;
    });
    try {
      if (!_walletExists) {
        await ref.read(walletAddressProvider.notifier).create(reason: t.auth_reason_create);
        _walletReady = true;
      }
    } on WalletException catch (e) {
      if (mounted) setState(() {
          _walletFailure = e.failure;
          _busy = false;
        });
      return;
    }
    await _register(t);
  }

  Future<void> _register(AppLocalizations t) async {
    final name = _chosen;
    var problem = RequestsProblem.none;
    if (name != null) {
      if (!_busy) setState(() => _busy = true);
      problem = await ref.read(identityProvider.notifier).register(name, reason: t.auth_reason_id);
    }
    if (!mounted) return;
    setState(() {
      _busy = false;
      _registerProblem = problem;
      if (problem == RequestsProblem.none) _step = 3;
    });
  }

  // ------------------------------------------------------------ step 3

  bool get _formValid => _values.values.every((v) => v != null);

  Future<void> _finish({required bool save}) async {
    setState(() => _busy = true);
    if (save) {
      await ref.read(profileProvider.notifier).start({
        for (final e in _values.entries)
          if (e.value != null && e.value!.isNotEmpty) e.key: e.value!,
      });
    }
    await ref.read(accountSetupDoneProvider.notifier).finish();
  }

  // ------------------------------------------------------------ build

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final style = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(
        leading: _step == 2 && !_walletExists
            ? BackButton(onPressed: () => setState(() => _step = 1))
            : null,
        automaticallyImplyLeading: false,
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(24),
          children: [
            Semantics(
              label: t.acct_step(_step),
              child: Row(children: [
                for (var i = 1; i <= 3; i++) ...[
                  Expanded(child: Container(height: 4, decoration: BoxDecoration(color: i <= _step ? SammatiColors.ink : SammatiColors.line, borderRadius: BorderRadius.circular(2)))),
                  if (i < 3) const SizedBox(width: 6),
                ],
              ]),
            ),
            const SizedBox(height: 8),
            Text(t.acct_step(_step), style: style.bodyMedium?.copyWith(color: SammatiColors.mute)),
            const SizedBox(height: 16),
            switch (_step) {
              1 => _stepId(t, style),
              2 => _stepSecure(t, style),
              _ => _stepProfile(t, style),
            },
          ],
        ),
      ),
    );
  }

  Widget _stepId(AppLocalizations t, TextTheme style) {
    final (text, color, icon) = switch (_availability) {
      _Availability.checking => (t.acct_id_checking, SammatiColors.mute, Icons.hourglass_empty),
      _Availability.available => (t.acct_id_available('${_name.text.toLowerCase()}$sammatiSuffix'), SammatiColors.allow, Icons.check_circle_outline),
      _Availability.taken => (t.id_taken, SammatiColors.block, Icons.error_outline),
      _Availability.invalid => (t.id_invalid, SammatiColors.block, Icons.error_outline),
      _Availability.unreachable => (t.error_unreachable, SammatiColors.block, Icons.error_outline),
      _Availability.idle => (null, SammatiColors.mute, Icons.circle),
    };
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Semantics(header: true, child: Text(t.acct_id_title, style: style.headlineSmall)),
      const SizedBox(height: 8),
      Text(t.id_explain, style: style.bodyLarge),
      const SizedBox(height: 24),
      TextField(
        controller: _name,
        autocorrect: false,
        enableSuggestions: false,
        maxLength: 30,
        inputFormatters: [FilteringTextInputFormatter.allow(RegExp('[A-Za-z0-9._-]')), _Lower()],
        decoration: InputDecoration(labelText: t.id_choose, helperText: t.id_hint, helperMaxLines: 3, suffixText: sammatiSuffix, counterText: ''),
        onChanged: _onNameChanged,
      ),
      const SizedBox(height: 8),
      if (text != null) Semantics(liveRegion: true, child: StatusLine(icon: icon, color: color, text: text)),
      const SizedBox(height: 24),
      FilledButton(
        style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(56)),
        onPressed: _availability == _Availability.available ? () => _chooseId(_name.text.toLowerCase()) : null,
        child: Text(t.onb_continue),
      ),
      TextButton(style: TextButton.styleFrom(minimumSize: const Size.fromHeight(48)), onPressed: () => _chooseId(null), child: Text(t.acct_id_later)),
    ]);
  }

  Widget _stepSecure(AppLocalizations t, TextTheme style) {
    final chosen = _chosen == null ? null : '$_chosen$sammatiSuffix';
    final failed = _registerProblem != RequestsProblem.none && chosen != null;
    final message = _walletFailure == null
        ? null
        : switch (_walletFailure!) {
            WalletFailure.noDeviceLock => t.wallet_no_lock,
            WalletFailure.authFailed => t.wallet_auth_failed,
            _ => t.wallet_create_failed,
          };
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const Icon(Icons.fingerprint, size: 72, color: SammatiColors.ink),
      const SizedBox(height: 24),
      Text(t.wallet_create_title, style: style.headlineMedium),
      const SizedBox(height: 12),
      Text(t.wallet_create_body, style: style.bodyLarge),
      const SizedBox(height: 16),
      if (message != null) StatusLine(icon: Icons.error_outline, color: SammatiColors.block, text: message),
      if (_busy && _walletExists && chosen != null) Text(t.acct_registering(chosen), style: style.bodyMedium),
      if (failed) ...[
        StatusLine(icon: Icons.error_outline, color: SammatiColors.block, text: t.acct_register_failed(chosen)),
        StatusLine(
          icon: Icons.info_outline,
          color: SammatiColors.mute,
          text: switch (_registerProblem) {
            RequestsProblem.taken => t.id_taken,
            RequestsProblem.authFailed => t.wallet_auth_failed,
            RequestsProblem.unreachable => t.error_unreachable,
            _ => t.error_generic,
          },
        ),
      ],
      const SizedBox(height: 24),
      if (failed) ...[
        FilledButton(style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(56)), onPressed: _busy ? null : () => _register(t), child: Text(t.retry)),
        TextButton(style: TextButton.styleFrom(minimumSize: const Size.fromHeight(48)), onPressed: _busy ? null : () => setState(() => _step = 1), child: Text(t.acct_choose_another)),
        TextButton(style: TextButton.styleFrom(minimumSize: const Size.fromHeight(48)), onPressed: _busy ? null : () => setState(() => _step = 3), child: Text(t.acct_id_later)),
      ] else
        FilledButton(
          style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(56)),
          onPressed: _busy ? null : () => _secure(t),
          child: _busy ? const SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 3)) : Text(t.wallet_create_button),
        ),
    ]);
  }

  Widget _stepProfile(AppLocalizations t, TextTheme style) {
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Semantics(header: true, child: Text(t.acct_profile_title, style: style.headlineSmall)),
      const SizedBox(height: 8),
      Text(t.acct_profile_body, style: style.bodyLarge),
      const SizedBox(height: 16),
      for (final (i, g) in categoryGroups.indexed)
        ExpansionTile(
          initiallyExpanded: i == 0,
          tilePadding: EdgeInsets.zero,
          title: Text(groupLabel(context, g.id), style: style.titleMedium),
          children: [
            for (final c in dataCategories.where((c) => c.group == g.id)) ...[
              ProfileFieldInput(category: c, enabled: !_busy, onChanged: (v) => setState(() => _values[c.field] = v)),
              const SizedBox(height: 12),
            ],
          ],
        ),
      const SizedBox(height: 8),
      Text(t.profile_private, style: style.bodyMedium?.copyWith(color: SammatiColors.mute)),
      const SizedBox(height: 24),
      FilledButton(
        style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(56)),
        onPressed: _busy || !_formValid || _values.values.every((v) => v == null || v.isEmpty) ? null : () => _finish(save: true),
        child: Text(t.acct_finish),
      ),
      TextButton(style: TextButton.styleFrom(minimumSize: const Size.fromHeight(48)), onPressed: _busy ? null : () => _finish(save: false), child: Text(t.acct_skip)),
    ]);
  }
}

class _Lower extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(TextEditingValue oldValue, TextEditingValue newValue) => newValue.copyWith(text: newValue.text.toLowerCase());
}
