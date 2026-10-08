import 'dart:convert';
import 'dart:typed_data';

import 'package:convert/convert.dart';
import 'package:eth_sig_util/eth_sig_util.dart';
import 'package:sammati/core/core_api.dart';
import 'package:sammati/core/notice.dart';

const fiduciaryAddress = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const creditCheckId = '0x707a80a4813eb36bdfb3f3aebdeea292384852e7f680fd128ea1009ac1192b29';
const marketingId = '0x200aac73b1ffccefb5cbde2ae0c42cc316ec9e58f7178cc4692fffee77e36cb3';
const kycId = '0x3333333333333333333333333333333333333333333333333333333333333333';
const verifyingContract = '0x5FbDB2315678afecb367f032d93F642f64180aa3';

/// A notice as Core would serve it: Hindi and Kannada text included, so the
/// hash covers non-ASCII characters, with a correct noticeHash.
Map<String, dynamic> buildNoticeJson({String nonce = '0', String? sector}) {
  Map<String, dynamic> purpose(
    String id,
    String code,
    String en,
    String hi,
    String kn,
    List<String> categories,
    int retentionDays, {
    bool shares = false,
    bool required = false,
  }) =>
      {
        'id': id,
        'code': code,
        'title': {'en': en, 'hi': hi, 'kn': kn},
        'description': {'en': 'About $en', 'hi': 'के बारे में $hi', 'kn': '$kn ಬಗ್ಗೆ'},
        'dataCategories': categories,
        'retentionDays': retentionDays,
        'sharesThirdParty': shares,
        'required': required,
      };

  final json = <String, dynamic>{
    'requestId': 'req_test0001',
    'fiduciary': {
      'address': fiduciaryAddress,
      'name': 'QuickLoan',
      'color': '#2F5BEA',
      'sector': ?sector,
    },
    'purposes': [
      purpose(creditCheckId, 'credit_check', 'Credit check', 'क्रेडिट जाँच', 'ಕ್ರೆಡಿಟ್ ಪರಿಶೀಲನೆ', ['PAN', 'income'], 365),
      purpose(marketingId, 'marketing', 'Loan offers', 'ऋण ऑफ़र', 'ಸಾಲದ ಆಫರ್‌ಗಳು', ['phone', 'email'], 180, shares: true),
      purpose(kycId, 'kyc', 'Identity check', 'पहचान जाँच', 'ಗುರುತಿನ ಪರಿಶೀಲನೆ', ['name'], 30, required: true),
    ],
    'noticeHash': '0x',
    'noticeVersion': 1,
    'domain': {'name': 'Sammati', 'version': '1', 'chainId': 31337, 'verifyingContract': verifyingContract},
    'nonce': nonce,
  };
  json['noticeHash'] = noticeHashOf(json);
  return json;
}

/// The hash Core would compute for [json]'s text.
String noticeHashOf(Map<String, dynamic> json) => ConsentNotice.fromJson(json).computeNoticeHash();

String qrJson({String requestId = 'req_test0001', String fiduciary = fiduciaryAddress}) => jsonEncode({
      'v': 1,
      'core': 'http://core.test:4000',
      'requestId': requestId,
      'fiduciary': fiduciary,
      'name': 'QuickLoan',
    });

QrPayload testPayload() => QrPayload.tryParse(jsonDecode(qrJson()))!;

/// Stands in for Core. The nonce advances with each recorded grant, as on the ledger.
class FakeCoreApi implements CoreApi {
  FakeCoreApi({Map<String, dynamic>? notice}) : _notice = notice ?? buildNoticeJson();

  Map<String, dynamic> _notice;
  Object? noticeError;

  /// Zero-based index of the grant call that fails, or -1 for none.
  int failGrantAt = -1;
  CoreException grantError = const CoreException(CoreFailure.server);

  final List<Map<String, Object>> grants = [];
  final List<String> signatures = [];
  int noticeFetches = 0;

  set notice(Map<String, dynamic> value) => _notice = value;

  @override
  Future<ConsentNotice> getNotice(String requestId, {required String principal}) async {
    noticeFetches++;
    if (noticeError != null) throw noticeError!;
    final base = BigInt.parse(_notice['nonce'] as String);
    return ConsentNotice.fromJson({..._notice, 'nonce': (base + BigInt.from(grants.length)).toString()});
  }

  @override
  Future<TxResult> grant(Map<String, Object> request, String signature) async {
    if (grants.length == failGrantAt) throw grantError;
    grants.add(request);
    signatures.add(signature);
    return TxResult(txHash: '0x${grants.length.toRadixString(16).padLeft(64, '0')}', status: 'confirmed');
  }
}

/// The address that signed [digestHex].
String recoverSigner(String digestHex, String signature) => SignatureUtil.ecRecover(
      signature: signature,
      message: Uint8List.fromList(hex.decode(digestHex.substring(2))),
      isPersonalSign: false,
    );
