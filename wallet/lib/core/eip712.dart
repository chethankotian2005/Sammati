// Dart copy of shared/eip712.ts. Field names and order are part of the spec
// (trd.md §3.1, §4.1) and must match the TypeScript definition byte for byte;
// test/eip712_test.dart proves it against shared/test-vectors/eip712.json.

import 'dart:convert';

import 'package:convert/convert.dart';
import 'package:eth_sig_util/eth_sig_util.dart';

const eip712Name = 'Sammati';
const eip712Version = '1';

class TypedField {
  const TypedField(this.name, this.type);
  final String name;
  final String type;

  Map<String, String> toJson() => {'name': name, 'type': type};
}

const grantConsentType = <TypedField>[
  TypedField('principal', 'address'),
  TypedField('fiduciary', 'address'),
  TypedField('purposeId', 'bytes32'),
  TypedField('expiresAt', 'uint64'),
  TypedField('noticeHash', 'bytes32'),
  TypedField('nonce', 'uint256'),
  TypedField('deadline', 'uint64'),
];

const withdrawConsentType = <TypedField>[
  TypedField('principal', 'address'),
  TypedField('fiduciary', 'address'),
  TypedField('purposeId', 'bytes32'),
  TypedField('nonce', 'uint256'),
  TypedField('deadline', 'uint64'),
];

const _domainType = <TypedField>[
  TypedField('name', 'string'),
  TypedField('version', 'string'),
  TypedField('chainId', 'uint256'),
  TypedField('verifyingContract', 'address'),
];

class Eip712Domain {
  const Eip712Domain({required this.chainId, required this.verifyingContract});
  final int chainId;
  final String verifyingContract;

  Map<String, Object> toJson() => {
        'name': eip712Name,
        'version': eip712Version,
        'chainId': chainId,
        'verifyingContract': verifyingContract,
      };
}

/// Messages mirror the TS shapes: timestamps are ints, the uint256 nonce is a
/// decimal string so it survives JSON.
class GrantConsent {
  const GrantConsent({
    required this.principal,
    required this.fiduciary,
    required this.purposeId,
    required this.expiresAt,
    required this.noticeHash,
    required this.nonce,
    required this.deadline,
  });
  final String principal;
  final String fiduciary;
  final String purposeId;
  final int expiresAt;
  final String noticeHash;
  final String nonce;
  final int deadline;

  Map<String, Object> toJson() => {
        'principal': principal,
        'fiduciary': fiduciary,
        'purposeId': purposeId,
        'expiresAt': expiresAt,
        'noticeHash': noticeHash,
        'nonce': nonce,
        'deadline': deadline,
      };
}

class WithdrawConsent {
  const WithdrawConsent({
    required this.principal,
    required this.fiduciary,
    required this.purposeId,
    required this.nonce,
    required this.deadline,
  });
  final String principal;
  final String fiduciary;
  final String purposeId;
  final String nonce;
  final int deadline;

  Map<String, Object> toJson() => {
        'principal': principal,
        'fiduciary': fiduciary,
        'purposeId': purposeId,
        'nonce': nonce,
        'deadline': deadline,
      };
}

/// eth_sig_util needs EIP712Domain listed in `types` to hash the domain; the
/// shared definition omits it because ethers derives it from the domain.
String _typedDataJson(
  Eip712Domain domain,
  String primaryType,
  List<TypedField> fields,
  Map<String, Object> message,
) =>
    jsonEncode({
      'types': {
        'EIP712Domain': _domainType.map((f) => f.toJson()).toList(),
        primaryType: fields.map((f) => f.toJson()).toList(),
      },
      'primaryType': primaryType,
      'domain': domain.toJson(),
      'message': message,
    });

String grantTypedDataJson(Eip712Domain domain, GrantConsent m) =>
    _typedDataJson(domain, 'GrantConsent', grantConsentType, m.toJson());

String withdrawTypedDataJson(Eip712Domain domain, WithdrawConsent m) =>
    _typedDataJson(domain, 'WithdrawConsent', withdrawConsentType, m.toJson());

/// EIP-712 V4 digest: what the key actually signs (no extra prefix).
String eip712Digest(String typedDataJson) => '0x${hex.encode(TypedDataUtil.hashMessage(
      jsonData: typedDataJson,
      version: TypedDataVersion.V4,
    ))}';

/// Returns 0x r||s||v (65 bytes, v = 27/28), as ECDSA.recover expects.
String signTypedDataV4(String privateKeyHex, String typedDataJson) =>
    EthSigUtil.signTypedData(
      privateKey: privateKeyHex,
      jsonData: typedDataJson,
      version: TypedDataVersion.V4,
    );
