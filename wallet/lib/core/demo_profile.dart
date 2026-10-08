// The fictional customer profile of the demo (drd.md §5). It exists in exactly two places: here, on the phone, and
// in the Sammati Processor's memory while it decides a loan. No backend, database, log or event carries it.

/// Purposes whose data the wallet can send to the Processor (ui.md V2). Mirrors VAULT_PURPOSES in shared/src/seed.ts.
const vaultPurposes = {'credit_check'};

/// The income bands and employment statuses the Processor's loan rules know (trd.md §6.7). What is encrypted is the
/// fixed value; the screen shows a translated label (ui.md W10).
const incomeBands = ['0-3 LPA', '3-6 LPA', '6-9 LPA', '9+ LPA'];
const employmentStatuses = ['salaried', 'self-employed', 'student', 'unemployed'];

final _panPattern = RegExp(r'^[A-Z]{5}[0-9]{4}[A-Z]$');

/// A PAN as the Processor will accept it. Checked on the phone before anything is encrypted.
bool isValidPan(String value) => _panPattern.hasMatch(value);

/// What W10 collects. It exists only in the screen that built it, and only until it has been encrypted.
class SensitiveDetails {
  const SensitiveDetails({required this.pan, required this.incomeBand, required this.employment, this.score});

  final String pan;
  final String incomeBand;
  final String employment;

  /// Only the demo profile has a credit score; a person typing their details by hand has none to give, and the
  /// Processor then says it assumed one (trd.md §6.7).
  final int? score;

  /// What gets encrypted: canonical-JSON-friendly (integers only).
  Map<String, Object> toPayload() => {'pan': pan, 'incomeBand': incomeBand, 'employment': employment, 'score': ?score};
}

abstract final class DemoProfile {
  static const pan = 'ABCDE1234F';
  static const incomeBand = '6-9 LPA';
  static const employment = 'salaried';
  static const score = 742;

  static const details = SensitiveDetails(pan: pan, incomeBand: incomeBand, employment: employment, score: score);

  /// What gets encrypted when the demo profile is used.
  static Map<String, Object> get payload => details.toPayload();
}
