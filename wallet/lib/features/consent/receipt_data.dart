import 'package:flutter/painting.dart';

import '../../core/notice.dart';

class ReceiptItem {
  const ReceiptItem({required this.title, required this.txHash, required this.expiresAt});

  final LocalizedText title;
  final String txHash;

  /// Unix seconds.
  final int expiresAt;
}

/// What W4 shows; passed through the router so the receipt needs no network call.
class ReceiptData {
  const ReceiptData({required this.companyName, required this.companyColor, required this.items});

  final String companyName;
  final Color companyColor;
  final List<ReceiptItem> items;
}

/// Core sends company colours as `#RRGGBB`; falls back to [fallback] on anything else.
Color parseCompanyColor(String hex, Color fallback) {
  final match = RegExp(r'^#([0-9a-fA-F]{6})$').firstMatch(hex);
  if (match == null) return fallback;
  return Color(0xFF000000 | int.parse(match.group(1)!, radix: 16));
}
