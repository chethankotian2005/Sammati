import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/preferences.dart';
import '../../l10n/generated/app_localizations.dart';

/// Lets the phone point at the laptop's Core without a rebuild (trd.md §5).
class DevSettingsScreen extends ConsumerStatefulWidget {
  const DevSettingsScreen({super.key});

  @override
  ConsumerState<DevSettingsScreen> createState() => _DevSettingsScreenState();
}

class _DevSettingsScreenState extends ConsumerState<DevSettingsScreen> {
  late final TextEditingController _controller;
  bool _invalid = false;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: ref.read(coreUrlProvider));
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final t = AppLocalizations.of(context);
    final messenger = ScaffoldMessenger.of(context);
    final valid = isValidCoreUrl(_controller.text);
    setState(() => _invalid = !valid);
    if (!valid) return;
    await ref.read(coreUrlProvider.notifier).set(_controller.text);
    // Show the stored (normalised) value so the user sees exactly what is used.
    if (mounted) _controller.text = ref.read(coreUrlProvider);
    messenger.showSnackBar(SnackBar(content: Text(t.dev_saved)));
  }

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(t.me_developer)),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          TextField(
            controller: _controller,
            keyboardType: TextInputType.url,
            autocorrect: false,
            textInputAction: TextInputAction.done,
            onSubmitted: (_) => _save(),
            decoration: InputDecoration(
              labelText: t.dev_core_url,
              helperText: t.dev_core_url_hint,
              helperMaxLines: 3,
              errorText: _invalid ? t.dev_core_url_invalid : null,
              errorMaxLines: 3,
            ),
          ),
          const SizedBox(height: 16),
          FilledButton(onPressed: _save, child: Text(t.dev_save)),
        ],
      ),
    );
  }
}
