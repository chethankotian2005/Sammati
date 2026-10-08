class RightsRequestRow {
  const RightsRequestRow({
    required this.id,
    required this.principal,
    required this.fiduciary,
    required this.fiduciaryName,
    required this.type,
    required this.note,
    required this.status,
    required this.createdAt,
    required this.updatedAt,
  });

  final String id;
  final String principal;
  final String fiduciary;
  final String fiduciaryName;
  final String type;
  final String note;
  final String status;
  final int createdAt;
  final int updatedAt;

  static RightsRequestRow? tryParse(Map<String, dynamic> json) {
    try {
      return RightsRequestRow(
        id: json['id'] as String,
        principal: json['principal'] as String,
        fiduciary: json['fiduciary'] as String,
        fiduciaryName: json['fiduciaryName'] as String,
        type: json['type'] as String,
        note: json['note'] as String,
        status: json['status'] as String,
        createdAt: json['createdAt'] as int,
        updatedAt: json['updatedAt'] as int,
      );
    } catch (_) {
      return null;
    }
  }
}
