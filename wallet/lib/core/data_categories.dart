// The fixed registry of data category ids (prd.md §6.1a, trd.md §4.6). Mirrors shared/src/categories.ts; both pass
// shared/test-vectors/data-categories.json (wallet/test/data_categories_test.dart). A purpose's data categories are
// these ids only, and each maps to one profile field, so the wallet can tell what a consent needs. The ids are part of
// the notice hash input (drd.md §4.2): an existing id is never renamed.

import 'notice.dart';

/// How a profile field is entered and checked.
enum FieldKind { text, multiline, date, choice, mobile, email, pan, policy }

class CategoryGroup {
  const CategoryGroup({required this.id, required this.label});

  final String id;
  final LocalizedText label;
}

class DataCategory {
  const DataCategory({
    required this.id,
    required this.group,
    required this.field,
    required this.kind,
    required this.label,
    this.choices,
    this.min,
    this.max,
  });

  final String id;
  final String group;

  /// The profile field this category maps to, and its key in a sealed payload.
  final String field;
  final FieldKind kind;

  /// Allowed values of a `choice`: the English codes, never the translated labels.
  final List<String>? choices;
  final int? min;
  final int? max;
  final LocalizedText label;
}

/// A profile is a flat map of field name to string; any subset is valid.
typedef ProfileFields = Map<String, String>;

// Registry order. Do not reorder: it is the canonical order of a notice's categories.
const categoryGroups = <CategoryGroup>[
  CategoryGroup(id: 'identity', label: LocalizedText(en: 'Who you are', hi: 'आप कौन हैं', kn: 'ನೀವು ಯಾರು')),
  CategoryGroup(id: 'contact', label: LocalizedText(en: 'How to reach you', hi: 'आप तक कैसे पहुँचें', kn: 'ನಿಮ್ಮನ್ನು ಸಂಪರ್ಕಿಸುವ ವಿಧಾನ')),
  CategoryGroup(id: 'financial', label: LocalizedText(en: 'Money', hi: 'पैसा', kn: 'ಹಣಕಾಸು')),
  CategoryGroup(id: 'health', label: LocalizedText(en: 'Health', hi: 'स्वास्थ्य', kn: 'ಆರೋಗ್ಯ')),
  CategoryGroup(id: 'prefs', label: LocalizedText(en: 'Your preferences', hi: 'आपकी पसंद', kn: 'ನಿಮ್ಮ ಆದ್ಯತೆಗಳು')),
];

const dataCategories = <DataCategory>[
  DataCategory(
    id: 'identity.name',
    group: 'identity',
    field: 'fullName',
    kind: FieldKind.text,
    min: 2,
    max: 80,
    label: LocalizedText(en: 'Full name', hi: 'पूरा नाम', kn: 'ಪೂರ್ಣ ಹೆಸರು'),
  ),
  DataCategory(
    id: 'identity.dob',
    group: 'identity',
    field: 'dob',
    kind: FieldKind.date,
    label: LocalizedText(en: 'Date of birth', hi: 'जन्म तिथि', kn: 'ಹುಟ್ಟಿದ ದಿನಾಂಕ'),
  ),
  DataCategory(
    id: 'identity.gender',
    group: 'identity',
    field: 'gender',
    kind: FieldKind.choice,
    choices: ['female', 'male', 'other', 'prefer_not_to_say'],
    label: LocalizedText(en: 'Gender', hi: 'लिंग', kn: 'ಲಿಂಗ'),
  ),
  DataCategory(
    id: 'contact.mobile',
    group: 'contact',
    field: 'mobile',
    kind: FieldKind.mobile,
    label: LocalizedText(en: 'Mobile number', hi: 'मोबाइल नंबर', kn: 'ಮೊಬೈಲ್ ಸಂಖ್ಯೆ'),
  ),
  DataCategory(
    id: 'contact.email',
    group: 'contact',
    field: 'email',
    kind: FieldKind.email,
    label: LocalizedText(en: 'Email', hi: 'ईमेल', kn: 'ಇಮೇಲ್'),
  ),
  DataCategory(
    id: 'contact.address',
    group: 'contact',
    field: 'address',
    kind: FieldKind.multiline,
    min: 5,
    max: 200,
    label: LocalizedText(en: 'Home address', hi: 'घर का पता', kn: 'ಮನೆಯ ವಿಳಾಸ'),
  ),
  DataCategory(
    id: 'financial.pan',
    group: 'financial',
    field: 'pan',
    kind: FieldKind.pan,
    label: LocalizedText(en: 'PAN', hi: 'पैन (PAN)', kn: 'ಪ್ಯಾನ್ (PAN)'),
  ),
  DataCategory(
    id: 'financial.income_band',
    group: 'financial',
    field: 'incomeBand',
    kind: FieldKind.choice,
    choices: ['0-3 LPA', '3-6 LPA', '6-9 LPA', '9+ LPA'],
    label: LocalizedText(en: 'Yearly income', hi: 'वार्षिक आय', kn: 'ವಾರ್ಷಿಕ ಆದಾಯ'),
  ),
  DataCategory(
    id: 'financial.employment',
    group: 'financial',
    field: 'employment',
    kind: FieldKind.choice,
    choices: ['salaried', 'self-employed', 'student', 'unemployed'],
    label: LocalizedText(en: 'Type of work', hi: 'काम का प्रकार', kn: 'ಕೆಲಸದ ಬಗೆ'),
  ),
  DataCategory(
    id: 'financial.employer',
    group: 'financial',
    field: 'employer',
    kind: FieldKind.text,
    min: 2,
    max: 80,
    label: LocalizedText(en: 'Employer', hi: 'नियोक्ता', kn: 'ಉದ್ಯೋಗದಾತ'),
  ),
  DataCategory(
    id: 'health.blood_group',
    group: 'health',
    field: 'bloodGroup',
    kind: FieldKind.choice,
    choices: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
    label: LocalizedText(en: 'Blood group', hi: 'रक्त समूह', kn: 'ರಕ್ತದ ಗುಂಪು'),
  ),
  DataCategory(
    id: 'health.allergies',
    group: 'health',
    field: 'allergies',
    kind: FieldKind.multiline,
    min: 2,
    max: 200,
    label: LocalizedText(en: 'Allergies', hi: 'एलर्जी', kn: 'ಅಲರ್ಜಿಗಳು'),
  ),
  DataCategory(
    id: 'health.insurance_policy',
    group: 'health',
    field: 'insurancePolicy',
    kind: FieldKind.policy,
    label: LocalizedText(en: 'Health insurance policy number', hi: 'स्वास्थ्य बीमा पॉलिसी नंबर', kn: 'ಆರೋಗ್ಯ ವಿಮೆ ಪಾಲಿಸಿ ಸಂಖ್ಯೆ'),
  ),
  DataCategory(
    id: 'prefs.food',
    group: 'prefs',
    field: 'foodPreference',
    kind: FieldKind.choice,
    choices: ['vegetarian', 'non_vegetarian', 'vegan'],
    label: LocalizedText(en: 'Food preference', hi: 'भोजन की पसंद', kn: 'ಆಹಾರದ ಆದ್ಯತೆ'),
  ),
  DataCategory(
    id: 'prefs.delivery_address',
    group: 'prefs',
    field: 'deliveryAddress',
    kind: FieldKind.multiline,
    min: 5,
    max: 200,
    label: LocalizedText(en: 'Delivery address', hi: 'डिलीवरी का पता', kn: 'ಡೆಲಿವರಿ ವಿಳಾಸ'),
  ),
];

final _byId = {for (final (i, c) in dataCategories.indexed) c.id: (category: c, index: i)};
final _byField = {for (final c in dataCategories) c.field: c};

bool isCategoryId(String id) => _byId.containsKey(id);

DataCategory? categoryById(String id) => _byId[id]?.category;

DataCategory? categoryForField(String field) => _byField[field];

/// Drops duplicates and puts known ids in registry order; an unknown id keeps its place after the known ones.
List<String> normalizeCategories(Iterable<String> ids) {
  final unique = ids.toSet().toList();
  final known = unique.where(isCategoryId).toList()..sort((a, b) => _byId[a]!.index.compareTo(_byId[b]!.index));
  return [...known, ...unique.where((id) => !isCategoryId(id))];
}

/// The profile fields a set of categories needs, in registry order. An unknown id needs nothing the wallet can supply.
List<String> fieldsFor(Iterable<String> categories) => [
      for (final id in normalizeCategories(categories))
        if (categoryById(id) case final c?) c.field,
    ];

/// What goes into a purpose's sealed envelope (trd.md §4.4 step 4): that purpose's fields only, only those present.
Map<String, String> profilePayload(ProfileFields profile, Iterable<String> categories) => {
      for (final field in fieldsFor(categories))
        if ((profile[field] ?? '') != '') field: profile[field]!,
    };

/// The fields a consent needs that the profile lacks: the only ones the wallet may ask for (W-13).
List<String> missingFields(ProfileFields profile, Iterable<String> categories) =>
    [for (final field in fieldsFor(categories)) if ((profile[field] ?? '') == '') field];

final _pan = RegExp(r'^[A-Z]{5}[0-9]{4}[A-Z]$');
final _mobile = RegExp(r'^[6-9][0-9]{9}$');
final _email = RegExp(r'^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$');
final _policy = RegExp(r'^[A-Za-z0-9-]{4,30}$');
final _isoDate = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$');

bool _isRealDate(String value, String today) {
  final m = _isoDate.firstMatch(value);
  if (m == null) return false;
  final y = int.parse(m.group(1)!), mo = int.parse(m.group(2)!), d = int.parse(m.group(3)!);
  final date = DateTime.utc(y, mo, d);
  if (date.year != y || date.month != mo || date.day != d) return false;
  return value.compareTo('1900-01-01') >= 0 && value.compareTo(today) <= 0;
}

String _todayUtc() => DateTime.now().toUtc().toIso8601String().substring(0, 10);

/// True when [value] is acceptable for the profile [field]. [today] is `YYYY-MM-DD` (UTC), injectable for tests.
bool isValidFieldValue(String field, String value, {String? today}) {
  final c = _byField[field];
  if (c == null) return false;
  final length = value.runes.length;
  return switch (c.kind) {
    FieldKind.text || FieldKind.multiline => length >= (c.min ?? 1) && length <= (c.max ?? 200) && value == value.trim(),
    FieldKind.date => _isRealDate(value, today ?? _todayUtc()),
    FieldKind.choice => c.choices!.contains(value),
    FieldKind.mobile => _mobile.hasMatch(value),
    FieldKind.email => value.length <= 120 && _email.hasMatch(value),
    FieldKind.pan => _pan.hasMatch(value),
    FieldKind.policy => _policy.hasMatch(value),
  };
}
