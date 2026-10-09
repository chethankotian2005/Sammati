// The hard rule of drd.md §1 from the phone's side: the profile never leaves it in plain form. Every request the wallet
// makes in a whole account-and-share flow goes through the real Dio clients into a recording adapter, and none of them
// may contain a profile value in its path, query, headers or body. The one request that carries profile data, the
// Processor submit, carries ciphertext only.

import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sammati/core/consent_providers.dart';
import 'package:sammati/core/consents_controller.dart';
import 'package:sammati/core/core_api.dart';
import 'package:sammati/core/data_categories.dart';
import 'package:sammati/core/envelope.dart';
import 'package:sammati/core/preferences.dart';
import 'package:sammati/core/processor_api.dart';
import 'package:sammati/core/profile_controller.dart';
import 'package:sammati/core/requests_controller.dart';
import 'package:sammati/core/vault_controller.dart';
import 'package:sammati/core/wallet_providers.dart';
import 'package:sammati/core/wallet_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/fake_core.dart';
import 'support/fakes.dart';

/// Made-up values that appear nowhere else in the wallet.
const profile = {
  'fullName': 'Zebulon Quillfeather',
  'dob': '1987-03-14',
  'gender': 'prefer_not_to_say',
  'mobile': '9123456780',
  'email': 'zebulon.quillfeather@profile-test.example',
  'address': '77 Marigold Lane, Quillford',
  'pan': 'QZXWV9876K',
  'incomeBand': '9+ LPA',
  'employment': 'self-employed',
  'employer': 'Quillfeather Holdings',
  'bloodGroup': 'AB-',
  'allergies': 'Quillfeather pollen',
  'insurancePolicy': 'QFH-2087-4410',
  'foodPreference': 'vegan',
  'deliveryAddress': '9 Tamarind Court, Quillford',
};

class _Recorder implements HttpClientAdapter {
  _Recorder(this.processorPublicKey);

  final String processorPublicKey;
  final List<String> seen = [];

  @override
  Future<ResponseBody> fetch(RequestOptions options, Stream<Uint8List>? requestStream, Future<void>? cancelFuture) async {
    final body = requestStream == null ? '' : utf8.decode(await requestStream.expand((c) => c).toList());
    seen.add(jsonEncode({'method': options.method, 'uri': options.uri.toString(), 'headers': options.headers, 'body': body, 'data': options.data?.toString()}));

    Object answer = {};
    final path = options.path;
    if (path.endsWith('/v1/identities/availability')) answer = {'handle': options.queryParameters['handle'], 'available': true};
    if (path.endsWith('/v1/identities')) answer = {'handle': 'x', 'principal': 'x'};
    if (path.endsWith('/v1/processor')) answer = {'url': 'http://processor.test:4200'};
    if (path.endsWith('/v1/processor/pubkey')) answer = {'v': 1, 'alg': 'X25519', 'publicKey': processorPublicKey, 'mode': 'simulated-enclave'};
    if (path.endsWith('/v1/vault/submit')) {
      final envelope = Envelope.fromJson(((jsonDecode(body) as Map)['envelope'] as Map).cast<String, dynamic>());
      answer = {'handle': envelope.handle, 'ciphertextHash': envelope.ciphertextHash};
    }
    return ResponseBody.fromString(jsonEncode(answer), path.endsWith('/v1/vault/submit') ? 201 : 200, headers: {
      Headers.contentTypeHeader: ['application/json'],
    });
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  test('a whole account and share flow sends no profile value anywhere in plain form', () async {
    final vectors = jsonDecode(File('../shared/test-vectors/envelope.json').readAsStringSync()) as Map<String, dynamic>;
    final recorder = _Recorder((vectors['processor'] as Map)['publicKey'] as String);
    Dio dio() => Dio(BaseOptions(baseUrl: 'http://core.test:4000', contentType: Headers.jsonContentType, validateStatus: (s) => s != null && s < 500))..httpClientAdapter = recorder;

    SharedPreferences.setMockInitialValues({});
    final presence = FakePresence();
    final container = ProviderContainer(overrides: [
      sharedPreferencesProvider.overrideWithValue(await SharedPreferences.getInstance()),
      walletServiceProvider.overrideWithValue(WalletService(vault: FakeVault(), presence: presence)),
      coreApiFactoryProvider.overrideWithValue((url) => DioCoreApi(url, dio: dio())),
      processorApiFactoryProvider.overrideWithValue((url) => DioProcessorApi(url, dio: dio())),
      liveEventsFactoryProvider.overrideWithValue((_, _) => FakeLiveEvents()),
    ]);
    addTearDown(container.dispose);

    // account creation: availability, the wallet, the ID, the whole profile
    await container.read(walletAddressProvider.notifier).create(reason: 'create');
    expect(await container.read(coreApiFactoryProvider)('http://core.test:4000').handleAvailable('zebulonprivacy@sammati'), isTrue);
    expect(await container.read(identityProvider.notifier).register('zebulonprivacy', reason: 'id'), RequestsProblem.none);
    await container.read(profileProvider.notifier).start(Map.of(profile));
    expect(container.read(profileProvider).doc.fields, profile);

    // a share: only the purpose's fields, sealed for the Processor
    const categories = ['identity.name', 'contact.mobile', 'financial.pan', 'financial.income_band', 'financial.employment'];
    final payload = profilePayload(profile, categories);
    expect(payload.keys, unorderedEquals(['fullName', 'mobile', 'pan', 'incomeBand', 'employment']));
    final key = VaultKey(fiduciaryAddress, 'credit_check');
    container.listen(vaultProvider(key), (_, _) {}); // a screen is watching it, as in the app
    await container.read(vaultProvider(key).notifier).send(reason: 'send', payload: payload);
    expect(container.read(vaultProvider(key)).stage, VaultStage.sent);

    expect(recorder.seen.length, greaterThanOrEqualTo(5), reason: 'the flow made its requests through the recorder');
    final everything = recorder.seen.join('\n').toLowerCase();
    for (final entry in profile.entries) {
      expect(everything.contains(entry.value.toLowerCase()), isFalse, reason: '${entry.key} appeared in a request');
      expect(everything.contains(base64.encode(utf8.encode(entry.value)).toLowerCase()), isFalse, reason: '${entry.key} appeared base64 in a request');
    }
    // the fields the purpose did not name are not even in the sealed envelope: opened with the Processor key, it holds five
    final submit = recorder.seen.map((s) => jsonDecode(s) as Map<String, dynamic>).firstWhere((r) => (r['uri'] as String).endsWith('/v1/vault/submit'));
    final envelope = Envelope.fromJson(((jsonDecode(submit['body'] as String) as Map)['envelope'] as Map).cast<String, dynamic>());
    final principal = (jsonDecode(submit['body'] as String) as Map)['principal'] as String;
    final clear = jsonDecode(utf8.decode(await openEnvelope(
      envelope,
      Uint8List.fromList(List<int>.generate(32, (i) => int.parse(((vectors['processor'] as Map)['privateKey'] as String).substring(2 + i * 2, 4 + i * 2), radix: 16))),
      EnvelopeContext(fiduciary: fiduciaryAddress, principal: principal, purposeCode: 'credit_check'),
    ))) as Map<String, dynamic>;
    expect(clear, payload);
  });
}
