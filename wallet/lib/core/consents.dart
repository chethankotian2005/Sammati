// What Core reports about the principal's consents (trd.md §6.1) and the live
// updates that change it (§6.5), plus the display state derived from them.

import 'notice.dart';

/// On-chain status. `none` is never shown: a purpose never granted has no consent row.
enum ConsentStatus {
  none,
  active,
  withdrawn;

  static ConsentStatus parse(String value) => switch (value) {
        'Active' => active,
        'Withdrawn' => withdrawn,
        _ => none,
      };
}

/// What the wallet shows. Expiry is not a transaction: the chain says "Active" until
/// a purpose is withdrawn, so "expired" is decided here by comparing the clock.
enum ConsentState { active, expired, withdrawn }

class ConsentView {
  const ConsentView({
    required this.purposeId,
    required this.code,
    required this.title,
    required this.status,
    required this.expiresAt,
    required this.lastTx,
    required this.required,
    this.dataCategories = const [],
  });

  factory ConsentView.fromJson(Map<String, dynamic> json) => ConsentView(
        purposeId: json['purposeId'] as String,
        code: json['code'] as String,
        title: LocalizedText.fromJson(json['title']),
        status: ConsentStatus.parse(json['status'] as String),
        expiresAt: json['expiresAt'] as int?,
        lastTx: json['lastTx'] as String?,
        required: json['required'] as bool,
        dataCategories: ((json['dataCategories'] as List?) ?? const []).cast<String>(),
      );

  final String purposeId;
  final String code;
  final LocalizedText title;
  final ConsentStatus status;

  /// Unix seconds.
  final int? expiresAt;
  final String? lastTx;
  final bool required;

  /// Registry ids of the data this purpose uses (data_categories.dart): what a consent needs from the profile.
  final List<String> dataCategories;

  ConsentState stateAt(DateTime now) {
    if (status == ConsentStatus.withdrawn) return ConsentState.withdrawn;
    final expiry = expiresAt;
    if (expiry != null && expiry <= now.millisecondsSinceEpoch ~/ 1000) return ConsentState.expired;
    return ConsentState.active;
  }

  ConsentView copyWith({ConsentStatus? status, int? expiresAt, String? lastTx}) => ConsentView(
        purposeId: purposeId,
        code: code,
        title: title,
        status: status ?? this.status,
        expiresAt: expiresAt ?? this.expiresAt,
        lastTx: lastTx ?? this.lastTx,
        required: required,
        dataCategories: dataCategories,
      );
}

class CompanyConsents {
  const CompanyConsents({required this.fiduciary, required this.consents});

  factory CompanyConsents.fromJson(Map<String, dynamic> json) => CompanyConsents(
        fiduciary: Fiduciary.fromJson(json['fiduciary'] as Map<String, dynamic>),
        consents: (json['consents'] as List)
            .map((c) => ConsentView.fromJson(c as Map<String, dynamic>))
            .where((c) => c.status != ConsentStatus.none)
            .toList(),
      );

  final Fiduciary fiduciary;
  final List<ConsentView> consents;

  int activeCount(DateTime now) => consents.where((c) => c.stateAt(now) == ConsentState.active).length;

  /// The soonest expiry among active purposes, for the "Expires in 5 months" line.
  int? nextExpiry(DateTime now) {
    final expiries = [
      for (final c in consents)
        if (c.stateAt(now) == ConsentState.active && c.expiresAt != null) c.expiresAt!,
    ]..sort();
    return expiries.isEmpty ? null : expiries.first;
  }
}

/// `GET /v1/principals/:addr/consents`.
class ConsentsSnapshot {
  const ConsentsSnapshot({
    required this.principal,
    required this.nonce,
    required this.domain,
    required this.companies,
  });

  factory ConsentsSnapshot.fromJson(Map<String, dynamic> json) => ConsentsSnapshot(
        principal: json['principal'] as String,
        nonce: json['nonce'] as String,
        domain: Eip712DomainInfo.fromJson(json['domain'] as Map<String, dynamic>),
        companies: (json['fiduciaries'] as List)
            .map((c) => CompanyConsents.fromJson(c as Map<String, dynamic>))
            .where((c) => c.consents.isNotEmpty)
            .toList(),
      );

  final String principal;

  /// The principal's on-chain nonce, which a WithdrawConsent must carry.
  final String nonce;
  final Eip712DomainInfo domain;
  final List<CompanyConsents> companies;

  int activeCount(DateTime now) => companies.fold(0, (sum, c) => sum + c.activeCount(now));

  CompanyConsents? company(String address) {
    for (final c in companies) {
      if (c.fiduciary.address.toLowerCase() == address.toLowerCase()) return c;
    }
    return null;
  }

  ConsentView? consent(String fiduciary, String purposeId) {
    final match = company(fiduciary)?.consents.where((c) => c.purposeId.toLowerCase() == purposeId.toLowerCase());
    return (match == null || match.isEmpty) ? null : match.first;
  }

  /// Applies a live update, or returns null if it names a purpose this snapshot does not
  /// know (a new company or purpose): the caller then refetches rather than guessing.
  ConsentsSnapshot? applying(ConsentUpdated event) {
    if (consent(event.fiduciary, event.purposeId) == null) return null;
    return ConsentsSnapshot(
      principal: principal,
      nonce: nonce,
      domain: domain,
      companies: [
        for (final company in companies)
          if (company.fiduciary.address.toLowerCase() != event.fiduciary.toLowerCase())
            company
          else
            CompanyConsents(
              fiduciary: company.fiduciary,
              consents: [
                for (final c in company.consents)
                  if (c.purposeId.toLowerCase() == event.purposeId.toLowerCase())
                    c.copyWith(status: event.status, expiresAt: event.expiresAt, lastTx: event.txHash)
                  else
                    c,
              ],
            ),
      ],
    );
  }
}

/// WebSocket `consent.updated` (trd.md §6.5).
class ConsentUpdated {
  const ConsentUpdated({
    required this.principal,
    required this.fiduciary,
    required this.purposeId,
    required this.status,
    required this.expiresAt,
    required this.txHash,
  });

  /// Null for any other event type, so callers can ignore events they do not handle.
  static ConsentUpdated? tryParse(Object? decoded) {
    if (decoded is! Map<String, dynamic> || decoded['event'] != 'consent.updated') return null;
    try {
      return ConsentUpdated(
        principal: decoded['principal'] as String,
        fiduciary: decoded['fiduciary'] as String,
        purposeId: decoded['purposeId'] as String,
        status: ConsentStatus.parse(decoded['status'] as String),
        expiresAt: decoded['expiresAt'] as int?,
        txHash: decoded['txHash'] as String,
      );
    } on TypeError {
      return null;
    }
  }

  final String principal;
  final String fiduciary;
  final String purposeId;
  final ConsentStatus status;
  final int? expiresAt;
  final String txHash;
}
