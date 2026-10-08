// The customer's profile as it exists on the phone (W-16, drd.md §3b). Never sent to Core or any server: the only way a
// value leaves is inside a per-purpose envelope for the Processor (vault_flow.dart).

import 'data_categories.dart';

/// A record of what was sent to a company for one purpose: field names and the handle, never values. It lets the wallet
/// say "your details changed, update what {company} holds?" when an edit touches a field that was sent (W-17).
class ShareRecord {
  const ShareRecord({
    required this.fiduciary,
    required this.purposeCode,
    required this.fields,
    required this.handle,
    required this.sentAt,
    this.stale = false,
    this.ciphertextHash,
    this.version,
  });

  factory ShareRecord.fromJson(Map<String, dynamic> json) => ShareRecord(
        fiduciary: json['fiduciary'] as String,
        purposeCode: json['purposeCode'] as String,
        fields: (json['fields'] as List).cast<String>(),
        handle: json['handle'] as String,
        sentAt: json['sentAt'] as int,
        stale: json['stale'] == true,
        ciphertextHash: json['ciphertextHash'] as String?,
        version: json['version'] as int?,
      );

  final String fiduciary;
  final String purposeCode;
  final List<String> fields;
  final String handle;

  /// Unix seconds.
  final int sentAt;

  /// A sent field was edited since: the company's copy is out of date.
  final bool stale;

  /// Hash of the ciphertext the Processor holds and its version (W-18, drd.md §3b): a hash and a number, no values.
  final String? ciphertextHash;
  final int? version;

  bool matches(String fiduciary, String purposeCode) =>
      this.fiduciary.toLowerCase() == fiduciary.toLowerCase() && this.purposeCode == purposeCode;

  ShareRecord copyWith({bool? stale}) => ShareRecord(
        fiduciary: fiduciary,
        purposeCode: purposeCode,
        fields: fields,
        handle: handle,
        sentAt: sentAt,
        stale: stale ?? this.stale,
        ciphertextHash: ciphertextHash,
        version: version,
      );

  Map<String, Object> toJson() => {
        'fiduciary': fiduciary,
        'purposeCode': purposeCode,
        'fields': fields,
        'handle': handle,
        'sentAt': sentAt,
        'stale': stale,
        'ciphertextHash': ?ciphertextHash,
        'version': ?version,
      };
}

/// The decrypted profile document: any subset of fields, and the record of what was shared.
class ProfileDoc {
  const ProfileDoc({this.fields = const {}, this.shares = const []});

  factory ProfileDoc.fromJson(Map<String, dynamic> json) {
    if (json['v'] != 1) throw const FormatException('Unknown profile version');
    final fields = <String, String>{};
    for (final e in (json['fields'] as Map<String, dynamic>).entries) {
      // A field the registry does not know is dropped, so a damaged or newer document cannot smuggle one into an envelope.
      if (e.value is String && categoryForField(e.key) != null && (e.value as String).isNotEmpty) fields[e.key] = e.value as String;
    }
    return ProfileDoc(
      fields: fields,
      shares: [for (final s in json['shares'] as List) ShareRecord.fromJson(s as Map<String, dynamic>)],
    );
  }

  final ProfileFields fields;
  final List<ShareRecord> shares;

  bool get isEmpty => fields.isEmpty;

  ShareRecord? shareFor(String fiduciary, String purposeCode) {
    for (final s in shares) {
      if (s.matches(fiduciary, purposeCode)) return s;
    }
    return null;
  }

  /// Sets or removes fields. Every share that carried a field whose value really changed becomes stale.
  ProfileDoc withFields(Map<String, String?> changes) {
    final next = {...fields};
    final changed = <String>{};
    for (final e in changes.entries) {
      final old = next[e.key];
      final value = e.value;
      if (value == null || value.isEmpty) {
        if (next.remove(e.key) != null) changed.add(e.key);
      } else if (old != value) {
        next[e.key] = value;
        changed.add(e.key);
      }
    }
    return ProfileDoc(
      fields: next,
      shares: [for (final s in shares) s.fields.any(changed.contains) ? s.copyWith(stale: true) : s],
    );
  }

  /// Records a send, replacing an earlier one for the same company and purpose, and clears its stale flag.
  ProfileDoc withShare(ShareRecord record) => ProfileDoc(
        fields: fields,
        shares: [for (final s in shares) if (!s.matches(record.fiduciary, record.purposeCode)) s, record],
      );

  ProfileDoc withoutShare(String fiduciary, String purposeCode) =>
      ProfileDoc(fields: fields, shares: [for (final s in shares) if (!s.matches(fiduciary, purposeCode)) s]);

  Map<String, Object> toJson() => {
        'v': 1,
        'fields': fields,
        'shares': [for (final s in shares) s.toJson()],
      };
}
