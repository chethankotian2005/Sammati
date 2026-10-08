// Notice model plus the local noticeHash recomputation (drd.md §4.2). The wallet
// never signs the hash Core sends: it signs the one it computed itself from the
// text it is about to show, so the user cannot be signing a different notice.

import 'dart:convert';
import 'dart:typed_data';

import 'package:convert/convert.dart';
import 'package:web3dart/crypto.dart' show keccak256;

/// Canonical JSON (drd.md §4.1): sorted keys, no whitespace, UTF-8, integers only.
/// Mirrors shared/src/canonical.ts; floats are rejected so two implementations
/// can never disagree on number formatting.
String canonicalJson(Object? value) {
  if (value == null || value is bool || value is String) return jsonEncode(value);
  if (value is int) return value.toString();
  if (value is List) return '[${value.map(canonicalJson).join(',')}]';
  if (value is Map) {
    final keys = value.keys.cast<String>().toList()..sort();
    return '{${keys.map((k) => '${jsonEncode(k)}:${canonicalJson(value[k])}').join(',')}}';
  }
  throw FormatException('canonicalJson: unsupported value of type ${value.runtimeType}');
}

String keccakHex(String text) => '0x${hex.encode(keccak256(Uint8List.fromList(utf8.encode(text))))}';

class LocalizedText {
  const LocalizedText({required this.en, required this.hi, required this.kn});

  factory LocalizedText.fromJson(Object? json) {
    final m = json as Map<String, dynamic>;
    return LocalizedText(en: m['en'] as String, hi: m['hi'] as String, kn: m['kn'] as String);
  }

  final String en;
  final String hi;
  final String kn;

  String forLanguage(String code) => switch (code) {
        'hi' => hi,
        'kn' => kn,
        _ => en,
      };
}

class NoticePurpose {
  const NoticePurpose({
    required this.id,
    required this.code,
    required this.title,
    required this.description,
    required this.dataCategories,
    required this.retentionDays,
    required this.sharesThirdParty,
    required this.required,
  });

  factory NoticePurpose.fromJson(Map<String, dynamic> json) => NoticePurpose(
        id: json['id'] as String,
        code: json['code'] as String,
        title: LocalizedText.fromJson(json['title']),
        description: LocalizedText.fromJson(json['description']),
        dataCategories: (json['dataCategories'] as List).cast<String>(),
        retentionDays: json['retentionDays'] as int,
        sharesThirdParty: json['sharesThirdParty'] as bool,
        required: json['required'] as bool,
      );

  final String id;
  final String code;
  final LocalizedText title;
  final LocalizedText description;
  final List<String> dataCategories;
  final int retentionDays;
  final bool sharesThirdParty;
  final bool required;
}

class Fiduciary {
  const Fiduciary({required this.address, required this.name, required this.color, this.sector});

  factory Fiduciary.fromJson(Map<String, dynamic> json) => Fiduciary(
        address: json['address'] as String,
        name: json['name'] as String,
        color: json['color'] as String,
        // ui.md W3 shows the sector; Core's notice does not carry it yet, so it is optional.
        sector: json['sector'] as String?,
      );

  final String address;
  final String name;
  final String color;
  final String? sector;
}

class Eip712DomainInfo {
  const Eip712DomainInfo({required this.chainId, required this.verifyingContract});

  factory Eip712DomainInfo.fromJson(Map<String, dynamic> json) => Eip712DomainInfo(
        chainId: json['chainId'] as int,
        verifyingContract: json['verifyingContract'] as String,
      );

  final int chainId;
  final String verifyingContract;
}

/// The notice exactly as Core sent it. Use [ConsentNotice.verify] before showing it.
class ConsentNotice {
  const ConsentNotice({
    required this.requestId,
    required this.fiduciary,
    required this.purposes,
    required this.noticeHash,
    required this.noticeVersion,
    required this.domain,
    required this.nonce,
  });

  factory ConsentNotice.fromJson(Map<String, dynamic> json) => ConsentNotice(
        requestId: json['requestId'] as String,
        fiduciary: Fiduciary.fromJson(json['fiduciary'] as Map<String, dynamic>),
        purposes: (json['purposes'] as List)
            .map((p) => NoticePurpose.fromJson(p as Map<String, dynamic>))
            .toList(),
        noticeHash: json['noticeHash'] as String,
        noticeVersion: json['noticeVersion'] as int,
        domain: Eip712DomainInfo.fromJson(json['domain'] as Map<String, dynamic>),
        nonce: json['nonce'] as String,
      );

  final String requestId;
  final Fiduciary fiduciary;
  final List<NoticePurpose> purposes;
  final String noticeHash;
  final int noticeVersion;
  final Eip712DomainInfo domain;

  /// The principal's current on-chain nonce; purpose i of the selection signs nonce + i.
  final String nonce;

  /// drd.md §4.2, computed from the text the user will actually see.
  String computeNoticeHash() => keccakHex(canonicalJson({
        'fiduciary': fiduciary.address,
        'purposes': [
          for (final p in purposes)
            {
              'id': p.id,
              'desc_en': p.description.en,
              'desc_hi': p.description.hi,
              'desc_kn': p.description.kn,
              'dataCategories': p.dataCategories,
              'retentionDays': p.retentionDays,
              'sharesThirdParty': p.sharesThirdParty,
            },
        ],
        'version': noticeVersion,
      }));

  bool get hashMatches => computeNoticeHash().toLowerCase() == noticeHash.toLowerCase();
}
