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
  String get done => 'ಮುಗಿಯಿತು';

  @override
  String get error_generic => 'ಏನೋ ತಪ್ಪಾಗಿದೆ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.';
}
