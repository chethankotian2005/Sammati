// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String get appName => 'Sammati';

  @override
  String get give_consent => 'Give consent';

  @override
  String get withdraw => 'Withdraw';

  @override
  String withdrawn_blocked(String company) {
    return 'Withdrawn. $company is blocked.';
  }

  @override
  String get allowed => 'Allowed';

  @override
  String get blocked => 'Blocked';

  @override
  String get scan_to_connect => 'Scan to connect';

  @override
  String get withdraw_easy =>
      'You can withdraw any purpose later, as easily as you gave it.';

  @override
  String get recorded => 'Recorded on the ledger';

  @override
  String get nav_consents => 'Consents';

  @override
  String get nav_activity => 'Activity';

  @override
  String get nav_scan => 'Scan';

  @override
  String get nav_rights => 'Rights';

  @override
  String get nav_me => 'Me';

  @override
  String get consents_empty =>
      'No companies yet. Scan a QR code to connect your first one.';

  @override
  String get activity_empty =>
      'No activity yet. Data access by companies will appear here.';

  @override
  String get rights_access => 'See what a company holds';

  @override
  String get rights_erasure => 'Ask a company to erase data';

  @override
  String get rights_grievance => 'Raise a complaint';

  @override
  String get me_language => 'Language';

  @override
  String get me_developer => 'Developer settings';

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
      'Address of the Sammati Core on your Wi-Fi, for example http://192.168.1.5:4000';

  @override
  String get dev_core_url_invalid =>
      'Enter a full address starting with http:// or https://';

  @override
  String get dev_save => 'Save';

  @override
  String get dev_saved => 'Saved';

  @override
  String get language_title => 'Choose your language';

  @override
  String get onb_continue => 'Continue';

  @override
  String get onb_next => 'Next';

  @override
  String get onb_1 => 'See every company that has your consent';

  @override
  String get onb_2 => 'Say yes to a purpose, not to everything';

  @override
  String get onb_3 => 'Withdraw in one tap';

  @override
  String get wallet_create_title => 'Secure with fingerprint or PIN';

  @override
  String get wallet_create_body =>
      'Your consents are signed on this phone. Only you can approve them.';

  @override
  String get wallet_create_button => 'Create wallet';

  @override
  String get wallet_no_lock =>
      'Set a screen lock on this phone, then try again.';

  @override
  String get wallet_auth_failed => 'Could not confirm it is you. Try again.';

  @override
  String get wallet_create_failed => 'Could not create the wallet. Try again.';

  @override
  String get auth_reason_create => 'Confirm to create your wallet';

  @override
  String get auth_reason_sign => 'Confirm to approve this';

  @override
  String get me_wallet_address => 'Wallet address';

  @override
  String get copied => 'Copied';

  @override
  String get scan_hint => 'Point the camera at the company\'s QR code.';

  @override
  String get scan_torch => 'Torch';

  @override
  String get scan_camera_denied => 'Allow camera access to scan QR codes.';

  @override
  String get scan_invalid_qr => 'This is not a Sammati QR code.';

  @override
  String get scan_paste_hint => 'Paste the QR text here';

  @override
  String get scan_paste_open => 'Open';

  @override
  String get error_unreachable => 'Could not reach Sammati. Check Wi-Fi.';

  @override
  String get request_gone =>
      'This request is no longer valid. Ask the company for a new QR code.';

  @override
  String get notice_mismatch =>
      'This notice could not be verified, so nothing was signed. Ask the company for a new QR code.';

  @override
  String get grant_failed => 'Could not record this. Try again.';

  @override
  String get retry => 'Try again';

  @override
  String asking_for_purposes(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'Asking for $count purposes',
      one: 'Asking for 1 purpose',
    );
    return '$_temp0';
  }

  @override
  String give_consent_count(int count) {
    return 'Give consent ($count)';
  }

  @override
  String get needed_for_service => 'Needed for the service';

  @override
  String get shares_third_party => 'Shared with third parties';

  @override
  String retention_days(int days) {
    String _temp0 = intl.Intl.pluralLogic(
      days,
      locale: localeName,
      other: 'kept for $days days',
      one: 'kept for 1 day',
    );
    return '$_temp0';
  }

  @override
  String retention_months(int months) {
    String _temp0 = intl.Intl.pluralLogic(
      months,
      locale: localeName,
      other: 'kept for $months months',
      one: 'kept for 1 month',
    );
    return '$_temp0';
  }

  @override
  String get expiry_label => 'Consent lasts';

  @override
  String get expiry_30d => '30 days';

  @override
  String get expiry_6m => '6 months';

  @override
  String get expiry_1y => '1 year';

  @override
  String purpose_switch_label(String purpose, String company) {
    return '$purpose, $company';
  }

  @override
  String receipt_expires(String date) {
    return 'Valid until $date';
  }

  @override
  String get receipt_tx => 'Ledger transaction';

  @override
  String get receipt_view_proof => 'View proof';

  @override
  String get done => 'Done';

  @override
  String get error_generic => 'Something went wrong. Try again.';

  @override
  String consents_summary(int companies, int active) {
    String _temp0 = intl.Intl.pluralLogic(
      companies,
      locale: localeName,
      other: '$companies companies · $active active',
      one: '1 company · $active active',
    );
    return '$_temp0';
  }

  @override
  String get status_active => 'Active';

  @override
  String get status_expired => 'Expired';

  @override
  String get status_withdrawn => 'Withdrawn';

  @override
  String expired_ago(int days) {
    String _temp0 = intl.Intl.pluralLogic(
      days,
      locale: localeName,
      other: 'Expired $days days ago, give consent again',
      one: 'Expired 1 day ago, give consent again',
      zero: 'Expired today, give consent again',
    );
    return '$_temp0';
  }

  @override
  String expires_in_days(int days) {
    String _temp0 = intl.Intl.pluralLogic(
      days,
      locale: localeName,
      other: 'Expires in $days days',
      one: 'Expires in 1 day',
    );
    return '$_temp0';
  }

  @override
  String expires_in_months(int months) {
    String _temp0 = intl.Intl.pluralLogic(
      months,
      locale: localeName,
      other: 'Expires in $months months',
      one: 'Expires in 1 month',
    );
    return '$_temp0';
  }

  @override
  String get offline_banner => 'No connection. Showing last known consents.';

  @override
  String withdraw_confirm(String company, String purpose) {
    return 'Stop $company using your data for $purpose? They will be blocked right away.';
  }

  @override
  String get keep => 'Keep';

  @override
  String get auth_reason_withdraw => 'Confirm to withdraw consent';

  @override
  String get filter_all => 'All';

  @override
  String get reason_consent_withdrawn => 'Consent withdrawn';

  @override
  String get reason_consent_expired => 'Consent expired';

  @override
  String get reason_no_consent => 'No consent given';

  @override
  String get reason_ledger_unavailable => 'Could not check consent, so blocked';

  @override
  String get reason_no_principal => 'Could not tell whose data this was';

  @override
  String get time_now => 'Just now';

  @override
  String time_seconds(int n) {
    return '$n s ago';
  }

  @override
  String time_minutes(int n) {
    return '$n min ago';
  }

  @override
  String time_hours(int n) {
    return '$n h ago';
  }

  @override
  String time_days(int n) {
    return '$n d ago';
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
      'No connection. Showing last known activity.';

  @override
  String get proof_headline =>
      'This access was recorded and locked on the ledger.';

  @override
  String get proof_record_hash => 'Record hash';

  @override
  String get proof_batch_anchor => 'Batch anchor';

  @override
  String get proof_merkle_verified => 'Verified ✓';

  @override
  String get proof_merkle_failed => 'Verification failed';

  @override
  String get proof_merkle_checking => 'Checking…';

  @override
  String get proof_open_explorer => 'Open in block explorer';

  @override
  String get proof_consent_signer => 'Signer (you)';

  @override
  String get proof_ledger_head => 'Ledger head';

  @override
  String get proof_consent_tx => 'Transaction';

  @override
  String get proof_loading => 'Loading proof…';

  @override
  String get proof_failed => 'Could not load proof. Try again.';

  @override
  String get cascade_title => 'Also told';

  @override
  String get cascade_waiting => 'Waiting…';

  @override
  String cascade_acked(int n) {
    return '$n s ago';
  }

  @override
  String get vault_profile_title => 'My demo details';

  @override
  String get vault_profile_note =>
      'Made-up details for the demo. They stay on this phone and are encrypted before they are sent anywhere.';

  @override
  String get vault_pan => 'PAN';

  @override
  String get vault_income => 'Income';

  @override
  String get vault_score => 'Credit score';

  @override
  String get vault_simulated =>
      'Demo processor (simulated enclave, not real hardware protection)';

  @override
  String get vault_send => 'Send securely';

  @override
  String get vault_send_again => 'Send again';

  @override
  String vault_send_hint(String company) {
    return '$company gets a decision, not your details. Only the Sammati Processor can open them.';
  }

  @override
  String get vault_sending => 'Encrypting and sending…';

  @override
  String vault_sent(String company) {
    return 'Sent encrypted. $company holds only a reference.';
  }

  @override
  String get vault_erased => 'Your encrypted details were erased.';

  @override
  String get vault_failed => 'Could not send securely. Try again.';

  @override
  String get auth_reason_vault => 'Confirm to send your details securely';

  @override
  String get share_title => 'Share your details securely';

  @override
  String share_intro(String company) {
    return '$company needs these to decide your loan. They are encrypted on this phone, so $company never sees them.';
  }

  @override
  String get share_use_demo => 'Use demo details';

  @override
  String get share_pan => 'PAN';

  @override
  String get share_pan_hint => 'Like ABCDE1234F';

  @override
  String get share_pan_invalid => 'Enter a PAN like ABCDE1234F';

  @override
  String get share_income => 'Income band';

  @override
  String get income_0_3 => 'Up to 3 LPA';

  @override
  String get income_3_6 => '3 to 6 LPA';

  @override
  String get income_6_9 => '6 to 9 LPA';

  @override
  String get income_9_plus => '9 LPA and above';

  @override
  String get share_employment => 'Employment';

  @override
  String get emp_salaried => 'Salaried';

  @override
  String get emp_self_employed => 'Self-employed';

  @override
  String get emp_student => 'Student';

  @override
  String get emp_unemployed => 'Not employed';

  @override
  String get share_cta => 'Share your details securely';

  @override
  String get inbox_title => 'Requests';

  @override
  String inbox_badge_label(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count requests',
      one: '1 request',
    );
    return '$_temp0';
  }

  @override
  String get inbox_empty =>
      'No requests. When a company asks for your consent it will appear here.';

  @override
  String inbox_asks(String company, int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count purposes',
      one: '1 purpose',
    );
    return '$company is asking for $_temp0';
  }

  @override
  String inbox_message_from(String company) {
    return 'Message from $company';
  }

  @override
  String inbox_expires_hours(int hours) {
    String _temp0 = intl.Intl.pluralLogic(
      hours,
      locale: localeName,
      other: 'Expires in $hours hours',
      one: 'Expires in 1 hour',
    );
    return '$_temp0';
  }

  @override
  String get inbox_expires_soon => 'Expires in under an hour';

  @override
  String get inbox_offline => 'No connection. Showing last known requests.';

  @override
  String get request_review => 'Review';

  @override
  String get request_decline => 'Decline';

  @override
  String get request_block => 'Block this company';

  @override
  String request_block_confirm(String company) {
    return 'Block $company? They will not be able to send you requests.';
  }

  @override
  String get request_declined => 'Request declined.';

  @override
  String request_blocked(String company) {
    return '$company is blocked.';
  }

  @override
  String get blocked_title => 'Blocked companies';

  @override
  String get blocked_empty => 'You have not blocked anyone.';

  @override
  String get request_unblock => 'Unblock';

  @override
  String get auth_reason_decline => 'Confirm to decline this request';

  @override
  String get auth_reason_block => 'Confirm to block this company';

  @override
  String get id_title => 'Your Sammati ID';

  @override
  String get id_none => 'No Sammati ID yet';

  @override
  String get id_explain =>
      'Companies can send you consent requests here. They never see your wallet address until you say yes.';

  @override
  String get id_choose => 'Choose your ID';

  @override
  String get id_hint => '3 to 30 letters, numbers, dots or dashes';

  @override
  String get id_invalid => 'Use 3 to 30 letters, numbers, dots or dashes';

  @override
  String get id_taken => 'That ID is taken. Try another.';

  @override
  String get id_register => 'Register';

  @override
  String id_registered(String handle) {
    return 'Your ID is $handle';
  }

  @override
  String get auth_reason_id => 'Confirm to register your Sammati ID';

  @override
  String get nav_alerts => 'Alerts';

  @override
  String get alerts_title => 'Alerts';

  @override
  String get alerts_unread => 'Unread alerts';

  @override
  String get alerts_today => 'Today';

  @override
  String get alerts_earlier => 'Earlier';

  @override
  String get alerts_mark_all => 'Mark all as read';

  @override
  String get alerts_empty =>
      'No alerts. Expiry reminders and updates from companies will appear here.';

  @override
  String get alerts_offline => 'No connection. Showing last known alerts.';

  @override
  String alert_expiring(String purpose, String company, String time) {
    return 'Your consent for $purpose at $company expires in $time';
  }

  @override
  String alert_expired(String purpose, String company) {
    return 'Your consent for $purpose at $company has expired';
  }

  @override
  String alert_renewal(String company, String purpose) {
    return '$company asks you to renew your consent for $purpose';
  }

  @override
  String alert_erased_withdrawn(String company, String purpose) {
    return '$company erased your data for $purpose after you withdrew consent';
  }

  @override
  String alert_erased_expired(String company, String purpose) {
    return '$company erased your data for $purpose after consent expired';
  }

  @override
  String alert_cascade(String processor, String purpose) {
    return '$processor confirmed it stopped using your data for $purpose';
  }

  @override
  String get alert_renew => 'Renew';

  @override
  String get alert_let_expire => 'Let expire';

  @override
  String get alert_view_proof => 'View proof';

  @override
  String get alert_let_expire_done =>
      'Okay. This consent will expire on its own.';

  @override
  String get alert_renew_failed => 'Could not open the renewal. Try again.';

  @override
  String get alert_state_renewed => 'Renewed';

  @override
  String get alert_state_left => 'Left to expire';

  @override
  String duration_days(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count days',
      one: '1 day',
    );
    return '$_temp0';
  }

  @override
  String duration_hours(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count hours',
      one: '1 hour',
    );
    return '$_temp0';
  }

  @override
  String duration_minutes(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count minutes',
      one: '1 minute',
    );
    return '$_temp0';
  }

  @override
  String duration_seconds(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count seconds',
      one: '1 second',
    );
    return '$_temp0';
  }

  @override
  String get expiry_demo => '2 minutes (demo)';

  @override
  String get notif_expiring_title => 'Consent expiring soon';

  @override
  String get notif_expired_title => 'Consent expired';

  @override
  String get notif_renewal_title => 'Renewal requested';

  @override
  String get notif_erased_title => 'Your data was erased';

  @override
  String get notif_cascade_title => 'Company confirmed';

  @override
  String get notif_channel => 'Consent alerts';

  @override
  String alert_ago(String time) {
    return '$time ago';
  }
}
