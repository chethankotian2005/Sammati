import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/data_categories.dart';
import '../../l10n/generated/app_localizations.dart';
import '../../theme/app_theme.dart';

/// The label of a registry category in the app's language (labels live in the registry, not in the ARB files).
String categoryLabel(BuildContext context, DataCategory c) => c.label.forLanguage(Localizations.localeOf(context).languageCode);

String groupLabel(BuildContext context, String groupId) {
  final lang = Localizations.localeOf(context).languageCode;
  return categoryGroups.firstWhere((g) => g.id == groupId).label.forLanguage(lang);
}

/// The translated label of a choice value; the stored value is always the English code (trd.md §4.6).
String choiceLabel(AppLocalizations t, String field, String value) => switch ((field, value)) {
      ('incomeBand', '0-3 LPA') => t.income_0_3,
      ('incomeBand', '3-6 LPA') => t.income_3_6,
      ('incomeBand', '6-9 LPA') => t.income_6_9,
      ('incomeBand', _) => t.income_9_plus,
      ('employment', 'salaried') => t.emp_salaried,
      ('employment', 'self-employed') => t.emp_self_employed,
      ('employment', 'student') => t.emp_student,
      ('employment', _) => t.emp_unemployed,
      ('gender', 'female') => t.gender_female,
      ('gender', 'male') => t.gender_male,
      ('gender', 'other') => t.gender_other,
      ('gender', _) => t.gender_prefer_not,
      ('foodPreference', 'vegetarian') => t.food_vegetarian,
      ('foodPreference', 'non_vegetarian') => t.food_non_vegetarian,
      ('foodPreference', _) => t.food_vegan,
      _ => value, // blood groups are the same in every language
    };

/// How a stored value is shown: dates as the person types them, choices translated.
String displayValue(AppLocalizations t, DataCategory c, String value) => switch (c.kind) {
      FieldKind.choice => choiceLabel(t, c.field, value),
      FieldKind.date => _isoToInput(value),
      _ => value,
    };

String _isoToInput(String iso) {
  final m = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$').firstMatch(iso);
  return m == null ? iso : '${m.group(3)}/${m.group(2)}/${m.group(1)}';
}

String _inputToIso(String input) {
  final m = RegExp(r'^(\d{2})/(\d{2})/(\d{4})$').firstMatch(input.trim());
  return m == null ? input.trim() : '${m.group(3)}-${m.group(2)}-${m.group(1)}';
}

String? errorFor(AppLocalizations t, DataCategory c) => switch (c.kind) {
      FieldKind.text when c.field == 'fullName' => t.err_name,
      FieldKind.date => t.err_dob,
      FieldKind.mobile => t.err_mobile,
      FieldKind.email => t.err_email,
      FieldKind.pan => t.share_pan_invalid,
      FieldKind.policy => t.err_policy,
      _ => t.err_text,
    };

/// One profile field's input (My details, account step 3, the share screen). Reports the canonical value through
/// [onChanged]: `''` when empty, the value when valid, and `null` while what is typed is not valid. The error shows after
/// the field was touched. The value lives in this widget's controller and the screen that owns it; nothing is logged.
class ProfileFieldInput extends StatefulWidget {
  const ProfileFieldInput({super.key, required this.category, required this.onChanged, this.initial = '', this.enabled = true});

  final DataCategory category;
  final String initial;
  final bool enabled;
  final ValueChanged<String?> onChanged;

  @override
  State<ProfileFieldInput> createState() => _ProfileFieldInputState();
}

class _ProfileFieldInputState extends State<ProfileFieldInput> {
  late final TextEditingController _text = TextEditingController(
    text: switch (widget.category.kind) { FieldKind.choice => '', FieldKind.date => _isoToInput(widget.initial), _ => widget.initial },
  );
  String? _choice;
  bool _touched = false;
  bool _invalid = false;

  @override
  void initState() {
    super.initState();
    if (widget.category.kind == FieldKind.choice && widget.initial.isNotEmpty) _choice = widget.initial;
  }

  @override
  void dispose() {
    _text.clear();
    _text.dispose();
    super.dispose();
  }

  void _report(String raw) {
    final c = widget.category;
    final value = c.kind == FieldKind.date ? _inputToIso(raw) : raw.trim();
    final valid = value.isEmpty || isValidFieldValue(c.field, value);
    setState(() {
      _touched = true;
      _invalid = !valid;
    });
    widget.onChanged(value.isEmpty ? '' : (valid ? value : null));
  }

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final c = widget.category;
    final label = categoryLabel(context, c);

    if (c.kind == FieldKind.choice) {
      return DropdownButtonFormField<String>(
        initialValue: _choice,
        isExpanded: true,
        decoration: InputDecoration(labelText: label),
        items: [for (final v in c.choices!) DropdownMenuItem(value: v, child: Text(choiceLabel(t, c.field, v)))],
        onChanged: widget.enabled
            ? (v) {
                setState(() => _choice = v);
                widget.onChanged(v ?? '');
              }
            : null,
      );
    }

    final multiline = c.kind == FieldKind.multiline;
    return TextField(
      controller: _text,
      enabled: widget.enabled,
      autocorrect: false,
      enableSuggestions: false,
      minLines: multiline ? 2 : 1,
      maxLines: multiline ? 4 : 1,
      maxLength: switch (c.kind) { FieldKind.mobile => 10, FieldKind.pan => 10, FieldKind.date => 10, _ => c.max ?? 120 },
      keyboardType: switch (c.kind) {
        FieldKind.mobile => TextInputType.phone,
        FieldKind.email => TextInputType.emailAddress,
        FieldKind.date => TextInputType.datetime,
        FieldKind.multiline => TextInputType.multiline,
        _ => TextInputType.text,
      },
      textCapitalization: c.kind == FieldKind.pan ? TextCapitalization.characters : TextCapitalization.none,
      inputFormatters: [
        if (c.kind == FieldKind.mobile) FilteringTextInputFormatter.digitsOnly,
        if (c.kind == FieldKind.pan) FilteringTextInputFormatter.allow(RegExp('[A-Za-z0-9]')),
        if (c.kind == FieldKind.pan) _Upper(),
        if (c.kind == FieldKind.date) FilteringTextInputFormatter.allow(RegExp('[0-9/]')),
      ],
      style: c.kind == FieldKind.pan || c.kind == FieldKind.policy ? monoStyle() : null,
      decoration: InputDecoration(
        labelText: label,
        hintText: switch (c.kind) { FieldKind.date => t.dob_hint, FieldKind.pan => t.share_pan_hint, _ => null },
        errorText: _touched && _invalid ? errorFor(t, c) : null,
        errorMaxLines: 3,
        counterText: '',
      ),
      onChanged: _report,
    );
  }
}

class _Upper extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(TextEditingValue oldValue, TextEditingValue newValue) => newValue.copyWith(text: newValue.text.toUpperCase());
}
