// The fictional customer profile of the demo (drd.md §5). It exists in exactly two places: here, on the phone, and
// in the Sammati Processor's memory while it decides a loan. No backend, database, log or event carries it.

/// Purposes whose data the wallet can send to the Processor (ui.md V2). Mirrors VAULT_PURPOSES in shared/src/seed.ts.
const vaultPurposes = {'credit_check'};

abstract final class DemoProfile {
  static const pan = 'ABCDE1234F';
  static const incomeBand = '6-9 LPA';
  static const score = 742;

  /// What gets encrypted: canonical-JSON-friendly (integers only).
  static const payload = <String, Object>{'pan': pan, 'incomeBand': incomeBand, 'score': score};
}
