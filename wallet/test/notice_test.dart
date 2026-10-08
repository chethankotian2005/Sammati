import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:sammati/core/notice.dart';

import 'support/fake_core.dart';

void main() {
  group('canonicalJson', () {
    test('sorts keys, drops whitespace, keeps array order', () {
      expect(canonicalJson({'b': 1, 'a': [3, 1, 2], 'c': null, 'd': true}), '{"a":[3,1,2],"b":1,"c":null,"d":true}');
    });

    test('sorts nested keys', () {
      expect(canonicalJson({'z': {'b': 'x', 'a': 'y'}}), '{"z":{"a":"y","b":"x"}}');
    });

    test('rejects floats so two implementations cannot disagree on number formatting', () {
      expect(() => canonicalJson({'a': 1.5}), throwsFormatException);
    });
  });

  group('noticeHash', () {
    final vectors = jsonDecode(File('test/fixtures/eip712.json').readAsStringSync()) as Map<String, dynamic>;
    final noticeVector = vectors['notice'] as Map<String, dynamic>;

    ConsentNotice fromVector() {
      final input = noticeVector['input'] as Map<String, dynamic>;
      return ConsentNotice.fromJson({
        'requestId': 'req_vector',
        'fiduciary': {'address': input['fiduciary'], 'name': 'QuickLoan', 'color': '#2F5BEA'},
        'purposes': [
          for (final p in (input['purposes'] as List).cast<Map<String, dynamic>>())
            {
              'id': p['id'],
              'code': 'credit_check',
              'title': {'en': 't', 'hi': 't', 'kn': 't'},
              'description': {'en': p['desc_en'], 'hi': p['desc_hi'], 'kn': p['desc_kn']},
              'dataCategories': p['dataCategories'],
              'retentionDays': p['retentionDays'],
              'sharesThirdParty': p['sharesThirdParty'],
              'required': false,
            },
        ],
        'noticeHash': noticeVector['noticeHash'],
        'noticeVersion': input['version'],
        'domain': {'chainId': 31337, 'verifyingContract': verifyingContract},
        'nonce': '0',
      });
    }

    test('matches the shared test vector (computed by shared/src/canonical.ts)', () {
      final notice = fromVector();
      expect(notice.computeNoticeHash(), noticeVector['noticeHash']);
      expect(notice.hashMatches, isTrue);
    });

    test('matches the TypeScript hash for Hindi and Kannada text', () {
      // Produced by shared/src/canonical.ts noticeHash() over the same three purposes
      // (the shared vector is ASCII-only, which would not catch a UTF-8 encoding difference).
      expect(
        ConsentNotice.fromJson(buildNoticeJson()).computeNoticeHash(),
        '0x9017e178e48b483bba71e7c53277fc692af3f2076984d47a95e5277c28624fe3',
      );
    });

    test('detects an edited description', () {
      final json = buildNoticeJson();
      (json['purposes'] as List).first['description']['en'] = 'Share everything with everyone';
      expect(ConsentNotice.fromJson(json).hashMatches, isFalse);
    });

    test('detects a flipped third-party flag', () {
      final json = buildNoticeJson();
      (json['purposes'] as List).first['sharesThirdParty'] = true;
      expect(ConsentNotice.fromJson(json).hashMatches, isFalse);
    });

    test('detects a different company', () {
      final json = buildNoticeJson();
      json['fiduciary']['address'] = '0x0000000000000000000000000000000000000001';
      expect(ConsentNotice.fromJson(json).hashMatches, isFalse);
    });

    test('accepts a hash that differs only in letter case', () {
      final json = buildNoticeJson();
      json['noticeHash'] = (json['noticeHash'] as String).toUpperCase().replaceFirst('0X', '0x');
      expect(ConsentNotice.fromJson(json).hashMatches, isTrue);
    });
  });
}
