import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../app/router.dart';
import '../../l10n/generated/app_localizations.dart';
import '../../theme/tokens.dart';

/// Bottom navigation (ui.md W1): Consents · Activity · [Scan] · Rights · Me.
/// Scan is not a tab; it opens the full-screen scanner, so the shell has four branches.
class HomeShell extends StatelessWidget {
  const HomeShell({super.key, required this.shell});

  final StatefulNavigationShell shell;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final index = shell.currentIndex;
    return Scaffold(
      body: shell,
      floatingActionButtonLocation: FloatingActionButtonLocation.centerDocked,
      floatingActionButton: _ScanButton(label: t.nav_scan),
      bottomNavigationBar: BottomAppBar(
        color: SammatiColors.surface,
        surfaceTintColor: Colors.transparent,
        padding: EdgeInsets.zero,
        height: 72,
        shape: const CircularNotchedRectangle(),
        notchMargin: 8,
        child: Row(
          children: [
            _NavItem(icon: Icons.verified_user_outlined, selectedIcon: Icons.verified_user, label: t.nav_consents, selected: index == 0, onTap: () => _go(0)),
            _NavItem(icon: Icons.bolt_outlined, selectedIcon: Icons.bolt, label: t.nav_activity, selected: index == 1, onTap: () => _go(1)),
            // Gap under the docked scan button.
            const SizedBox(width: 80),
            _NavItem(icon: Icons.balance_outlined, selectedIcon: Icons.balance, label: t.nav_rights, selected: index == 2, onTap: () => _go(2)),
            _NavItem(icon: Icons.person_outline, selectedIcon: Icons.person, label: t.nav_me, selected: index == 3, onTap: () => _go(3)),
          ],
        ),
      ),
    );
  }

  // Re-tapping the current tab returns to its root.
  void _go(int index) => shell.goBranch(index, initialLocation: index == shell.currentIndex);
}

class _ScanButton extends StatelessWidget {
  const _ScanButton({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 64,
      height: 64,
      child: FloatingActionButton(
        heroTag: 'scan',
        tooltip: label,
        backgroundColor: SammatiColors.marigold,
        foregroundColor: SammatiColors.ink,
        elevation: 2,
        shape: const CircleBorder(),
        onPressed: () => context.push(Routes.scan),
        child: const Icon(Icons.qr_code_scanner, size: 30),
      ),
    );
  }
}

class _NavItem extends StatelessWidget {
  const _NavItem({
    required this.icon,
    required this.selectedIcon,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final IconData icon;
  final IconData selectedIcon;
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final color = selected ? SammatiColors.ink : SammatiColors.mute;
    return Expanded(
      child: Semantics(
        button: true,
        selected: selected,
        label: label,
        excludeSemantics: true,
        child: InkWell(
          onTap: onTap,
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(selected ? selectedIcon : icon, color: color, size: 24),
              const SizedBox(height: 2),
              Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: color,
                      fontWeight: selected ? FontWeight.w800 : FontWeight.w500,
                    ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
