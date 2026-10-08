import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/router.dart';
import '../../core/alerts_controller.dart';
import '../../l10n/generated/app_localizations.dart';
import '../../theme/tokens.dart';

/// Bottom navigation (ui.md W1, W13): Consents · Activity · [Scan] · Alerts · Rights · Me.
/// Scan is not a tab; it opens the full-screen scanner, so the shell has five branches.
class HomeShell extends ConsumerWidget {
  const HomeShell({super.key, required this.shell});

  final StatefulNavigationShell shell;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = AppLocalizations.of(context);
    final index = shell.currentIndex;
    final unread = ref.watch(alertsProvider.select((s) => s.unread));
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
            _NavItem(
              icon: Icons.notifications_outlined,
              selectedIcon: Icons.notifications,
              label: t.nav_alerts,
              selected: index == 2,
              unreadLabel: unread > 0 ? t.alerts_unread : null,
              onTap: () => _go(2),
            ),
            _NavItem(icon: Icons.balance_outlined, selectedIcon: Icons.balance, label: t.nav_rights, selected: index == 3, onTap: () => _go(3)),
            _NavItem(icon: Icons.person_outline, selectedIcon: Icons.person, label: t.nav_me, selected: index == 4, onTap: () => _go(4)),
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
    this.unreadLabel,
  });

  /// Set while something is unread: a dot on the icon, and these words for a screen reader.
  final String? unreadLabel;
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
        label: unreadLabel == null ? label : '$label, $unreadLabel',
        excludeSemantics: true,
        child: InkWell(
          onTap: onTap,
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Stack(
                clipBehavior: Clip.none,
                children: [
                  Icon(selected ? selectedIcon : icon, color: color, size: 24),
                  if (unreadLabel != null)
                    Positioned(
                      right: -2,
                      top: -2,
                      child: Container(
                        key: const ValueKey('alerts-unread-dot'),
                        width: 10,
                        height: 10,
                        decoration: BoxDecoration(color: SammatiColors.marigold, shape: BoxShape.circle, border: Border.all(color: SammatiColors.surface, width: 1.5)),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 2),
              // Five places and the scan button share 360 dp: a label that is wider than its place is scaled down to
              // fit, never cut off or let over the next one.
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 2),
                child: FittedBox(
                  fit: BoxFit.scaleDown,
                  child: Text(
                    label,
                    maxLines: 1,
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: color,
                          fontWeight: selected ? FontWeight.w800 : FontWeight.w500,
                        ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
