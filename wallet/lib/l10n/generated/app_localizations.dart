import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'app_localizations_en.dart';
import 'app_localizations_hi.dart';
import 'app_localizations_kn.dart';

// ignore_for_file: type=lint

/// Callers can lookup localized strings with an instance of AppLocalizations
/// returned by `AppLocalizations.of(context)`.
///
/// Applications need to include `AppLocalizations.delegate()` in their app's
/// `localizationDelegates` list, and the locales they support in the app's
/// `supportedLocales` list. For example:
///
/// ```dart
/// import 'generated/app_localizations.dart';
///
/// return MaterialApp(
///   localizationsDelegates: AppLocalizations.localizationsDelegates,
///   supportedLocales: AppLocalizations.supportedLocales,
///   home: MyApplicationHome(),
/// );
/// ```
///
/// ## Update pubspec.yaml
///
/// Please make sure to update your pubspec.yaml to include the following
/// packages:
///
/// ```yaml
/// dependencies:
///   # Internationalization support.
///   flutter_localizations:
///     sdk: flutter
///   intl: any # Use the pinned version from flutter_localizations
///
///   # Rest of dependencies
/// ```
///
/// ## iOS Applications
///
/// iOS applications define key application metadata, including supported
/// locales, in an Info.plist file that is built into the application bundle.
/// To configure the locales supported by your app, you’ll need to edit this
/// file.
///
/// First, open your project’s ios/Runner.xcworkspace Xcode workspace file.
/// Then, in the Project Navigator, open the Info.plist file under the Runner
/// project’s Runner folder.
///
/// Next, select the Information Property List item, select Add Item from the
/// Editor menu, then select Localizations from the pop-up menu.
///
/// Select and expand the newly-created Localizations item then, for each
/// locale your application supports, add a new item and select the locale
/// you wish to add from the pop-up menu in the Value field. This list should
/// be consistent with the languages listed in the AppLocalizations.supportedLocales
/// property.
abstract class AppLocalizations {
  AppLocalizations(String locale)
    : localeName = intl.Intl.canonicalizedLocale(locale.toString());

  final String localeName;

  static AppLocalizations of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations)!;
  }

  static const LocalizationsDelegate<AppLocalizations> delegate =
      _AppLocalizationsDelegate();

  /// A list of this localizations delegate along with the default localizations
  /// delegates.
  ///
  /// Returns a list of localizations delegates containing this delegate along with
  /// GlobalMaterialLocalizations.delegate, GlobalCupertinoLocalizations.delegate,
  /// and GlobalWidgetsLocalizations.delegate.
  ///
  /// Additional delegates can be added by appending to this list in
  /// MaterialApp. This list does not have to be used at all if a custom list
  /// of delegates is preferred or required.
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates =
      <LocalizationsDelegate<dynamic>>[
        delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
      ];

  /// A list of this localizations delegate's supported locales.
  static const List<Locale> supportedLocales = <Locale>[
    Locale('en'),
    Locale('hi'),
    Locale('kn'),
  ];

  /// Wordmark shown in the app bar
  ///
  /// In en, this message translates to:
  /// **'Sammati'**
  String get appName;

  /// No description provided for @give_consent.
  ///
  /// In en, this message translates to:
  /// **'Give consent'**
  String get give_consent;

  /// No description provided for @withdraw.
  ///
  /// In en, this message translates to:
  /// **'Withdraw'**
  String get withdraw;

  /// No description provided for @withdrawn_blocked.
  ///
  /// In en, this message translates to:
  /// **'Withdrawn. {company} is blocked.'**
  String withdrawn_blocked(String company);

  /// No description provided for @allowed.
  ///
  /// In en, this message translates to:
  /// **'Allowed'**
  String get allowed;

  /// No description provided for @blocked.
  ///
  /// In en, this message translates to:
  /// **'Blocked'**
  String get blocked;

  /// No description provided for @scan_to_connect.
  ///
  /// In en, this message translates to:
  /// **'Scan to connect'**
  String get scan_to_connect;

  /// No description provided for @withdraw_easy.
  ///
  /// In en, this message translates to:
  /// **'You can withdraw any purpose later, as easily as you gave it.'**
  String get withdraw_easy;

  /// No description provided for @recorded.
  ///
  /// In en, this message translates to:
  /// **'Recorded on the ledger'**
  String get recorded;

  /// No description provided for @nav_consents.
  ///
  /// In en, this message translates to:
  /// **'Consents'**
  String get nav_consents;

  /// No description provided for @nav_activity.
  ///
  /// In en, this message translates to:
  /// **'Activity'**
  String get nav_activity;

  /// No description provided for @nav_scan.
  ///
  /// In en, this message translates to:
  /// **'Scan'**
  String get nav_scan;

  /// No description provided for @nav_rights.
  ///
  /// In en, this message translates to:
  /// **'Rights'**
  String get nav_rights;

  /// No description provided for @nav_me.
  ///
  /// In en, this message translates to:
  /// **'Me'**
  String get nav_me;

  /// No description provided for @consents_empty.
  ///
  /// In en, this message translates to:
  /// **'No companies yet. Scan a QR code to connect your first one.'**
  String get consents_empty;

  /// No description provided for @activity_empty.
  ///
  /// In en, this message translates to:
  /// **'No activity yet. Data access by companies will appear here.'**
  String get activity_empty;

  /// No description provided for @rights_access.
  ///
  /// In en, this message translates to:
  /// **'See what a company holds'**
  String get rights_access;

  /// No description provided for @rights_erasure.
  ///
  /// In en, this message translates to:
  /// **'Ask a company to erase data'**
  String get rights_erasure;

  /// No description provided for @rights_grievance.
  ///
  /// In en, this message translates to:
  /// **'Raise a complaint'**
  String get rights_grievance;

  /// No description provided for @me_language.
  ///
  /// In en, this message translates to:
  /// **'Language'**
  String get me_language;

  /// No description provided for @me_developer.
  ///
  /// In en, this message translates to:
  /// **'Developer settings'**
  String get me_developer;

  /// No description provided for @language_english.
  ///
  /// In en, this message translates to:
  /// **'English'**
  String get language_english;

  /// No description provided for @language_hindi.
  ///
  /// In en, this message translates to:
  /// **'हिन्दी'**
  String get language_hindi;

  /// No description provided for @language_kannada.
  ///
  /// In en, this message translates to:
  /// **'ಕನ್ನಡ'**
  String get language_kannada;

  /// No description provided for @dev_core_url.
  ///
  /// In en, this message translates to:
  /// **'Core URL'**
  String get dev_core_url;

  /// No description provided for @dev_core_url_hint.
  ///
  /// In en, this message translates to:
  /// **'Address of the Sammati Core on your Wi-Fi, for example http://192.168.1.5:4000'**
  String get dev_core_url_hint;

  /// No description provided for @dev_core_url_invalid.
  ///
  /// In en, this message translates to:
  /// **'Enter a full address starting with http:// or https://'**
  String get dev_core_url_invalid;

  /// No description provided for @dev_save.
  ///
  /// In en, this message translates to:
  /// **'Save'**
  String get dev_save;

  /// No description provided for @dev_saved.
  ///
  /// In en, this message translates to:
  /// **'Saved'**
  String get dev_saved;

  /// No description provided for @language_title.
  ///
  /// In en, this message translates to:
  /// **'Choose your language'**
  String get language_title;

  /// No description provided for @onb_continue.
  ///
  /// In en, this message translates to:
  /// **'Continue'**
  String get onb_continue;

  /// No description provided for @onb_next.
  ///
  /// In en, this message translates to:
  /// **'Next'**
  String get onb_next;

  /// No description provided for @onb_1.
  ///
  /// In en, this message translates to:
  /// **'See every company that has your consent'**
  String get onb_1;

  /// No description provided for @onb_2.
  ///
  /// In en, this message translates to:
  /// **'Say yes to a purpose, not to everything'**
  String get onb_2;

  /// No description provided for @onb_3.
  ///
  /// In en, this message translates to:
  /// **'Withdraw in one tap'**
  String get onb_3;

  /// No description provided for @wallet_create_title.
  ///
  /// In en, this message translates to:
  /// **'Secure with fingerprint or PIN'**
  String get wallet_create_title;

  /// No description provided for @wallet_create_body.
  ///
  /// In en, this message translates to:
  /// **'Your consents are signed on this phone. Only you can approve them.'**
  String get wallet_create_body;

  /// No description provided for @wallet_create_button.
  ///
  /// In en, this message translates to:
  /// **'Create wallet'**
  String get wallet_create_button;

  /// No description provided for @wallet_no_lock.
  ///
  /// In en, this message translates to:
  /// **'Set a screen lock on this phone, then try again.'**
  String get wallet_no_lock;

  /// No description provided for @wallet_auth_failed.
  ///
  /// In en, this message translates to:
  /// **'Could not confirm it is you. Try again.'**
  String get wallet_auth_failed;

  /// No description provided for @wallet_create_failed.
  ///
  /// In en, this message translates to:
  /// **'Could not create the wallet. Try again.'**
  String get wallet_create_failed;

  /// No description provided for @auth_reason_create.
  ///
  /// In en, this message translates to:
  /// **'Confirm to create your wallet'**
  String get auth_reason_create;

  /// No description provided for @auth_reason_sign.
  ///
  /// In en, this message translates to:
  /// **'Confirm to approve this'**
  String get auth_reason_sign;

  /// No description provided for @me_wallet_address.
  ///
  /// In en, this message translates to:
  /// **'Wallet address'**
  String get me_wallet_address;

  /// No description provided for @copied.
  ///
  /// In en, this message translates to:
  /// **'Copied'**
  String get copied;

  /// No description provided for @scan_hint.
  ///
  /// In en, this message translates to:
  /// **'Point the camera at the company\'s QR code.'**
  String get scan_hint;

  /// No description provided for @scan_torch.
  ///
  /// In en, this message translates to:
  /// **'Torch'**
  String get scan_torch;

  /// No description provided for @scan_camera_denied.
  ///
  /// In en, this message translates to:
  /// **'Allow camera access to scan QR codes.'**
  String get scan_camera_denied;

  /// No description provided for @scan_invalid_qr.
  ///
  /// In en, this message translates to:
  /// **'This is not a Sammati QR code.'**
  String get scan_invalid_qr;

  /// No description provided for @scan_paste_hint.
  ///
  /// In en, this message translates to:
  /// **'Paste the QR text here'**
  String get scan_paste_hint;

  /// No description provided for @scan_paste_open.
  ///
  /// In en, this message translates to:
  /// **'Open'**
  String get scan_paste_open;

  /// No description provided for @error_unreachable.
  ///
  /// In en, this message translates to:
  /// **'Could not reach Sammati. Check Wi-Fi.'**
  String get error_unreachable;

  /// No description provided for @request_gone.
  ///
  /// In en, this message translates to:
  /// **'This request is no longer valid. Ask the company for a new QR code.'**
  String get request_gone;

  /// No description provided for @notice_mismatch.
  ///
  /// In en, this message translates to:
  /// **'This notice could not be verified, so nothing was signed. Ask the company for a new QR code.'**
  String get notice_mismatch;

  /// No description provided for @grant_failed.
  ///
  /// In en, this message translates to:
  /// **'Could not record this. Try again.'**
  String get grant_failed;

  /// No description provided for @retry.
  ///
  /// In en, this message translates to:
  /// **'Try again'**
  String get retry;

  /// No description provided for @asking_for_purposes.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{Asking for 1 purpose} other{Asking for {count} purposes}}'**
  String asking_for_purposes(int count);

  /// No description provided for @give_consent_count.
  ///
  /// In en, this message translates to:
  /// **'Give consent ({count})'**
  String give_consent_count(int count);

  /// No description provided for @needed_for_service.
  ///
  /// In en, this message translates to:
  /// **'Needed for the service'**
  String get needed_for_service;

  /// No description provided for @shares_third_party.
  ///
  /// In en, this message translates to:
  /// **'Shared with third parties'**
  String get shares_third_party;

  /// No description provided for @retention_days.
  ///
  /// In en, this message translates to:
  /// **'{days, plural, =1{kept for 1 day} other{kept for {days} days}}'**
  String retention_days(int days);

  /// No description provided for @retention_months.
  ///
  /// In en, this message translates to:
  /// **'{months, plural, =1{kept for 1 month} other{kept for {months} months}}'**
  String retention_months(int months);

  /// No description provided for @expiry_label.
  ///
  /// In en, this message translates to:
  /// **'Consent lasts'**
  String get expiry_label;

  /// No description provided for @expiry_30d.
  ///
  /// In en, this message translates to:
  /// **'30 days'**
  String get expiry_30d;

  /// No description provided for @expiry_6m.
  ///
  /// In en, this message translates to:
  /// **'6 months'**
  String get expiry_6m;

  /// No description provided for @expiry_1y.
  ///
  /// In en, this message translates to:
  /// **'1 year'**
  String get expiry_1y;

  /// No description provided for @purpose_switch_label.
  ///
  /// In en, this message translates to:
  /// **'{purpose}, {company}'**
  String purpose_switch_label(String purpose, String company);

  /// No description provided for @receipt_expires.
  ///
  /// In en, this message translates to:
  /// **'Valid until {date}'**
  String receipt_expires(String date);

  /// No description provided for @receipt_tx.
  ///
  /// In en, this message translates to:
  /// **'Ledger transaction'**
  String get receipt_tx;

  /// No description provided for @receipt_view_proof.
  ///
  /// In en, this message translates to:
  /// **'View proof'**
  String get receipt_view_proof;

  /// No description provided for @done.
  ///
  /// In en, this message translates to:
  /// **'Done'**
  String get done;

  /// No description provided for @error_generic.
  ///
  /// In en, this message translates to:
  /// **'Something went wrong. Try again.'**
  String get error_generic;

  /// No description provided for @consents_summary.
  ///
  /// In en, this message translates to:
  /// **'{companies, plural, =1{1 company · {active} active} other{{companies} companies · {active} active}}'**
  String consents_summary(int companies, int active);

  /// No description provided for @status_active.
  ///
  /// In en, this message translates to:
  /// **'Active'**
  String get status_active;

  /// No description provided for @status_expired.
  ///
  /// In en, this message translates to:
  /// **'Expired'**
  String get status_expired;

  /// No description provided for @status_withdrawn.
  ///
  /// In en, this message translates to:
  /// **'Withdrawn'**
  String get status_withdrawn;

  /// No description provided for @expired_ago.
  ///
  /// In en, this message translates to:
  /// **'{days, plural, =0{Expired today, give consent again} =1{Expired 1 day ago, give consent again} other{Expired {days} days ago, give consent again}}'**
  String expired_ago(int days);

  /// No description provided for @expires_in_days.
  ///
  /// In en, this message translates to:
  /// **'{days, plural, =1{Expires in 1 day} other{Expires in {days} days}}'**
  String expires_in_days(int days);

  /// No description provided for @expires_in_months.
  ///
  /// In en, this message translates to:
  /// **'{months, plural, =1{Expires in 1 month} other{Expires in {months} months}}'**
  String expires_in_months(int months);

  /// No description provided for @offline_banner.
  ///
  /// In en, this message translates to:
  /// **'No connection. Showing last known consents.'**
  String get offline_banner;

  /// No description provided for @withdraw_confirm.
  ///
  /// In en, this message translates to:
  /// **'Stop {company} using your data for {purpose}? They will be blocked right away.'**
  String withdraw_confirm(String company, String purpose);

  /// No description provided for @keep.
  ///
  /// In en, this message translates to:
  /// **'Keep'**
  String get keep;

  /// No description provided for @auth_reason_withdraw.
  ///
  /// In en, this message translates to:
  /// **'Confirm to withdraw consent'**
  String get auth_reason_withdraw;

  /// No description provided for @filter_all.
  ///
  /// In en, this message translates to:
  /// **'All'**
  String get filter_all;

  /// No description provided for @reason_consent_withdrawn.
  ///
  /// In en, this message translates to:
  /// **'Consent withdrawn'**
  String get reason_consent_withdrawn;

  /// No description provided for @reason_consent_expired.
  ///
  /// In en, this message translates to:
  /// **'Consent expired'**
  String get reason_consent_expired;

  /// No description provided for @reason_no_consent.
  ///
  /// In en, this message translates to:
  /// **'No consent given'**
  String get reason_no_consent;

  /// No description provided for @reason_ledger_unavailable.
  ///
  /// In en, this message translates to:
  /// **'Could not check consent, so blocked'**
  String get reason_ledger_unavailable;

  /// No description provided for @reason_no_principal.
  ///
  /// In en, this message translates to:
  /// **'Could not tell whose data this was'**
  String get reason_no_principal;

  /// No description provided for @time_now.
  ///
  /// In en, this message translates to:
  /// **'Just now'**
  String get time_now;

  /// No description provided for @time_seconds.
  ///
  /// In en, this message translates to:
  /// **'{n} s ago'**
  String time_seconds(int n);

  /// No description provided for @time_minutes.
  ///
  /// In en, this message translates to:
  /// **'{n} min ago'**
  String time_minutes(int n);

  /// No description provided for @time_hours.
  ///
  /// In en, this message translates to:
  /// **'{n} h ago'**
  String time_hours(int n);

  /// No description provided for @time_days.
  ///
  /// In en, this message translates to:
  /// **'{n} d ago'**
  String time_days(int n);

  /// No description provided for @activity_row_label.
  ///
  /// In en, this message translates to:
  /// **'{purpose}, {company}, {decision}, {time}'**
  String activity_row_label(
    String purpose,
    String company,
    String decision,
    String time,
  );

  /// No description provided for @offline_activity_banner.
  ///
  /// In en, this message translates to:
  /// **'No connection. Showing last known activity.'**
  String get offline_activity_banner;

  /// No description provided for @proof_headline.
  ///
  /// In en, this message translates to:
  /// **'This access was recorded and locked on the ledger.'**
  String get proof_headline;

  /// No description provided for @proof_record_hash.
  ///
  /// In en, this message translates to:
  /// **'Record hash'**
  String get proof_record_hash;

  /// No description provided for @proof_batch_anchor.
  ///
  /// In en, this message translates to:
  /// **'Batch anchor'**
  String get proof_batch_anchor;

  /// No description provided for @proof_merkle_verified.
  ///
  /// In en, this message translates to:
  /// **'Verified ✓'**
  String get proof_merkle_verified;

  /// No description provided for @proof_merkle_failed.
  ///
  /// In en, this message translates to:
  /// **'Verification failed'**
  String get proof_merkle_failed;

  /// No description provided for @proof_merkle_checking.
  ///
  /// In en, this message translates to:
  /// **'Checking…'**
  String get proof_merkle_checking;

  /// No description provided for @proof_open_explorer.
  ///
  /// In en, this message translates to:
  /// **'Open in block explorer'**
  String get proof_open_explorer;

  /// No description provided for @proof_consent_signer.
  ///
  /// In en, this message translates to:
  /// **'Signer (you)'**
  String get proof_consent_signer;

  /// No description provided for @proof_ledger_head.
  ///
  /// In en, this message translates to:
  /// **'Ledger head'**
  String get proof_ledger_head;

  /// No description provided for @proof_consent_tx.
  ///
  /// In en, this message translates to:
  /// **'Transaction'**
  String get proof_consent_tx;

  /// No description provided for @proof_loading.
  ///
  /// In en, this message translates to:
  /// **'Loading proof…'**
  String get proof_loading;

  /// No description provided for @proof_failed.
  ///
  /// In en, this message translates to:
  /// **'Could not load proof. Try again.'**
  String get proof_failed;

  /// No description provided for @cascade_title.
  ///
  /// In en, this message translates to:
  /// **'Also told'**
  String get cascade_title;

  /// No description provided for @cascade_waiting.
  ///
  /// In en, this message translates to:
  /// **'Waiting…'**
  String get cascade_waiting;

  /// No description provided for @cascade_acked.
  ///
  /// In en, this message translates to:
  /// **'{n} s ago'**
  String cascade_acked(int n);

  /// No description provided for @vault_profile_title.
  ///
  /// In en, this message translates to:
  /// **'My demo details'**
  String get vault_profile_title;

  /// No description provided for @vault_profile_note.
  ///
  /// In en, this message translates to:
  /// **'Made-up details for the demo. They stay on this phone and are encrypted before they are sent anywhere.'**
  String get vault_profile_note;

  /// No description provided for @vault_pan.
  ///
  /// In en, this message translates to:
  /// **'PAN'**
  String get vault_pan;

  /// No description provided for @vault_income.
  ///
  /// In en, this message translates to:
  /// **'Income'**
  String get vault_income;

  /// No description provided for @vault_score.
  ///
  /// In en, this message translates to:
  /// **'Credit score'**
  String get vault_score;

  /// No description provided for @vault_simulated.
  ///
  /// In en, this message translates to:
  /// **'Demo processor (simulated enclave, not real hardware protection)'**
  String get vault_simulated;

  /// No description provided for @vault_send.
  ///
  /// In en, this message translates to:
  /// **'Send securely'**
  String get vault_send;

  /// No description provided for @vault_send_again.
  ///
  /// In en, this message translates to:
  /// **'Send again'**
  String get vault_send_again;

  /// No description provided for @vault_send_hint.
  ///
  /// In en, this message translates to:
  /// **'{company} gets a decision, not your details. Only the Sammati Processor can open them.'**
  String vault_send_hint(String company);

  /// No description provided for @vault_sending.
  ///
  /// In en, this message translates to:
  /// **'Encrypting and sending…'**
  String get vault_sending;

  /// No description provided for @vault_sent.
  ///
  /// In en, this message translates to:
  /// **'Sent encrypted. {company} holds only a reference.'**
  String vault_sent(String company);

  /// No description provided for @vault_erased.
  ///
  /// In en, this message translates to:
  /// **'Your encrypted details were erased.'**
  String get vault_erased;

  /// No description provided for @vault_failed.
  ///
  /// In en, this message translates to:
  /// **'Could not send securely. Try again.'**
  String get vault_failed;

  /// No description provided for @auth_reason_vault.
  ///
  /// In en, this message translates to:
  /// **'Confirm to send your details securely'**
  String get auth_reason_vault;

  /// No description provided for @share_title.
  ///
  /// In en, this message translates to:
  /// **'Share your details securely'**
  String get share_title;

  /// No description provided for @share_intro.
  ///
  /// In en, this message translates to:
  /// **'{company} needs these to decide your loan. They are encrypted on this phone, so {company} never sees them.'**
  String share_intro(String company);

  /// No description provided for @share_use_demo.
  ///
  /// In en, this message translates to:
  /// **'Use demo details'**
  String get share_use_demo;

  /// No description provided for @share_pan.
  ///
  /// In en, this message translates to:
  /// **'PAN'**
  String get share_pan;

  /// No description provided for @share_pan_hint.
  ///
  /// In en, this message translates to:
  /// **'Like ABCDE1234F'**
  String get share_pan_hint;

  /// No description provided for @share_pan_invalid.
  ///
  /// In en, this message translates to:
  /// **'Enter a PAN like ABCDE1234F'**
  String get share_pan_invalid;

  /// No description provided for @share_income.
  ///
  /// In en, this message translates to:
  /// **'Income band'**
  String get share_income;

  /// No description provided for @income_0_3.
  ///
  /// In en, this message translates to:
  /// **'Up to 3 LPA'**
  String get income_0_3;

  /// No description provided for @income_3_6.
  ///
  /// In en, this message translates to:
  /// **'3 to 6 LPA'**
  String get income_3_6;

  /// No description provided for @income_6_9.
  ///
  /// In en, this message translates to:
  /// **'6 to 9 LPA'**
  String get income_6_9;

  /// No description provided for @income_9_plus.
  ///
  /// In en, this message translates to:
  /// **'9 LPA and above'**
  String get income_9_plus;

  /// No description provided for @share_employment.
  ///
  /// In en, this message translates to:
  /// **'Employment'**
  String get share_employment;

  /// No description provided for @emp_salaried.
  ///
  /// In en, this message translates to:
  /// **'Salaried'**
  String get emp_salaried;

  /// No description provided for @emp_self_employed.
  ///
  /// In en, this message translates to:
  /// **'Self-employed'**
  String get emp_self_employed;

  /// No description provided for @emp_student.
  ///
  /// In en, this message translates to:
  /// **'Student'**
  String get emp_student;

  /// No description provided for @emp_unemployed.
  ///
  /// In en, this message translates to:
  /// **'Not employed'**
  String get emp_unemployed;

  /// No description provided for @share_cta.
  ///
  /// In en, this message translates to:
  /// **'Share your details securely'**
  String get share_cta;

  /// No description provided for @inbox_title.
  ///
  /// In en, this message translates to:
  /// **'Requests'**
  String get inbox_title;

  /// No description provided for @inbox_badge_label.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{1 request} other{{count} requests}}'**
  String inbox_badge_label(int count);

  /// No description provided for @inbox_empty.
  ///
  /// In en, this message translates to:
  /// **'No requests. When a company asks for your consent it will appear here.'**
  String get inbox_empty;

  /// No description provided for @inbox_asks.
  ///
  /// In en, this message translates to:
  /// **'{company} is asking for {count, plural, =1{1 purpose} other{{count} purposes}}'**
  String inbox_asks(String company, int count);

  /// No description provided for @inbox_message_from.
  ///
  /// In en, this message translates to:
  /// **'Message from {company}'**
  String inbox_message_from(String company);

  /// No description provided for @inbox_expires_hours.
  ///
  /// In en, this message translates to:
  /// **'{hours, plural, =1{Expires in 1 hour} other{Expires in {hours} hours}}'**
  String inbox_expires_hours(int hours);

  /// No description provided for @inbox_expires_soon.
  ///
  /// In en, this message translates to:
  /// **'Expires in under an hour'**
  String get inbox_expires_soon;

  /// No description provided for @inbox_offline.
  ///
  /// In en, this message translates to:
  /// **'No connection. Showing last known requests.'**
  String get inbox_offline;

  /// No description provided for @request_review.
  ///
  /// In en, this message translates to:
  /// **'Review'**
  String get request_review;

  /// No description provided for @request_decline.
  ///
  /// In en, this message translates to:
  /// **'Decline'**
  String get request_decline;

  /// No description provided for @request_block.
  ///
  /// In en, this message translates to:
  /// **'Block this company'**
  String get request_block;

  /// No description provided for @request_block_confirm.
  ///
  /// In en, this message translates to:
  /// **'Block {company}? They will not be able to send you requests.'**
  String request_block_confirm(String company);

  /// No description provided for @request_declined.
  ///
  /// In en, this message translates to:
  /// **'Request declined.'**
  String get request_declined;

  /// No description provided for @request_blocked.
  ///
  /// In en, this message translates to:
  /// **'{company} is blocked.'**
  String request_blocked(String company);

  /// No description provided for @blocked_title.
  ///
  /// In en, this message translates to:
  /// **'Blocked companies'**
  String get blocked_title;

  /// No description provided for @blocked_empty.
  ///
  /// In en, this message translates to:
  /// **'You have not blocked anyone.'**
  String get blocked_empty;

  /// No description provided for @request_unblock.
  ///
  /// In en, this message translates to:
  /// **'Unblock'**
  String get request_unblock;

  /// No description provided for @auth_reason_decline.
  ///
  /// In en, this message translates to:
  /// **'Confirm to decline this request'**
  String get auth_reason_decline;

  /// No description provided for @auth_reason_block.
  ///
  /// In en, this message translates to:
  /// **'Confirm to block this company'**
  String get auth_reason_block;

  /// No description provided for @id_title.
  ///
  /// In en, this message translates to:
  /// **'Your Sammati ID'**
  String get id_title;

  /// No description provided for @id_none.
  ///
  /// In en, this message translates to:
  /// **'No Sammati ID yet'**
  String get id_none;

  /// No description provided for @id_explain.
  ///
  /// In en, this message translates to:
  /// **'Companies can send you consent requests here. They never see your wallet address until you say yes.'**
  String get id_explain;

  /// No description provided for @id_choose.
  ///
  /// In en, this message translates to:
  /// **'Choose your ID'**
  String get id_choose;

  /// No description provided for @id_hint.
  ///
  /// In en, this message translates to:
  /// **'3 to 30 letters, numbers, dots or dashes'**
  String get id_hint;

  /// No description provided for @id_invalid.
  ///
  /// In en, this message translates to:
  /// **'Use 3 to 30 letters, numbers, dots or dashes'**
  String get id_invalid;

  /// No description provided for @id_taken.
  ///
  /// In en, this message translates to:
  /// **'That ID is taken. Try another.'**
  String get id_taken;

  /// No description provided for @id_register.
  ///
  /// In en, this message translates to:
  /// **'Register'**
  String get id_register;

  /// No description provided for @id_registered.
  ///
  /// In en, this message translates to:
  /// **'Your ID is {handle}'**
  String id_registered(String handle);

  /// No description provided for @auth_reason_id.
  ///
  /// In en, this message translates to:
  /// **'Confirm to register your Sammati ID'**
  String get auth_reason_id;

  /// No description provided for @protect_link.
  ///
  /// In en, this message translates to:
  /// **'How this protects you'**
  String get protect_link;

  /// No description provided for @protect_1.
  ///
  /// In en, this message translates to:
  /// **'Each purpose is your own choice. Nothing is ticked for you.'**
  String get protect_1;

  /// No description provided for @protect_2.
  ///
  /// In en, this message translates to:
  /// **'You can withdraw any purpose later in two taps. The company\'s next request is blocked.'**
  String get protect_2;

  /// No description provided for @protect_3.
  ///
  /// In en, this message translates to:
  /// **'Every time a company uses your data it is recorded. If the record is edited later, the edit shows.'**
  String get protect_3;

  /// No description provided for @protect_4.
  ///
  /// In en, this message translates to:
  /// **'When a company needs sensitive details, they are encrypted on this phone first. The company gets a decision, not your details. In this demo the secure processor is simulated.'**
  String get protect_4;

  /// No description provided for @protect_note.
  ///
  /// In en, this message translates to:
  /// **'Sammati is a prototype with made-up data. It is aligned with the principles of India\'s DPDP Act, 2023. This is not legal advice and not a certification. What is mapped, and what is still unchecked, is in docs/dpdp-mapping.md.'**
  String get protect_note;
}

class _AppLocalizationsDelegate
    extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  Future<AppLocalizations> load(Locale locale) {
    return SynchronousFuture<AppLocalizations>(lookupAppLocalizations(locale));
  }

  @override
  bool isSupported(Locale locale) =>
      <String>['en', 'hi', 'kn'].contains(locale.languageCode);

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

AppLocalizations lookupAppLocalizations(Locale locale) {
  // Lookup logic when only language code is specified.
  switch (locale.languageCode) {
    case 'en':
      return AppLocalizationsEn();
    case 'hi':
      return AppLocalizationsHi();
    case 'kn':
      return AppLocalizationsKn();
  }

  throw FlutterError(
    'AppLocalizations.delegate failed to load unsupported locale "$locale". This is likely '
    'an issue with the localizations generation tool. Please file an issue '
    'on GitHub with a reproducible sample app and the gen-l10n configuration '
    'that was used.',
  );
}
