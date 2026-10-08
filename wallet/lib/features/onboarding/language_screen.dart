import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/router.dart';
import '../../core/preferences.dart';
import '../../l10n/generated/app_localizations.dart';
import '../../theme/tokens.dart';
import '../me/language_options.dart';

/// First screen of onboarding (ui.md W0): the language applies immediately, so the rest is read in it.
class LanguageScreen extends ConsumerWidget {
  const LanguageScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = AppLocalizations.of(context);
    final current = ref.watch(localeProvider).languageCode;
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SizedBox(height: 24),
              Text(t.language_title, style: Theme.of(context).textTheme.headlineMedium),
              const SizedBox(height: 24),
              LanguageOptions(
                current: current,
                onSelected: ref.read(localeProvider.notifier).setLanguage,
              ),
              const Spacer(),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(56), backgroundColor: SammatiColors.ink),
                  onPressed: () => context.go(Routes.onboarding),
                  child: Text(t.onb_continue),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
