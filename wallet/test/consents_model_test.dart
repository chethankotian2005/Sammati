import 'package:flutter_test/flutter_test.dart';
import 'package:sammati/core/consents.dart';

import 'support/fake_core.dart';

// 2025-10-09 08:53:20 UTC
final now = DateTime.fromMillisecondsSinceEpoch(1760000000 * 1000, isUtc: true);
const day = 86400;

Map<String, dynamic> consentJson(String id, String status, int? expiresAt, {String code = 'credit_check'}) => {
      'purposeId': id,
      'code': code,
      'title': {'en': 'Credit check', 'hi': 'क्रेडिट जाँच', 'kn': 'ಕ್ರೆಡಿಟ್ ಪರಿಶೀಲನೆ'},
      'status': status,
      'grantedAt': 1,
      'expiresAt': expiresAt,
      'updatedAt': 1,
      'noticeHash': '0x',
      'lastTx': '0xaa',
      'required': false,
    };

Map<String, dynamic> snapshotJson(List<Map<String, dynamic>> consents, {String nonce = '3'}) => {
      'principal': '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      'nonce': nonce,
      'domain': {'name': 'Sammati', 'version': '1', 'chainId': 31337, 'verifyingContract': verifyingContract},
      'fiduciaries': [
        {
          'fiduciary': {'address': fiduciaryAddress, 'name': 'QuickLoan', 'sector': 'Fintech lending', 'color': '#2F5BEA'},
          'consents': consents,
        },
      ],
    };

void main() {
  group('ConsentView.stateAt', () {
    ConsentView view(String status, int? expiresAt) =>
        ConsentView.fromJson(consentJson(creditCheckId, status, expiresAt));

    test('active until the expiry second, expired from it', () {
      expect(view('Active', 1760000000 + 1).stateAt(now), ConsentState.active);
      expect(view('Active', 1760000000).stateAt(now), ConsentState.expired, reason: 'the contract: valid while now < expiresAt');
      expect(view('Active', 1760000000 - day).stateAt(now), ConsentState.expired);
    });

    test('withdrawn wins over expiry', () {
      expect(view('Withdrawn', 1760000000 - day).stateAt(now), ConsentState.withdrawn);
    });

    test('active with no expiry stays active', () {
      expect(view('Active', null).stateAt(now), ConsentState.active);
    });
  });

  group('ConsentsSnapshot', () {
    ConsentsSnapshot snapshot() => ConsentsSnapshot.fromJson(snapshotJson([
          consentJson(creditCheckId, 'Active', 1760000000 + 30 * day),
          consentJson(marketingId, 'Withdrawn', 1760000000 + 90 * day, code: 'marketing'),
        ]));

    test('parses nonce and domain for signing a withdrawal', () {
      final s = snapshot();
      expect(s.nonce, '3');
      expect(s.domain.chainId, 31337);
      expect(s.domain.verifyingContract, verifyingContract);
    });

    test('drops purposes that were never granted and companies with none', () {
      final s = ConsentsSnapshot.fromJson(snapshotJson([consentJson(creditCheckId, 'None', null)]));
      expect(s.companies, isEmpty);
    });

    test('counts only active purposes', () {
      expect(snapshot().activeCount(now), 1);
    });

    test('next expiry is the soonest among active purposes only', () {
      final s = ConsentsSnapshot.fromJson(snapshotJson([
        consentJson(creditCheckId, 'Active', 1760000000 + 200 * day),
        consentJson(kycId, 'Active', 1760000000 + 20 * day, code: 'kyc'),
        consentJson(marketingId, 'Withdrawn', 1760000000 + 5 * day, code: 'marketing'),
      ]));
      expect(s.companies.single.nextExpiry(now), 1760000000 + 20 * day);
    });

    test('finds a consent by company and purpose, ignoring address case', () {
      expect(snapshot().consent(fiduciaryAddress.toLowerCase(), creditCheckId.toUpperCase().replaceFirst('0X', '0x')), isNotNull);
      expect(snapshot().consent(fiduciaryAddress, kycId), isNull);
    });
  });

  group('live updates', () {
    ConsentUpdated update(String purposeId, String status, {int? expiresAt = 1790000000}) => ConsentUpdated(
          principal: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
          fiduciary: fiduciaryAddress,
          purposeId: purposeId,
          status: ConsentStatus.parse(status),
          expiresAt: expiresAt,
          txHash: '0xbb',
        );

    final base = ConsentsSnapshot.fromJson(snapshotJson([consentJson(creditCheckId, 'Active', 1760000000 + 30 * day)]));

    test('a withdrawal flips just that purpose', () {
      final after = base.applying(update(creditCheckId, 'Withdrawn'))!;
      final c = after.consent(fiduciaryAddress, creditCheckId)!;
      expect(c.status, ConsentStatus.withdrawn);
      expect(c.lastTx, '0xbb');
      expect(c.stateAt(now), ConsentState.withdrawn);
    });

    test('a re-grant carries the new expiry', () {
      final withdrawn = base.applying(update(creditCheckId, 'Withdrawn'))!;
      final again = withdrawn.applying(update(creditCheckId, 'Active', expiresAt: 1760000000 + 400 * day))!;
      expect(again.consent(fiduciaryAddress, creditCheckId)!.stateAt(now), ConsentState.active);
      expect(again.consent(fiduciaryAddress, creditCheckId)!.expiresAt, 1760000000 + 400 * day);
    });

    test('an unknown purpose returns null so the caller refetches', () {
      expect(base.applying(update(marketingId, 'Active')), isNull);
    });

    test('does not change the nonce, which only a fresh fetch can know', () {
      expect(base.applying(update(creditCheckId, 'Withdrawn'))!.nonce, base.nonce);
    });
  });

  group('ConsentUpdated.tryParse', () {
    Map<String, dynamic> event() => {
          'event': 'consent.updated',
          'principal': '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
          'fiduciary': fiduciaryAddress,
          'purposeId': creditCheckId,
          'purposeCode': 'credit_check',
          'status': 'Withdrawn',
          'expiresAt': null,
          'txHash': '0xcc',
          'at': 1,
        };

    test('reads a trd.md §6.5 consent.updated payload', () {
      final e = ConsentUpdated.tryParse(event())!;
      expect(e.status, ConsentStatus.withdrawn);
      expect(e.expiresAt, isNull);
      expect(e.txHash, '0xcc');
    });

    test('ignores other event types', () {
      expect(ConsentUpdated.tryParse({...event(), 'event': 'access.logged'}), isNull);
    });

    test('ignores malformed payloads instead of throwing', () {
      expect(ConsentUpdated.tryParse({...event(), 'purposeId': 5}), isNull);
      expect(ConsentUpdated.tryParse('nope'), isNull);
    });
  });
}
