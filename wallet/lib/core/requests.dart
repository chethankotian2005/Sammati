// Targeted consent requests, as the wallet sees them (trd.md §6.11, ui.md W11): what a company asked, from whom, and
// the signed messages that decline or block. Everything here is about a company and its request; nothing in it is
// the customer's data.

import 'notice.dart' show LocalizedText;

class InboxPurpose {
  const InboxPurpose({required this.code, required this.title});
  final String code;
  final LocalizedText title;
}

class InboxRequest {
  const InboxRequest({
    required this.requestId,
    required this.fiduciary,
    required this.company,
    required this.color,
    required this.purposes,
    required this.message,
    required this.createdAt,
    required this.expiresAt,
  });

  final String requestId;

  /// The company's address; the consent notice is fetched and signed against it.
  final String fiduciary;
  final String company;

  /// `#RRGGBB` as Core sends it.
  final String color;
  final List<InboxPurpose> purposes;

  /// What the company wrote; shown as "Message from {company}", never as an identity.
  final String? message;

  /// Unix seconds.
  final int createdAt;
  final int expiresAt;

  /// Null for a row the wallet cannot read: it is skipped, not fatal.
  static InboxRequest? tryParse(Object? json) {
    try {
      final m = json as Map<String, dynamic>;
      final f = m['fiduciary'] as Map<String, dynamic>;
      return InboxRequest(
        requestId: m['requestId'] as String,
        fiduciary: f['address'] as String,
        company: f['name'] as String,
        color: (f['color'] as String?) ?? '',
        purposes: [
          for (final p in m['purposes'] as List)
            InboxPurpose(code: (p as Map<String, dynamic>)['code'] as String, title: LocalizedText.fromJson(p['title'])),
        ],
        message: m['message'] as String?,
        createdAt: m['createdAt'] as int,
        expiresAt: m['expiresAt'] as int,
      );
    } on Object {
      return null;
    }
  }
}

class BlockedCompany {
  const BlockedCompany({required this.fiduciary, required this.name, required this.blockedAt});
  final String fiduciary;
  final String name;
  final int blockedAt;

  static BlockedCompany? tryParse(Object? json) {
    try {
      final m = json as Map<String, dynamic>;
      final f = m['fiduciary'] as Map<String, dynamic>;
      return BlockedCompany(fiduciary: f['address'] as String, name: f['name'] as String, blockedAt: m['blockedAt'] as int);
    } on Object {
      return null;
    }
  }
}

/// A `consent.requested` frame: a company just asked this wallet for consent. The wallet refetches its inbox when
/// one arrives, so only what it needs to recognise the new card is kept.
class ConsentRequested {
  const ConsentRequested({required this.requestId, required this.fiduciary, required this.fiduciaryName});
  final String requestId;
  final String fiduciary;
  final String fiduciaryName;

  static ConsentRequested? tryParse(Object? decoded) {
    if (decoded is! Map<String, dynamic> || decoded['event'] != 'consent.requested') return null;
    final id = decoded['requestId'];
    final f = decoded['fiduciary'];
    final name = decoded['fiduciaryName'];
    if (id is! String || f is! String || name is! String) return null;
    return ConsentRequested(requestId: id, fiduciary: f, fiduciaryName: name);
  }
}

// --- the signed messages (trd.md §4.5): plain EIP-191 text, verified by Core, never put on chain ---

/// A handle is `name@sammati`: 3 to 30 of a-z 0-9 . _ - before the suffix.
const sammatiSuffix = '@sammati';
final _handleName = RegExp(r'^[a-z0-9._-]{3,30}$');

bool isValidHandleName(String name) => _handleName.hasMatch(name);

String identityMessage(String handle, String principal, int issuedAt) => 'sammati-id:v1:${handle.toLowerCase()}:${principal.toLowerCase()}:$issuedAt';

String declineMessage(String requestId, String principal, int issuedAt) => 'sammati-decline:v1:$requestId:${principal.toLowerCase()}:$issuedAt';

String blockMessage(String action, String fiduciary, String principal, int issuedAt) =>
    'sammati-block:v1:$action:${fiduciary.toLowerCase()}:${principal.toLowerCase()}:$issuedAt';
