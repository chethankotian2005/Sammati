// The data category registry against the vectors the TypeScript side also passes
// (shared/test-vectors/data-categories.json): same ids, order, fields, kinds, labels, validation and payloads.

import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:sammati/core/data_categories.dart';

void main() {
  final vectors = jsonDecode(File('../shared/test-vectors/data-categories.json').readAsStringSync()) as Map<String, dynamic>;

  test('the registry is the TypeScript one: ids, order, groups, fields, kinds, bounds and labels', () {
    final expected = (vectors['categories'] as List).cast<Map<String, dynamic>>();
    expect(dataCategories.map((c) => c.id), expected.map((c) => c['id']));
    for (final (i, e) in expected.indexed) {
      final c = dataCategories[i];
      expect(c.group, e['group'], reason: c.id);
      expect(c.field, e['field'], reason: c.id);
      expect(c.kind.name, e['kind'], reason: c.id);
      expect(c.choices, (e['choices'] as List?)?.cast<String>(), reason: c.id);
      expect(c.min, e['min'], reason: c.id);
      expect(c.max, e['max'], reason: c.id);
      final label = e['label'] as Map<String, dynamic>;
      expect([c.label.en, c.label.hi, c.label.kn], [label['en'], label['hi'], label['kn']], reason: c.id);
    }
    final groups = (vectors['groups'] as List).cast<Map<String, dynamic>>();
    expect(categoryGroups.map((g) => g.id), groups.map((g) => g['id']));
    for (final (i, g) in groups.indexed) {
      final label = g['label'] as Map<String, dynamic>;
      expect([categoryGroups[i].label.en, categoryGroups[i].label.hi, categoryGroups[i].label.kn], [label['en'], label['hi'], label['kn']]);
    }
  });

  group('validation', () {
    final today = (vectors['validation'] as Map)['today'] as String;
    for (final c in ((vectors['validation'] as Map)['cases'] as List).cast<Map<String, dynamic>>()) {
      test('${c['field']} = ${c['value']} is ${c['valid']}', () {
        expect(isValidFieldValue(c['field'] as String, c['value'] as String, today: today), c['valid']);
      });
    }

    test('a field the registry does not have is never valid', () => expect(isValidFieldValue('nickname', 'Ash'), isFalse));
  });

  group('normalising', () {
    for (final c in (vectors['normalize'] as List).cast<Map<String, dynamic>>()) {
      test('${c['input']}', () => expect(normalizeCategories((c['input'] as List).cast<String>()), (c['output'] as List).cast<String>()));
    }
  });

  group('payloads and missing fields', () {
    for (final c in (vectors['payload'] as List).cast<Map<String, dynamic>>()) {
      test(c['name'] as String, () {
        final profile = (c['profile'] as Map).cast<String, String>();
        final categories = (c['categories'] as List).cast<String>();
        expect(profilePayload(profile, categories), (c['payload'] as Map).cast<String, String>());
        expect(missingFields(profile, categories), (c['missing'] as List).cast<String>());
      });
    }
  });
}
