import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/consents_controller.dart';
import '../../core/demo_profile.dart';
import '../../core/format.dart';
import '../../core/vault_controller.dart';
import '../../l10n/generated/app_localizations.dart';
import '../../theme/app_theme.dart';
import '../../theme/tokens.dart';
import 'vault_status.dart';

/// W10 share your details securely (W-13, ui.md W10): the customer types their PAN, income band and employment, or
/// fills them from the demo profile; they are checked here, encrypted on this phone for the Sammati Processor and
/// only the ciphertext leaves. The values live in this screen's state and nowhere else: they are cleared the moment
/// they have been sent and when the screen closes. Nothing is logged, saved or shown on another screen.
class ShareDetailsScreen extends ConsumerStatefulWidget {
  const ShareDetailsScreen({super.key, required this.fiduciary, required this.purposeCode, this.companyName});

  final String fiduciary;
  final String purposeCode;

  /// Passed by the screen that opened this one; looked up from the consents otherwise.
  final String? companyName;

  @override
  ConsumerState<ShareDetailsScreen> createState() => _ShareDetailsScreenState();
}

class _ShareDetailsScreenState extends ConsumerState<ShareDetailsScreen> {
  final _pan = TextEditingController();
  String? _income;
  String? _employment;
  bool _touched = false;

  /// The demo profile was used and nothing has been edited since: only then does the demo credit score go with it.
  bool _fromDemo = false;

  /// A send was tried on this visit. An earlier visit's "sent" does not hide the form: "Send again" must show it.
  bool _attempted = false;

  void _rebuild() => setState(() {});

  @override
  void initState() {
    super.initState();
    _pan.addListener(_rebuild);
  }

  @override
  void dispose() {
    // Closing the screen forgets what was typed. The listener goes first: clearing would otherwise rebuild a dead widget.
    _pan.removeListener(_rebuild);
    _pan.clear();
    _pan.dispose();
    super.dispose();
  }

  void _clear() {
    _pan.clear();
    _income = null;
    _employment = null;
    _touched = false;
    _fromDemo = false;
  }

  bool get _valid => isValidPan(_pan.text) && _income != null && _employment != null;

  void _useDemo() => setState(() {
        _pan.text = DemoProfile.pan;
        _income = DemoProfile.incomeBand;
        _employment = DemoProfile.employment;
        _touched = true;
        _fromDemo = true;
      });

  Future<void> _send(String reason) async {
    if (!_valid) return;
    final details = SensitiveDetails(
      pan: _pan.text,
      incomeBand: _income!,
      employment: _employment!,
      score: _fromDemo ? DemoProfile.score : null,
    );
    final key = VaultKey(widget.fiduciary, widget.purposeCode);
    setState(() => _attempted = true);
    await ref.read(vaultProvider(key).notifier).send(reason: reason, profile: details.toPayload());
    // Sent: the values have done their job and are not kept. A failed send keeps them, so the customer can retry.
    if (mounted && ref.read(vaultProvider(key)).stage == VaultStage.sent) setState(_clear);
  }

  String _incomeLabel(AppLocalizations t, String band) => switch (band) {
        '0-3 LPA' => t.income_0_3,
        '3-6 LPA' => t.income_3_6,
        '6-9 LPA' => t.income_6_9,
        _ => t.income_9_plus,
      };

  String _employmentLabel(AppLocalizations t, String status) => switch (status) {
        'salaried' => t.emp_salaried,
        'self-employed' => t.emp_self_employed,
        'student' => t.emp_student,
        _ => t.emp_unemployed,
      };

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final style = Theme.of(context).textTheme;
    final company = widget.companyName ??
        ref.watch(consentsProvider).snapshot?.company(widget.fiduciary)?.fiduciary.name ??
        shortHex(widget.fiduciary);
    final vault = ref.watch(vaultProvider(VaultKey(widget.fiduciary, widget.purposeCode)));
    final sending = vault.stage == VaultStage.sending;
    final sent = _attempted && vault.stage == VaultStage.sent;
    final panError = _touched && _pan.text.isNotEmpty && !isValidPan(_pan.text) ? t.share_pan_invalid : null;

    return Scaffold(
      // The heading is in the body: in Hindi and Kannada, or at large text, it needs more than the one line an app bar gives.
      appBar: AppBar(),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Semantics(header: true, child: Text(t.share_title, style: style.headlineSmall)),
          const SizedBox(height: 8),
          Text(t.share_intro(company), style: style.bodyLarge),
          const SizedBox(height: 16),
          if (!sent) ...[
            OutlinedButton.icon(
              style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48)),
              onPressed: sending ? null : _useDemo,
              icon: const Icon(Icons.badge_outlined),
              label: Text(t.share_use_demo),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _pan,
              enabled: !sending,
              textCapitalization: TextCapitalization.characters,
              autocorrect: false,
              enableSuggestions: false,
              maxLength: 10,
              inputFormatters: [FilteringTextInputFormatter.allow(RegExp('[A-Za-z0-9]')), _UpperCase()],
              style: monoStyle(),
              decoration: InputDecoration(labelText: t.share_pan, hintText: t.share_pan_hint, hintMaxLines: 2, errorText: panError, errorMaxLines: 2, counterText: ''),
              onChanged: (_) => setState(() {
                _touched = true;
                _fromDemo = false;
              }),
            ),
            const SizedBox(height: 16),
            DropdownButtonFormField<String>(
              initialValue: _income,
              key: ValueKey('income-$_income'),
              isExpanded: true,
              decoration: InputDecoration(labelText: t.share_income),
              items: [for (final band in incomeBands) DropdownMenuItem(value: band, child: Text(_incomeLabel(t, band)))],
              onChanged: sending ? null : (v) => setState(() {
                    _income = v;
                    _fromDemo = false;
                  }),
            ),
            const SizedBox(height: 16),
            DropdownButtonFormField<String>(
              initialValue: _employment,
              key: ValueKey('employment-$_employment'),
              isExpanded: true,
              decoration: InputDecoration(labelText: t.share_employment),
              items: [for (final s in employmentStatuses) DropdownMenuItem(value: s, child: Text(_employmentLabel(t, s)))],
              onChanged: sending ? null : (v) => setState(() {
                    _employment = v;
                    _fromDemo = false;
                  }),
            ),
            const SizedBox(height: 24),
            FilledButton(
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(56)),
              onPressed: _valid && !sending ? () => _send(t.auth_reason_vault) : null,
              child: Text(t.vault_send),
            ),
            const SizedBox(height: 16),
          ],
          if (_attempted) VaultStatusLines(stage: vault.stage, vault: vault, company: company),
          if (sent) ...[
            const SizedBox(height: 16),
            FilledButton(
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(56)),
              onPressed: () => context.pop(),
              child: Text(t.done),
            ),
          ],
          const SizedBox(height: 24),
          Text(t.vault_simulated, style: style.bodyMedium?.copyWith(color: SammatiColors.mute)),
        ],
      ),
    );
  }
}

/// A PAN is capitals: typed lower case becomes upper case as it goes in.
class _UpperCase extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(TextEditingValue oldValue, TextEditingValue newValue) =>
      newValue.copyWith(text: newValue.text.toUpperCase());
}
