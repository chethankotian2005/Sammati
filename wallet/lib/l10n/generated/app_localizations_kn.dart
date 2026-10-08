// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Kannada (`kn`).
class AppLocalizationsKn extends AppLocalizations {
  AppLocalizationsKn([String locale = 'kn']) : super(locale);

  @override
  String get appName => 'Sammati';

  @override
  String get give_consent => 'ಒಪ್ಪಿಗೆ ನೀಡಿ';

  @override
  String get withdraw => 'ಹಿಂಪಡೆಯಿರಿ';

  @override
  String withdrawn_blocked(String company) {
    return 'ಹಿಂಪಡೆಯಲಾಗಿದೆ. $company ನಿರ್ಬಂಧಿಸಲಾಗಿದೆ.';
  }

  @override
  String get allowed => 'ಅನುಮತಿಸಲಾಗಿದೆ';

  @override
  String get blocked => 'ನಿರ್ಬಂಧಿಸಲಾಗಿದೆ';

  @override
  String get scan_to_connect => 'ಸಂಪರ್ಕಿಸಲು ಸ್ಕ್ಯಾನ್ ಮಾಡಿ';

  @override
  String get withdraw_easy =>
      'ನೀವು ನಂತರ ಯಾವುದೇ ಉದ್ದೇಶದ ಒಪ್ಪಿಗೆಯನ್ನು ನೀಡಿದಷ್ಟೇ ಸುಲಭವಾಗಿ ಹಿಂಪಡೆಯಬಹುದು.';

  @override
  String get recorded => 'ಲೆಡ್ಜರ್‌ನಲ್ಲಿ ದಾಖಲಾಗಿದೆ';

  @override
  String get nav_consents => 'ಒಪ್ಪಿಗೆಗಳು';

  @override
  String get nav_activity => 'ಚಟುವಟಿಕೆ';

  @override
  String get nav_scan => 'ಸ್ಕ್ಯಾನ್';

  @override
  String get nav_rights => 'ಹಕ್ಕುಗಳು';

  @override
  String get nav_me => 'ನಾನು';

  @override
  String get consents_empty =>
      'ಇನ್ನೂ ಯಾವುದೇ ಕಂಪನಿ ಇಲ್ಲ. ನಿಮ್ಮ ಮೊದಲ ಕಂಪನಿಯನ್ನು ಸಂಪರ್ಕಿಸಲು QR ಕೋಡ್ ಸ್ಕ್ಯಾನ್ ಮಾಡಿ.';

  @override
  String get activity_empty =>
      'ಇನ್ನೂ ಯಾವುದೇ ಚಟುವಟಿಕೆ ಇಲ್ಲ. ಕಂಪನಿಗಳು ಡೇಟಾ ಬಳಸಿದಾಗ ಇಲ್ಲಿ ಕಾಣಿಸುತ್ತದೆ.';

  @override
  String get rights_access => 'ಕಂಪನಿಯ ಬಳಿ ಏನಿದೆ ಎಂದು ನೋಡಿ';

  @override
  String get rights_erasure => 'ಡೇಟಾ ಅಳಿಸಲು ಕಂಪನಿಗೆ ಕೇಳಿ';

  @override
  String get rights_grievance => 'ದೂರು ಸಲ್ಲಿಸಿ';

  @override
  String get me_language => 'ಭಾಷೆ';

  @override
  String get me_developer => 'ಡೆವಲಪರ್ ಸೆಟ್ಟಿಂಗ್‌ಗಳು';

  @override
  String get language_english => 'English';

  @override
  String get language_hindi => 'हिन्दी';

  @override
  String get language_kannada => 'ಕನ್ನಡ';

  @override
  String get dev_core_url => 'Core URL';

  @override
  String get dev_core_url_hint =>
      'ನಿಮ್ಮ Wi-Fi ನಲ್ಲಿರುವ Sammati Core ವಿಳಾಸ, ಉದಾಹರಣೆಗೆ http://192.168.1.5:4000';

  @override
  String get dev_core_url_invalid =>
      'http:// ಅಥವಾ https:// ನಿಂದ ಪ್ರಾರಂಭವಾಗುವ ಪೂರ್ಣ ವಿಳಾಸ ನಮೂದಿಸಿ';

  @override
  String get dev_save => 'ಉಳಿಸಿ';

  @override
  String get dev_saved => 'ಉಳಿಸಲಾಗಿದೆ';

  @override
  String get language_title => 'ನಿಮ್ಮ ಭಾಷೆಯನ್ನು ಆಯ್ಕೆಮಾಡಿ';

  @override
  String get onb_continue => 'ಮುಂದುವರಿಸಿ';

  @override
  String get onb_next => 'ಮುಂದೆ';

  @override
  String get onb_1 => 'ನಿಮ್ಮ ಒಪ್ಪಿಗೆ ಹೊಂದಿರುವ ಪ್ರತಿ ಕಂಪನಿಯನ್ನು ನೋಡಿ';

  @override
  String get onb_2 => 'ಎಲ್ಲದಕ್ಕೂ ಅಲ್ಲ, ಒಂದು ಉದ್ದೇಶಕ್ಕೆ ಮಾತ್ರ ಹೌದು ಎನ್ನಿ';

  @override
  String get onb_3 => 'ಒಂದೇ ಟ್ಯಾಪ್‌ನಲ್ಲಿ ಹಿಂಪಡೆಯಿರಿ';

  @override
  String get wallet_create_title =>
      'ಫಿಂಗರ್‌ಪ್ರಿಂಟ್ ಅಥವಾ PIN ಮೂಲಕ ಸುರಕ್ಷಿತಗೊಳಿಸಿ';

  @override
  String get wallet_create_body =>
      'ನಿಮ್ಮ ಒಪ್ಪಿಗೆಗಳಿಗೆ ಈ ಫೋನ್‌ನಲ್ಲೇ ಸಹಿ ಹಾಕಲಾಗುತ್ತದೆ. ನೀವು ಮಾತ್ರ ಅವುಗಳನ್ನು ಅನುಮೋದಿಸಬಹುದು.';

  @override
  String get wallet_create_button => 'ವಾಲೆಟ್ ರಚಿಸಿ';

  @override
  String get wallet_no_lock =>
      'ಈ ಫೋನ್‌ನಲ್ಲಿ ಸ್ಕ್ರೀನ್ ಲಾಕ್ ಹೊಂದಿಸಿ, ನಂತರ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.';

  @override
  String get wallet_auth_failed =>
      'ಇದು ನೀವೇ ಎಂದು ದೃಢಪಡಿಸಲಾಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.';

  @override
  String get wallet_create_failed => 'ವಾಲೆಟ್ ರಚಿಸಲಾಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.';

  @override
  String get auth_reason_create => 'ನಿಮ್ಮ ವಾಲೆಟ್ ರಚಿಸಲು ದೃಢೀಕರಿಸಿ';

  @override
  String get auth_reason_sign => 'ಇದನ್ನು ಅನುಮೋದಿಸಲು ದೃಢೀಕರಿಸಿ';

  @override
  String get me_wallet_address => 'ವಾಲೆಟ್ ವಿಳಾಸ';

  @override
  String get copied => 'ನಕಲಿಸಲಾಗಿದೆ';

  @override
  String get scan_hint => 'ಕ್ಯಾಮೆರಾವನ್ನು ಕಂಪನಿಯ QR ಕೋಡ್‌ನತ್ತ ಹಿಡಿಯಿರಿ.';

  @override
  String get scan_torch => 'ಟಾರ್ಚ್';

  @override
  String get scan_camera_denied =>
      'QR ಕೋಡ್ ಸ್ಕ್ಯಾನ್ ಮಾಡಲು ಕ್ಯಾಮೆರಾ ಅನುಮತಿ ನೀಡಿ.';

  @override
  String get scan_invalid_qr => 'ಇದು Sammati QR ಕೋಡ್ ಅಲ್ಲ.';

  @override
  String get scan_paste_hint => 'QR ಪಠ್ಯವನ್ನು ಇಲ್ಲಿ ಅಂಟಿಸಿ';

  @override
  String get scan_paste_open => 'ತೆರೆಯಿರಿ';

  @override
  String get error_unreachable =>
      'Sammati ಅನ್ನು ತಲುಪಲಾಗಲಿಲ್ಲ. Wi-Fi ಪರಿಶೀಲಿಸಿ.';

  @override
  String get request_gone =>
      'ಈ ವಿನಂತಿ ಇನ್ನು ಮಾನ್ಯವಾಗಿಲ್ಲ. ಕಂಪನಿಯಿಂದ ಹೊಸ QR ಕೋಡ್ ಕೇಳಿ.';

  @override
  String get notice_mismatch =>
      'ಈ ಸೂಚನೆಯನ್ನು ಪರಿಶೀಲಿಸಲಾಗಲಿಲ್ಲ, ಆದ್ದರಿಂದ ಏನನ್ನೂ ಸಹಿ ಮಾಡಿಲ್ಲ. ಕಂಪನಿಯಿಂದ ಹೊಸ QR ಕೋಡ್ ಕೇಳಿ.';

  @override
  String get grant_failed => 'ಇದನ್ನು ದಾಖಲಿಸಲಾಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.';

  @override
  String get retry => 'ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ';

  @override
  String asking_for_purposes(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count ಉದ್ದೇಶಗಳಿಗಾಗಿ ಕೇಳುತ್ತಿದೆ',
    );
    return '$_temp0';
  }

  @override
  String give_consent_count(int count) {
    return 'ಒಪ್ಪಿಗೆ ನೀಡಿ ($count)';
  }

  @override
  String get needed_for_service => 'ಸೇವೆಗೆ ಅಗತ್ಯ';

  @override
  String get shares_third_party => 'ಮೂರನೇ ಪಕ್ಷಗಳೊಂದಿಗೆ ಹಂಚಲಾಗುತ್ತದೆ';

  @override
  String retention_days(int days) {
    String _temp0 = intl.Intl.pluralLogic(
      days,
      locale: localeName,
      other: '$days ದಿನಗಳ ಕಾಲ ಇರಿಸಲಾಗುತ್ತದೆ',
    );
    return '$_temp0';
  }

  @override
  String retention_months(int months) {
    String _temp0 = intl.Intl.pluralLogic(
      months,
      locale: localeName,
      other: '$months ತಿಂಗಳು ಇರಿಸಲಾಗುತ್ತದೆ',
    );
    return '$_temp0';
  }

  @override
  String get expiry_label => 'ಒಪ್ಪಿಗೆಯ ಅವಧಿ';

  @override
  String get expiry_30d => '30 ದಿನಗಳು';

  @override
  String get expiry_6m => '6 ತಿಂಗಳು';

  @override
  String get expiry_1y => '1 ವರ್ಷ';

  @override
  String purpose_switch_label(String purpose, String company) {
    return '$purpose, $company';
  }

  @override
  String receipt_expires(String date) {
    return '$date ವರೆಗೆ ಮಾನ್ಯ';
  }

  @override
  String get receipt_tx => 'ಲೆಡ್ಜರ್ ವಹಿವಾಟು';

  @override
  String get receipt_view_proof => 'ಪುರಾವೆ ನೋಡಿ';

  @override
  String get done => 'ಮುಗಿಯಿತು';

  @override
  String get error_generic => 'ಏನೋ ತಪ್ಪಾಗಿದೆ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.';

  @override
  String consents_summary(int companies, int active) {
    String _temp0 = intl.Intl.pluralLogic(
      companies,
      locale: localeName,
      other: '$companies ಕಂಪನಿಗಳು · $active ಸಕ್ರಿಯ',
    );
    return '$_temp0';
  }

  @override
  String get status_active => 'ಸಕ್ರಿಯ';

  @override
  String get status_expired => 'ಅವಧಿ ಮುಗಿದಿದೆ';

  @override
  String get status_withdrawn => 'ಹಿಂಪಡೆಯಲಾಗಿದೆ';

  @override
  String expired_ago(int days) {
    String _temp0 = intl.Intl.pluralLogic(
      days,
      locale: localeName,
      other: '$days ದಿನಗಳ ಹಿಂದೆ ಅವಧಿ ಮುಗಿದಿದೆ, ಮತ್ತೆ ಒಪ್ಪಿಗೆ ನೀಡಿ',
    );
    return '$_temp0';
  }

  @override
  String expires_in_days(int days) {
    String _temp0 = intl.Intl.pluralLogic(
      days,
      locale: localeName,
      other: '$days ದಿನಗಳಲ್ಲಿ ಅವಧಿ ಮುಗಿಯುತ್ತದೆ',
    );
    return '$_temp0';
  }

  @override
  String expires_in_months(int months) {
    String _temp0 = intl.Intl.pluralLogic(
      months,
      locale: localeName,
      other: '$months ತಿಂಗಳಲ್ಲಿ ಅವಧಿ ಮುಗಿಯುತ್ತದೆ',
    );
    return '$_temp0';
  }

  @override
  String get offline_banner =>
      'ಸಂಪರ್ಕವಿಲ್ಲ. ಕೊನೆಯ ತಿಳಿದ ಒಪ್ಪಿಗೆಗಳನ್ನು ತೋರಿಸಲಾಗುತ್ತಿದೆ.';

  @override
  String withdraw_confirm(String company, String purpose) {
    return '$purpose ಗಾಗಿ $company ನಿಮ್ಮ ಡೇಟಾ ಬಳಸುವುದನ್ನು ನಿಲ್ಲಿಸಬೇಕೇ? ಅವರನ್ನು ತಕ್ಷಣ ನಿರ್ಬಂಧಿಸಲಾಗುತ್ತದೆ.';
  }

  @override
  String get keep => 'ಇರಿಸಿ';

  @override
  String get auth_reason_withdraw => 'ಒಪ್ಪಿಗೆ ಹಿಂಪಡೆಯಲು ದೃಢೀಕರಿಸಿ';

  @override
  String get filter_all => 'ಎಲ್ಲಾ';

  @override
  String get reason_consent_withdrawn => 'ಒಪ್ಪಿಗೆ ಹಿಂಪಡೆಯಲಾಗಿದೆ';

  @override
  String get reason_consent_expired => 'ಒಪ್ಪಿಗೆ ಅವಧಿ ಮುಗಿದಿದೆ';

  @override
  String get reason_no_consent => 'ಒಪ್ಪಿಗೆ ನೀಡಿಲ್ಲ';

  @override
  String get reason_ledger_unavailable =>
      'ಒಪ್ಪಿಗೆ ಪರಿಶೀಲಿಸಲಾಗಲಿಲ್ಲ, ಆದ್ದರಿಂದ ನಿರ್ಬಂಧಿಸಲಾಗಿದೆ';

  @override
  String get reason_no_principal => 'ಇದು ಯಾರ ಡೇಟಾ ಎಂದು ತಿಳಿಯಲಿಲ್ಲ';

  @override
  String get time_now => 'ಈಗಷ್ಟೇ';

  @override
  String time_seconds(int n) {
    return '$n ಸೆಕೆಂಡ್ ಹಿಂದೆ';
  }

  @override
  String time_minutes(int n) {
    return '$n ನಿಮಿಷ ಹಿಂದೆ';
  }

  @override
  String time_hours(int n) {
    return '$n ಗಂಟೆ ಹಿಂದೆ';
  }

  @override
  String time_days(int n) {
    return '$n ದಿನ ಹಿಂದೆ';
  }

  @override
  String activity_row_label(
    String purpose,
    String company,
    String decision,
    String time,
  ) {
    return '$purpose, $company, $decision, $time';
  }

  @override
  String get offline_activity_banner =>
      'ಸಂಪರ್ಕವಿಲ್ಲ. ಕೊನೆಯ ತಿಳಿದ ಚಟುವಟಿಕೆಯನ್ನು ತೋರಿಸಲಾಗುತ್ತಿದೆ.';

  @override
  String get proof_headline =>
      'ಈ ಪ್ರವೇಶ ದಾಖಲಾಗಿದೆ ಮತ್ತು ಲೆಡ್ಜರ್‌ನಲ್ಲಿ ಲಾಕ್ ಮಾಡಲಾಗಿದೆ.';

  @override
  String get proof_record_hash => 'ದಾಖಲೆ ಹ್ಯಾಶ್';

  @override
  String get proof_batch_anchor => 'ಬ್ಯಾಚ್ ಆಂಕರ್';

  @override
  String get proof_merkle_verified => 'ಪರಿಶೀಲಿಸಲಾಗಿದೆ ✓';

  @override
  String get proof_merkle_failed => 'ಪರಿಶೀಲನೆ ವಿಫಲವಾಗಿದೆ';

  @override
  String get proof_merkle_checking => 'ಪರಿಶೀಲಿಸಲಾಗುತ್ತಿದೆ…';

  @override
  String get proof_open_explorer => 'ಬ್ಲಾಕ್ ಎಕ್ಸ್‌ಪ್ಲೋರರ್‌ನಲ್ಲಿ ತೆರೆಯಿರಿ';

  @override
  String get proof_consent_signer => 'ಸಹಿ ಮಾಡಿದವರು (ನೀವು)';

  @override
  String get proof_ledger_head => 'ಲೆಡ್ಜರ್ ಹೆಡ್';

  @override
  String get proof_consent_tx => 'ವಹಿವಾಟು';

  @override
  String get proof_loading => 'ಪುರಾವೆ ಲೋಡ್ ಆಗುತ್ತಿದೆ…';

  @override
  String get proof_failed => 'ಪುರಾವೆ ಲೋಡ್ ಮಾಡಲಾಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.';

  @override
  String get cascade_title => 'ಇವರಿಗೂ ತಿಳಿಸಲಾಗಿದೆ';

  @override
  String get cascade_waiting => 'ಕಾಯುತ್ತಿದೆ…';

  @override
  String cascade_acked(int n) {
    return '$n ಸೆಕೆಂಡ್ ಹಿಂದೆ';
  }

  @override
  String get vault_profile_title => 'ನನ್ನ ಡೆಮೊ ವಿವರಗಳು';

  @override
  String get vault_profile_note =>
      'ಡೆಮೊಗಾಗಿ ಮಾಡಿದ ವಿವರಗಳು. ಇವು ಈ ಫೋನ್‌ನಲ್ಲೇ ಇರುತ್ತವೆ ಮತ್ತು ಎಲ್ಲಿಗಾದರೂ ಕಳುಹಿಸುವ ಮೊದಲು ಎನ್‌ಕ್ರಿಪ್ಟ್ ಆಗುತ್ತವೆ.';

  @override
  String get vault_pan => 'PAN';

  @override
  String get vault_income => 'ಆದಾಯ';

  @override
  String get vault_score => 'ಕ್ರೆಡಿಟ್ ಸ್ಕೋರ್';

  @override
  String get vault_simulated =>
      'ಡೆಮೊ ಪ್ರೊಸೆಸರ್ (ಸಿಮ್ಯುಲೇಟೆಡ್ ಎನ್‌ಕ್ಲೇವ್, ನಿಜವಾದ ಹಾರ್ಡ್‌ವೇರ್ ರಕ್ಷಣೆ ಅಲ್ಲ)';

  @override
  String get vault_send => 'ಸುರಕ್ಷಿತವಾಗಿ ಕಳುಹಿಸಿ';

  @override
  String get vault_send_again => 'ಮತ್ತೆ ಕಳುಹಿಸಿ';

  @override
  String vault_send_hint(String company) {
    return '$company ಗೆ ನಿರ್ಧಾರ ಸಿಗುತ್ತದೆ, ನಿಮ್ಮ ವಿವರಗಳಲ್ಲ. ಅವುಗಳನ್ನು Sammati Processor ಮಾತ್ರ ತೆರೆಯಬಹುದು.';
  }

  @override
  String get vault_sending => 'ಎನ್‌ಕ್ರಿಪ್ಟ್ ಮಾಡಿ ಕಳುಹಿಸಲಾಗುತ್ತಿದೆ…';

  @override
  String vault_sent(String company) {
    return 'ಎನ್‌ಕ್ರಿಪ್ಟ್ ಮಾಡಿ ಕಳುಹಿಸಲಾಗಿದೆ. $company ಬಳಿ ಕೇವಲ ಒಂದು ಉಲ್ಲೇಖವಿದೆ.';
  }

  @override
  String get vault_erased => 'ನಿಮ್ಮ ಎನ್‌ಕ್ರಿಪ್ಟ್ ಮಾಡಿದ ವಿವರಗಳನ್ನು ಅಳಿಸಲಾಗಿದೆ.';

  @override
  String get vault_failed => 'ಸುರಕ್ಷಿತವಾಗಿ ಕಳುಹಿಸಲಾಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.';

  @override
  String get auth_reason_vault =>
      'ನಿಮ್ಮ ವಿವರಗಳನ್ನು ಸುರಕ್ಷಿತವಾಗಿ ಕಳುಹಿಸಲು ದೃಢೀಕರಿಸಿ';

  @override
  String get share_title => 'ನಿಮ್ಮ ವಿವರಗಳನ್ನು ಸುರಕ್ಷಿತವಾಗಿ ಹಂಚಿಕೊಳ್ಳಿ';

  @override
  String share_intro(String company) {
    return '$company ಗೆ ನಿಮ್ಮ ಸಾಲ ನಿರ್ಧರಿಸಲು ಇವು ಬೇಕು. ಇವು ಈ ಫೋನ್‌ನಲ್ಲೇ ಎನ್‌ಕ್ರಿಪ್ಟ್ ಆಗುತ್ತವೆ, ಆದ್ದರಿಂದ $company ಅವನ್ನು ಎಂದಿಗೂ ನೋಡುವುದಿಲ್ಲ.';
  }

  @override
  String get share_use_demo => 'ಡೆಮೊ ವಿವರಗಳನ್ನು ಬಳಸಿ';

  @override
  String get share_pan => 'PAN';

  @override
  String get share_pan_hint => 'ಉದಾಹರಣೆ ABCDE1234F';

  @override
  String get share_pan_invalid => 'ABCDE1234F ಮಾದರಿಯ PAN ನಮೂದಿಸಿ';

  @override
  String get share_income => 'ಆದಾಯ ವರ್ಗ';

  @override
  String get income_0_3 => '3 LPA ವರೆಗೆ';

  @override
  String get income_3_6 => '3 ರಿಂದ 6 LPA';

  @override
  String get income_6_9 => '6 ರಿಂದ 9 LPA';

  @override
  String get income_9_plus => '9 LPA ಮತ್ತು ಹೆಚ್ಚು';

  @override
  String get share_employment => 'ಉದ್ಯೋಗ';

  @override
  String get emp_salaried => 'ವೇತನದಾರ';

  @override
  String get emp_self_employed => 'ಸ್ವಯಂ ಉದ್ಯೋಗಿ';

  @override
  String get emp_student => 'ವಿದ್ಯಾರ್ಥಿ';

  @override
  String get emp_unemployed => 'ಉದ್ಯೋಗವಿಲ್ಲ';

  @override
  String get share_cta => 'ನಿಮ್ಮ ವಿವರಗಳನ್ನು ಸುರಕ್ಷಿತವಾಗಿ ಹಂಚಿಕೊಳ್ಳಿ';

  @override
  String get inbox_title => 'ವಿನಂತಿಗಳು';

  @override
  String inbox_badge_label(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count ವಿನಂತಿಗಳು',
    );
    return '$_temp0';
  }

  @override
  String get inbox_empty =>
      'ಯಾವುದೇ ವಿನಂತಿ ಇಲ್ಲ. ಕಂಪನಿ ನಿಮ್ಮ ಒಪ್ಪಿಗೆ ಕೇಳಿದಾಗ ಅದು ಇಲ್ಲಿ ಕಾಣಿಸುತ್ತದೆ.';

  @override
  String inbox_asks(String company, int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count ಉದ್ದೇಶಗಳಿಗಾಗಿ ಒಪ್ಪಿಗೆ ಕೇಳುತ್ತಿದೆ',
    );
    return '$company $_temp0';
  }

  @override
  String inbox_message_from(String company) {
    return '$company ಅವರ ಸಂದೇಶ';
  }

  @override
  String inbox_expires_hours(int hours) {
    String _temp0 = intl.Intl.pluralLogic(
      hours,
      locale: localeName,
      other: '$hours ಗಂಟೆಗಳಲ್ಲಿ ಅವಧಿ ಮುಗಿಯುತ್ತದೆ',
    );
    return '$_temp0';
  }

  @override
  String get inbox_expires_soon => 'ಒಂದು ಗಂಟೆಗಿಂತ ಕಡಿಮೆಯಲ್ಲಿ ಅವಧಿ ಮುಗಿಯುತ್ತದೆ';

  @override
  String get inbox_offline =>
      'ಸಂಪರ್ಕವಿಲ್ಲ. ಕೊನೆಯ ತಿಳಿದ ವಿನಂತಿಗಳನ್ನು ತೋರಿಸಲಾಗುತ್ತಿದೆ.';

  @override
  String get request_review => 'ಪರಿಶೀಲಿಸಿ';

  @override
  String get request_decline => 'ತಿರಸ್ಕರಿಸಿ';

  @override
  String get request_block => 'ಈ ಕಂಪನಿಯನ್ನು ನಿರ್ಬಂಧಿಸಿ';

  @override
  String request_block_confirm(String company) {
    return '$company ಅನ್ನು ನಿರ್ಬಂಧಿಸಬೇಕೇ? ಅವರು ನಿಮಗೆ ವಿನಂತಿಗಳನ್ನು ಕಳುಹಿಸಲು ಸಾಧ್ಯವಿಲ್ಲ.';
  }

  @override
  String get request_declined => 'ವಿನಂತಿಯನ್ನು ತಿರಸ್ಕರಿಸಲಾಗಿದೆ.';

  @override
  String request_blocked(String company) {
    return '$company ಅನ್ನು ನಿರ್ಬಂಧಿಸಲಾಗಿದೆ.';
  }

  @override
  String get blocked_title => 'ನಿರ್ಬಂಧಿತ ಕಂಪನಿಗಳು';

  @override
  String get blocked_empty => 'ನೀವು ಯಾರನ್ನೂ ನಿರ್ಬಂಧಿಸಿಲ್ಲ.';

  @override
  String get request_unblock => 'ನಿರ್ಬಂಧ ತೆಗೆಯಿರಿ';

  @override
  String get auth_reason_decline => 'ಈ ವಿನಂತಿಯನ್ನು ತಿರಸ್ಕರಿಸಲು ದೃಢೀಕರಿಸಿ';

  @override
  String get auth_reason_block => 'ಈ ಕಂಪನಿಯನ್ನು ನಿರ್ಬಂಧಿಸಲು ದೃಢೀಕರಿಸಿ';

  @override
  String get id_title => 'ನಿಮ್ಮ Sammati ID';

  @override
  String get id_none => 'ಇನ್ನೂ Sammati ID ಇಲ್ಲ';

  @override
  String get id_explain =>
      'ಕಂಪನಿಗಳು ನಿಮಗೆ ಇಲ್ಲಿ ಒಪ್ಪಿಗೆ ವಿನಂತಿಗಳನ್ನು ಕಳುಹಿಸಬಹುದು. ನೀವು ಹೌದು ಎನ್ನುವವರೆಗೆ ಅವರು ನಿಮ್ಮ ವಾಲೆಟ್ ವಿಳಾಸವನ್ನು ನೋಡುವುದಿಲ್ಲ.';

  @override
  String get id_choose => 'ನಿಮ್ಮ ID ಆಯ್ಕೆಮಾಡಿ';

  @override
  String get id_hint => '3 ರಿಂದ 30 ಅಕ್ಷರಗಳು, ಅಂಕೆಗಳು, ಚುಕ್ಕೆ ಅಥವಾ ಡ್ಯಾಶ್';

  @override
  String get id_invalid =>
      '3 ರಿಂದ 30 ಅಕ್ಷರಗಳು, ಅಂಕೆಗಳು, ಚುಕ್ಕೆ ಅಥವಾ ಡ್ಯಾಶ್ ಬಳಸಿ';

  @override
  String get id_taken => 'ಆ ID ಈಗಾಗಲೇ ಬಳಕೆಯಲ್ಲಿದೆ. ಬೇರೆಯದನ್ನು ಪ್ರಯತ್ನಿಸಿ.';

  @override
  String get id_register => 'ನೋಂದಾಯಿಸಿ';

  @override
  String id_registered(String handle) {
    return 'ನಿಮ್ಮ ID $handle';
  }

  @override
  String get auth_reason_id => 'ನಿಮ್ಮ Sammati ID ನೋಂದಾಯಿಸಲು ದೃಢೀಕರಿಸಿ';

  @override
  String get nav_alerts => 'ಎಚ್ಚರಿಕೆಗಳು';

  @override
  String get alerts_title => 'ಎಚ್ಚರಿಕೆಗಳು';

  @override
  String get alerts_unread => 'ಓದದ ಎಚ್ಚರಿಕೆಗಳು';

  @override
  String get alerts_today => 'ಇಂದು';

  @override
  String get alerts_earlier => 'ಹಿಂದಿನವು';

  @override
  String get alerts_mark_all => 'ಎಲ್ಲವನ್ನೂ ಓದಿದಂತೆ ಗುರುತಿಸಿ';

  @override
  String get alerts_empty =>
      'ಯಾವುದೇ ಎಚ್ಚರಿಕೆಗಳಿಲ್ಲ. ಅವಧಿ ಮುಗಿಯುವ ನೆನಪುಗಳು ಮತ್ತು ಕಂಪನಿಗಳ ಅಪ್‌ಡೇಟ್‌ಗಳು ಇಲ್ಲಿ ಕಾಣಿಸುತ್ತವೆ.';

  @override
  String get alerts_offline =>
      'ಸಂಪರ್ಕವಿಲ್ಲ. ಕೊನೆಯ ತಿಳಿದ ಎಚ್ಚರಿಕೆಗಳನ್ನು ತೋರಿಸಲಾಗುತ್ತಿದೆ.';

  @override
  String alert_expiring(String purpose, String company, String time) {
    return '$company ನಲ್ಲಿ $purpose ಗಾಗಿ ನಿಮ್ಮ ಒಪ್ಪಿಗೆ $time ನಲ್ಲಿ ಮುಗಿಯುತ್ತದೆ';
  }

  @override
  String alert_expired(String purpose, String company) {
    return '$company ನಲ್ಲಿ $purpose ಗಾಗಿ ನಿಮ್ಮ ಒಪ್ಪಿಗೆ ಮುಗಿದಿದೆ';
  }

  @override
  String alert_renewal(String company, String purpose) {
    return '$company ನಿಮ್ಮನ್ನು $purpose ಗಾಗಿ ಒಪ್ಪಿಗೆಯನ್ನು ನವೀಕರಿಸಲು ಕೇಳುತ್ತದೆ';
  }

  @override
  String alert_erased_withdrawn(String company, String purpose) {
    return 'ನೀವು ಒಪ್ಪಿಗೆ ಹಿಂಪಡೆದ ನಂತರ $company $purpose ಗಾಗಿ ನಿಮ್ಮ ಡೇಟಾವನ್ನು ಅಳಿಸಿದೆ';
  }

  @override
  String alert_erased_expired(String company, String purpose) {
    return 'ಒಪ್ಪಿಗೆ ಮುಗಿದ ನಂತರ $company $purpose ಗಾಗಿ ನಿಮ್ಮ ಡೇಟಾವನ್ನು ಅಳಿಸಿದೆ';
  }

  @override
  String alert_cascade(String processor, String purpose) {
    return '$processor $purpose ಗಾಗಿ ನಿಮ್ಮ ಡೇಟಾ ಬಳಕೆಯನ್ನು ನಿಲ್ಲಿಸಿದೆ ಎಂದು ದೃಢಪಡಿಸಿದೆ';
  }

  @override
  String get alert_renew => 'ನವೀಕರಿಸಿ';

  @override
  String get alert_let_expire => 'ಮುಗಿಯಲು ಬಿಡಿ';

  @override
  String get alert_view_proof => 'ಪುರಾವೆ ನೋಡಿ';

  @override
  String get alert_let_expire_done => 'ಸರಿ. ಈ ಒಪ್ಪಿಗೆ ತಾನಾಗಿಯೇ ಮುಗಿಯುತ್ತದೆ.';

  @override
  String get alert_renew_failed => 'ನವೀಕರಣ ತೆರೆಯಲಾಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.';

  @override
  String get alert_state_renewed => 'ನವೀಕರಿಸಲಾಗಿದೆ';

  @override
  String get alert_state_left => 'ಮುಗಿಯಲು ಬಿಡಲಾಗಿದೆ';

  @override
  String duration_days(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count ದಿನಗಳು',
      one: '1 ದಿನ',
    );
    return '$_temp0';
  }

  @override
  String duration_hours(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count ಗಂಟೆಗಳು',
      one: '1 ಗಂಟೆ',
    );
    return '$_temp0';
  }

  @override
  String duration_minutes(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count ನಿಮಿಷಗಳು',
      one: '1 ನಿಮಿಷ',
    );
    return '$_temp0';
  }

  @override
  String duration_seconds(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count ಸೆಕೆಂಡುಗಳು',
      one: '1 ಸೆಕೆಂಡ್',
    );
    return '$_temp0';
  }

  @override
  String get expiry_demo => '2 ನಿಮಿಷಗಳು (ಡೆಮೊ)';

  @override
  String get notif_expiring_title => 'ಒಪ್ಪಿಗೆ ಶೀಘ್ರದಲ್ಲಿ ಮುಗಿಯಲಿದೆ';

  @override
  String get notif_expired_title => 'ಒಪ್ಪಿಗೆ ಮುಗಿದಿದೆ';

  @override
  String get notif_renewal_title => 'ನವೀಕರಣದ ವಿನಂತಿ';

  @override
  String get notif_erased_title => 'ನಿಮ್ಮ ಡೇಟಾ ಅಳಿಸಲಾಗಿದೆ';

  @override
  String get notif_cascade_title => 'ಕಂಪನಿ ದೃಢಪಡಿಸಿದೆ';

  @override
  String get notif_channel => 'ಒಪ್ಪಿಗೆ ಎಚ್ಚರಿಕೆಗಳು';

  @override
  String alert_ago(String time) {
    return '$time ಹಿಂದೆ';
  }

  @override
  String get protect_link => 'ಇದು ನಿಮ್ಮನ್ನು ಹೇಗೆ ರಕ್ಷಿಸುತ್ತದೆ';

  @override
  String get protect_1 =>
      'ಪ್ರತಿ ಉದ್ದೇಶವೂ ನಿಮ್ಮದೇ ಆಯ್ಕೆ. ನಿಮಗಾಗಿ ಯಾವುದನ್ನೂ ಮೊದಲೇ ಆಯ್ಕೆ ಮಾಡಿಲ್ಲ.';

  @override
  String get protect_2 =>
      'ನೀವು ನಂತರ ಎರಡು ಟ್ಯಾಪ್‌ಗಳಲ್ಲಿ ಯಾವುದೇ ಉದ್ದೇಶದ ಒಪ್ಪಿಗೆಯನ್ನು ಹಿಂಪಡೆಯಬಹುದು. ಕಂಪನಿಯ ಮುಂದಿನ ವಿನಂತಿಯನ್ನು ನಿರ್ಬಂಧಿಸಲಾಗುತ್ತದೆ.';

  @override
  String get protect_3 =>
      'ಕಂಪನಿಯು ನಿಮ್ಮ ಡೇಟಾ ಬಳಸಿದಾಗಲೆಲ್ಲ ಅದು ದಾಖಲಾಗುತ್ತದೆ. ನಂತರ ದಾಖಲೆಯನ್ನು ಬದಲಿಸಿದರೆ ಆ ಬದಲಾವಣೆ ಗೊತ್ತಾಗುತ್ತದೆ.';

  @override
  String get protect_4 =>
      'ಕಂಪನಿಗೆ ಸೂಕ್ಷ್ಮ ವಿವರಗಳು ಬೇಕಾದಾಗ, ಅವು ಮೊದಲು ಈ ಫೋನ್‌ನಲ್ಲೇ ಎನ್‌ಕ್ರಿಪ್ಟ್ ಆಗುತ್ತವೆ. ಕಂಪನಿಗೆ ನಿರ್ಧಾರ ಸಿಗುತ್ತದೆ, ನಿಮ್ಮ ವಿವರಗಳಲ್ಲ. ಈ ಡೆಮೊದಲ್ಲಿ ಸುರಕ್ಷಿತ ಪ್ರೊಸೆಸರ್ ಅನುಕರಣೆಯಾಗಿದೆ.';

  @override
  String get protect_note =>
      'Sammati ಒಂದು ಮಾದರಿ ಅಪ್ಲಿಕೇಶನ್ ಆಗಿದ್ದು ಕಾಲ್ಪನಿಕ ಡೇಟಾ ಬಳಸುತ್ತದೆ. ಇದನ್ನು ಭಾರತದ DPDP ಕಾಯ್ದೆ, 2023 ರ ತತ್ವಗಳಿಗೆ ಅನುಗುಣವಾಗಿ ರೂಪಿಸಲಾಗಿದೆ. ಇದು ಕಾನೂನು ಸಲಹೆ ಅಥವಾ ಪ್ರಮಾಣೀಕರಣ ಅಲ್ಲ. ಯಾವುದನ್ನು ಹೋಲಿಸಲಾಗಿದೆ ಮತ್ತು ಯಾವುದನ್ನು ಇನ್ನೂ ಪರಿಶೀಲಿಸಬೇಕು ಎಂಬುದು docs/dpdp-mapping.md ನಲ್ಲಿದೆ.';
}
