// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Hindi (`hi`).
class AppLocalizationsHi extends AppLocalizations {
  AppLocalizationsHi([String locale = 'hi']) : super(locale);

  @override
  String get appName => 'Sammati';

  @override
  String get give_consent => 'सहमति दें';

  @override
  String get withdraw => 'वापस लें';

  @override
  String withdrawn_blocked(String company) {
    return 'वापस ली गई। $company रोका गया।';
  }

  @override
  String get allowed => 'अनुमति दी गई';

  @override
  String get blocked => 'रोका गया';

  @override
  String get scan_to_connect => 'कनेक्ट करने के लिए स्कैन करें';

  @override
  String get withdraw_easy =>
      'आप बाद में किसी भी उद्देश्य की सहमति उतनी ही आसानी से वापस ले सकते हैं।';

  @override
  String get recorded => 'लेजर पर दर्ज';

  @override
  String get nav_consents => 'सहमतियाँ';

  @override
  String get nav_activity => 'गतिविधि';

  @override
  String get nav_scan => 'स्कैन';

  @override
  String get nav_rights => 'अधिकार';

  @override
  String get nav_me => 'मैं';

  @override
  String get consents_empty =>
      'अभी कोई कंपनी नहीं। अपनी पहली कंपनी जोड़ने के लिए QR कोड स्कैन करें।';

  @override
  String get activity_empty =>
      'अभी कोई गतिविधि नहीं। कंपनियों द्वारा डेटा का उपयोग यहाँ दिखेगा।';

  @override
  String get rights_access => 'देखें कि कंपनी के पास क्या है';

  @override
  String get rights_erasure => 'कंपनी से डेटा मिटाने को कहें';

  @override
  String get rights_grievance => 'शिकायत दर्ज करें';

  @override
  String get me_language => 'भाषा';

  @override
  String get me_developer => 'डेवलपर सेटिंग्स';

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
      'आपके Wi-Fi पर Sammati Core का पता, जैसे http://192.168.1.5:4000';

  @override
  String get dev_core_url_invalid =>
      'http:// या https:// से शुरू होने वाला पूरा पता दर्ज करें';

  @override
  String get dev_save => 'सहेजें';

  @override
  String get dev_saved => 'सहेजा गया';

  @override
  String get language_title => 'अपनी भाषा चुनें';

  @override
  String get onb_continue => 'आगे बढ़ें';

  @override
  String get onb_next => 'अगला';

  @override
  String get onb_1 => 'देखें किन कंपनियों के पास आपकी सहमति है';

  @override
  String get onb_2 => 'हर चीज़ को नहीं, सिर्फ़ एक उद्देश्य को हाँ कहें';

  @override
  String get onb_3 => 'एक टैप में वापस लें';

  @override
  String get wallet_create_title => 'फ़िंगरप्रिंट या PIN से सुरक्षित करें';

  @override
  String get wallet_create_body =>
      'आपकी सहमतियाँ इसी फ़ोन पर साइन होती हैं। इन्हें सिर्फ़ आप मंज़ूर कर सकते हैं।';

  @override
  String get wallet_create_button => 'वॉलेट बनाएँ';

  @override
  String get wallet_no_lock =>
      'इस फ़ोन पर स्क्रीन लॉक सेट करें, फिर दोबारा कोशिश करें।';

  @override
  String get wallet_auth_failed =>
      'पुष्टि नहीं हो सकी कि यह आप हैं। दोबारा कोशिश करें।';

  @override
  String get wallet_create_failed => 'वॉलेट नहीं बन सका। दोबारा कोशिश करें।';

  @override
  String get auth_reason_create => 'अपना वॉलेट बनाने के लिए पुष्टि करें';

  @override
  String get auth_reason_sign => 'इसे मंज़ूर करने के लिए पुष्टि करें';

  @override
  String get me_wallet_address => 'वॉलेट पता';

  @override
  String get copied => 'कॉपी किया गया';

  @override
  String get scan_hint => 'कैमरे को कंपनी के QR कोड की ओर रखें।';

  @override
  String get scan_torch => 'टॉर्च';

  @override
  String get scan_camera_denied =>
      'QR कोड स्कैन करने के लिए कैमरे की अनुमति दें।';

  @override
  String get scan_invalid_qr => 'यह Sammati का QR कोड नहीं है।';

  @override
  String get scan_paste_hint => 'यहाँ QR का पाठ पेस्ट करें';

  @override
  String get scan_paste_open => 'खोलें';

  @override
  String get error_unreachable => 'Sammati तक नहीं पहुँच सके। Wi-Fi जाँचें।';

  @override
  String get request_gone =>
      'यह अनुरोध अब मान्य नहीं है। कंपनी से नया QR कोड माँगें।';

  @override
  String get notice_mismatch =>
      'यह सूचना सत्यापित नहीं हो सकी, इसलिए कुछ भी साइन नहीं हुआ। कंपनी से नया QR कोड माँगें।';

  @override
  String get grant_failed => 'इसे दर्ज नहीं कर सके। दोबारा कोशिश करें।';

  @override
  String get retry => 'दोबारा कोशिश करें';

  @override
  String asking_for_purposes(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count उद्देश्यों के लिए पूछ रहे हैं',
    );
    return '$_temp0';
  }

  @override
  String give_consent_count(int count) {
    return 'सहमति दें ($count)';
  }

  @override
  String get needed_for_service => 'सेवा के लिए ज़रूरी';

  @override
  String get shares_third_party => 'तीसरे पक्ष के साथ साझा';

  @override
  String retention_days(int days) {
    String _temp0 = intl.Intl.pluralLogic(
      days,
      locale: localeName,
      other: '$days दिन रखा जाएगा',
    );
    return '$_temp0';
  }

  @override
  String retention_months(int months) {
    String _temp0 = intl.Intl.pluralLogic(
      months,
      locale: localeName,
      other: '$months महीने रखा जाएगा',
    );
    return '$_temp0';
  }

  @override
  String get expiry_label => 'सहमति की अवधि';

  @override
  String get expiry_30d => '30 दिन';

  @override
  String get expiry_6m => '6 महीने';

  @override
  String get expiry_1y => '1 साल';

  @override
  String purpose_switch_label(String purpose, String company) {
    return '$purpose, $company';
  }

  @override
  String receipt_expires(String date) {
    return '$date तक मान्य';
  }

  @override
  String get receipt_tx => 'लेजर लेन-देन';

  @override
  String get receipt_view_proof => 'प्रमाण देखें';

  @override
  String get done => 'हो गया';

  @override
  String get error_generic => 'कुछ गड़बड़ हो गई। दोबारा कोशिश करें।';

  @override
  String consents_summary(int companies, int active) {
    String _temp0 = intl.Intl.pluralLogic(
      companies,
      locale: localeName,
      other: '$companies कंपनियाँ · $active सक्रिय',
    );
    return '$_temp0';
  }

  @override
  String get status_active => 'सक्रिय';

  @override
  String get status_expired => 'समाप्त';

  @override
  String get status_withdrawn => 'वापस ली गई';

  @override
  String expired_ago(int days) {
    String _temp0 = intl.Intl.pluralLogic(
      days,
      locale: localeName,
      other: '$days दिन पहले समाप्त, फिर से सहमति दें',
    );
    return '$_temp0';
  }

  @override
  String expires_in_days(int days) {
    String _temp0 = intl.Intl.pluralLogic(
      days,
      locale: localeName,
      other: '$days दिन में समाप्त',
    );
    return '$_temp0';
  }

  @override
  String expires_in_months(int months) {
    String _temp0 = intl.Intl.pluralLogic(
      months,
      locale: localeName,
      other: '$months महीने में समाप्त',
    );
    return '$_temp0';
  }

  @override
  String get offline_banner =>
      'कनेक्शन नहीं है। पिछली ज्ञात सहमतियाँ दिख रही हैं।';

  @override
  String withdraw_confirm(String company, String purpose) {
    return '$company को $purpose के लिए आपका डेटा इस्तेमाल करने से रोकें? उन्हें तुरंत रोक दिया जाएगा।';
  }

  @override
  String get keep => 'रखें';

  @override
  String get auth_reason_withdraw => 'सहमति वापस लेने के लिए पुष्टि करें';

  @override
  String get filter_all => 'सभी';

  @override
  String get reason_consent_withdrawn => 'सहमति वापस ली गई';

  @override
  String get reason_consent_expired => 'सहमति समाप्त';

  @override
  String get reason_no_consent => 'सहमति नहीं दी गई';

  @override
  String get reason_ledger_unavailable =>
      'सहमति जाँच नहीं हो सकी, इसलिए रोका गया';

  @override
  String get reason_no_principal => 'यह पता नहीं चला कि डेटा किसका था';

  @override
  String get time_now => 'अभी अभी';

  @override
  String time_seconds(int n) {
    return '$n सेकंड पहले';
  }

  @override
  String time_minutes(int n) {
    return '$n मिनट पहले';
  }

  @override
  String time_hours(int n) {
    return '$n घंटे पहले';
  }

  @override
  String time_days(int n) {
    return '$n दिन पहले';
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
      'कनेक्शन नहीं है। पिछली ज्ञात गतिविधि दिख रही है।';

  @override
  String get proof_headline =>
      'यह एक्सेस रिकॉर्ड किया गया और लेजर पर लॉक किया गया।';

  @override
  String get proof_record_hash => 'रिकॉर्ड हैश';

  @override
  String get proof_batch_anchor => 'बैच एंकर';

  @override
  String get proof_merkle_verified => 'सत्यापित ✓';

  @override
  String get proof_merkle_failed => 'सत्यापन विफल';

  @override
  String get proof_merkle_checking => 'जाँच हो रही है…';

  @override
  String get proof_open_explorer => 'ब्लॉक एक्सप्लोरर में खोलें';

  @override
  String get proof_consent_signer => 'हस्ताक्षरकर्ता (आप)';

  @override
  String get proof_ledger_head => 'लेजर हेड';

  @override
  String get proof_consent_tx => 'लेन-देन';

  @override
  String get proof_loading => 'प्रमाण लोड हो रहा है…';

  @override
  String get proof_failed => 'प्रमाण लोड नहीं हो सका। दोबारा कोशिश करें।';

  @override
  String get cascade_title => 'इन्हें भी बताया गया';

  @override
  String get cascade_waiting => 'प्रतीक्षा में…';

  @override
  String cascade_acked(int n) {
    return '$n सेकंड पहले';
  }

  @override
  String get vault_simulated =>
      'डेमो प्रोसेसर (सिम्युलेटेड एन्क्लेव, असली हार्डवेयर सुरक्षा नहीं)';

  @override
  String get vault_send => 'सुरक्षित रूप से भेजें';

  @override
  String get vault_send_again => 'दोबारा भेजें';

  @override
  String vault_send_hint(String company) {
    return '$company को फ़ैसला मिलता है, आपका विवरण नहीं। उन्हें सिर्फ़ Sammati Processor खोल सकता है।';
  }

  @override
  String get vault_sending => 'एन्क्रिप्ट करके भेज रहे हैं…';

  @override
  String vault_sent(String company) {
    return 'एन्क्रिप्ट करके भेजा गया। $company के पास सिर्फ़ एक संदर्भ है।';
  }

  @override
  String get vault_erased => 'आपका एन्क्रिप्टेड विवरण मिटा दिया गया।';

  @override
  String get vault_failed => 'सुरक्षित रूप से नहीं भेज सके। दोबारा कोशिश करें।';

  @override
  String get auth_reason_vault =>
      'अपना विवरण सुरक्षित भेजने के लिए पुष्टि करें';

  @override
  String get share_title => 'अपना विवरण सुरक्षित रूप से साझा करें';

  @override
  String share_intro(String company) {
    return '$company को इस उद्देश्य के लिए ये जानकारी चाहिए। ये इसी फ़ोन पर एन्क्रिप्ट होती हैं, इसलिए $company इन्हें कभी नहीं देखती।';
  }

  @override
  String get share_pan => 'PAN';

  @override
  String get share_pan_hint => 'जैसे ABCDE1234F';

  @override
  String get share_pan_invalid => 'ABCDE1234F जैसा PAN दर्ज करें';

  @override
  String get share_income => 'आय वर्ग';

  @override
  String get income_0_3 => '3 LPA तक';

  @override
  String get income_3_6 => '3 से 6 LPA';

  @override
  String get income_6_9 => '6 से 9 LPA';

  @override
  String get income_9_plus => '9 LPA और अधिक';

  @override
  String get share_employment => 'रोज़गार';

  @override
  String get emp_salaried => 'वेतनभोगी';

  @override
  String get emp_self_employed => 'स्वरोज़गार';

  @override
  String get emp_student => 'विद्यार्थी';

  @override
  String get emp_unemployed => 'बेरोज़गार';

  @override
  String get share_cta => 'अपना विवरण सुरक्षित रूप से साझा करें';

  @override
  String get inbox_title => 'अनुरोध';

  @override
  String inbox_badge_label(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count अनुरोध',
    );
    return '$_temp0';
  }

  @override
  String get inbox_empty =>
      'कोई अनुरोध नहीं। जब कोई कंपनी आपकी सहमति माँगेगी, वह यहाँ दिखेगा।';

  @override
  String inbox_asks(String company, int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count उद्देश्यों के लिए सहमति माँग रही है',
    );
    return '$company $_temp0';
  }

  @override
  String inbox_message_from(String company) {
    return '$company का संदेश';
  }

  @override
  String inbox_expires_hours(int hours) {
    String _temp0 = intl.Intl.pluralLogic(
      hours,
      locale: localeName,
      other: '$hours घंटे में समाप्त',
    );
    return '$_temp0';
  }

  @override
  String get inbox_expires_soon => 'एक घंटे से कम में समाप्त';

  @override
  String get inbox_offline =>
      'कनेक्शन नहीं है। पिछले ज्ञात अनुरोध दिख रहे हैं।';

  @override
  String get request_review => 'देखें';

  @override
  String get request_decline => 'अस्वीकार करें';

  @override
  String get request_block => 'इस कंपनी को ब्लॉक करें';

  @override
  String request_block_confirm(String company) {
    return '$company को ब्लॉक करें? वे आपको अनुरोध नहीं भेज सकेंगी।';
  }

  @override
  String get request_declined => 'अनुरोध अस्वीकार किया गया।';

  @override
  String request_blocked(String company) {
    return '$company ब्लॉक है।';
  }

  @override
  String get blocked_title => 'ब्लॉक की गई कंपनियाँ';

  @override
  String get blocked_empty => 'आपने किसी को ब्लॉक नहीं किया है।';

  @override
  String get request_unblock => 'अनब्लॉक करें';

  @override
  String get auth_reason_decline => 'इस अनुरोध को अस्वीकार करने की पुष्टि करें';

  @override
  String get auth_reason_block => 'इस कंपनी को ब्लॉक करने की पुष्टि करें';

  @override
  String get id_title => 'आपकी Sammati ID';

  @override
  String get id_none => 'अभी कोई Sammati ID नहीं';

  @override
  String get id_explain =>
      'कंपनियाँ आपको यहाँ सहमति अनुरोध भेज सकती हैं। जब तक आप हाँ नहीं कहते, वे आपका वॉलेट पता नहीं देखतीं।';

  @override
  String get id_choose => 'अपनी ID चुनें';

  @override
  String get id_hint => '3 से 30 अक्षर, अंक, बिंदु या डैश';

  @override
  String get id_invalid => '3 से 30 अक्षर, अंक, बिंदु या डैश इस्तेमाल करें';

  @override
  String get id_taken => 'यह ID ली जा चुकी है। दूसरी आज़माएँ।';

  @override
  String get id_register => 'पंजीकृत करें';

  @override
  String id_registered(String handle) {
    return 'आपकी ID $handle है';
  }

  @override
  String get auth_reason_id => 'अपनी Sammati ID पंजीकृत करने की पुष्टि करें';

  @override
  String get nav_alerts => 'अलर्ट';

  @override
  String get alerts_title => 'अलर्ट';

  @override
  String get alerts_unread => 'अपठित अलर्ट';

  @override
  String get alerts_today => 'आज';

  @override
  String get alerts_earlier => 'पहले';

  @override
  String get alerts_mark_all => 'सभी को पढ़ा हुआ मानें';

  @override
  String get alerts_empty =>
      'कोई अलर्ट नहीं। समाप्ति की याद दिलाने वाले संदेश और कंपनियों के अपडेट यहाँ दिखेंगे।';

  @override
  String get alerts_offline =>
      'कनेक्शन नहीं है। पिछले ज्ञात अलर्ट दिख रहे हैं।';

  @override
  String alert_expiring(String purpose, String company, String time) {
    return '$company में $purpose के लिए आपकी सहमति $time में समाप्त होगी';
  }

  @override
  String alert_expired(String purpose, String company) {
    return '$company में $purpose के लिए आपकी सहमति समाप्त हो गई है';
  }

  @override
  String alert_renewal(String company, String purpose) {
    return '$company आपसे $purpose के लिए सहमति नवीनीकृत करने को कहती है';
  }

  @override
  String alert_erased_withdrawn(String company, String purpose) {
    return 'आपके सहमति वापस लेने के बाद $company ने $purpose का आपका डेटा मिटा दिया';
  }

  @override
  String alert_erased_expired(String company, String purpose) {
    return 'सहमति समाप्त होने के बाद $company ने $purpose का आपका डेटा मिटा दिया';
  }

  @override
  String alert_cascade(String processor, String purpose) {
    return '$processor ने पुष्टि की कि उसने $purpose के लिए आपके डेटा का उपयोग बंद कर दिया है';
  }

  @override
  String get alert_renew => 'नवीनीकृत करें';

  @override
  String get alert_let_expire => 'समाप्त होने दें';

  @override
  String get alert_view_proof => 'प्रमाण देखें';

  @override
  String get alert_let_expire_done =>
      'ठीक है। यह सहमति अपने आप समाप्त हो जाएगी।';

  @override
  String get alert_renew_failed => 'नवीनीकरण नहीं खुल सका। फिर कोशिश करें।';

  @override
  String get alert_state_renewed => 'नवीनीकृत';

  @override
  String get alert_state_left => 'समाप्त होने दिया';

  @override
  String duration_days(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count दिन',
    );
    return '$_temp0';
  }

  @override
  String duration_hours(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count घंटे',
    );
    return '$_temp0';
  }

  @override
  String duration_minutes(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count मिनट',
    );
    return '$_temp0';
  }

  @override
  String duration_seconds(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count सेकंड',
    );
    return '$_temp0';
  }

  @override
  String get expiry_demo => '2 मिनट (डेमो)';

  @override
  String get notif_expiring_title => 'सहमति जल्द समाप्त होगी';

  @override
  String get notif_expired_title => 'सहमति समाप्त हो गई';

  @override
  String get notif_renewal_title => 'नवीनीकरण का अनुरोध';

  @override
  String get notif_erased_title => 'आपका डेटा मिटा दिया गया';

  @override
  String get notif_cascade_title => 'कंपनी ने पुष्टि की';

  @override
  String get notif_channel => 'सहमति अलर्ट';

  @override
  String alert_ago(String time) {
    return '$time पहले';
  }

  @override
  String get protect_link => 'यह आपको कैसे सुरक्षित रखता है';

  @override
  String get protect_1 =>
      'हर उद्देश्य आपका अपना चुनाव है। आपके लिए कुछ भी पहले से चुना नहीं गया है।';

  @override
  String get protect_2 =>
      'आप बाद में दो टैप में किसी भी उद्देश्य की सहमति वापस ले सकते हैं। कंपनी का अगला अनुरोध रोक दिया जाता है।';

  @override
  String get protect_3 =>
      'जब भी कोई कंपनी आपके डेटा का उपयोग करती है, वह दर्ज होता है। बाद में रिकॉर्ड बदला गया तो बदलाव पकड़ में आ जाता है।';

  @override
  String get protect_4 =>
      'जब किसी कंपनी को संवेदनशील जानकारी चाहिए, तो वह पहले इसी फ़ोन पर एन्क्रिप्ट होती है। कंपनी को फ़ैसला मिलता है, आपकी जानकारी नहीं। इस डेमो में सुरक्षित प्रोसेसर नकली (सिम्युलेटेड) है।';

  @override
  String get protect_note =>
      'Sammati एक प्रोटोटाइप है और इसमें बनावटी डेटा है। यह भारत के DPDP अधिनियम, 2023 के सिद्धांतों के अनुरूप बनाया गया है। यह क़ानूनी सलाह या प्रमाणन नहीं है। क्या मैप किया गया है और क्या अभी जाँचना बाकी है, यह docs/dpdp-mapping.md में है।';

  @override
  String acct_step(int n) {
    return 'चरण $n / 3';
  }

  @override
  String get acct_id_title => 'अपनी Sammati ID चुनें';

  @override
  String get acct_id_checking => 'जाँच हो रही है…';

  @override
  String acct_id_available(String handle) {
    return '$handle उपलब्ध है';
  }

  @override
  String get acct_id_later => 'बाद में चुनें';

  @override
  String acct_registering(String handle) {
    return 'आपका वॉलेट बन गया है। $handle पंजीकृत हो रही है…';
  }

  @override
  String acct_register_failed(String handle) {
    return 'आपका वॉलेट तैयार है, लेकिन $handle पंजीकृत नहीं हो सकी।';
  }

  @override
  String get acct_choose_another => 'दूसरी ID चुनें';

  @override
  String get acct_profile_title => 'आपकी जानकारी';

  @override
  String get acct_profile_body =>
      'जो चाहें, एक बार भर दें। हर खाना वैकल्पिक है। किसी कंपनी को कोई जानकारी तभी मिलती है जब आप उस उद्देश्य के लिए हाँ कहें जिसे उसकी ज़रूरत है।';

  @override
  String get acct_skip => 'अभी छोड़ें';

  @override
  String get acct_finish => 'सहेजें और आगे बढ़ें';

  @override
  String get profile_title => 'मेरी जानकारी';

  @override
  String get profile_group_identity => 'आप कौन हैं';

  @override
  String get profile_group_contact => 'आप तक कैसे पहुँचें';

  @override
  String get profile_group_financial => 'पैसा';

  @override
  String get profile_group_health => 'स्वास्थ्य';

  @override
  String get profile_group_prefs => 'आपकी पसंद';

  @override
  String get profile_private =>
      'केवल इसी फ़ोन में रखी जाती है, आपके फ़िंगरप्रिंट या PIN से बंद। Sammati के सर्वर इन्हें कभी नहीं पाते।';

  @override
  String get profile_locked => 'आपकी जानकारी बंद है';

  @override
  String get profile_unlock => 'खोलें';

  @override
  String get auth_reason_profile => 'अपनी जानकारी खोलने के लिए पुष्टि करें';

  @override
  String get profile_empty =>
      'अभी कुछ नहीं जोड़ा। एक बार जोड़ें और किसी भी कंपनी के साथ इस्तेमाल करें।';

  @override
  String get profile_not_set => 'जोड़ा नहीं गया';

  @override
  String get profile_save => 'सहेजें';

  @override
  String get profile_remove => 'हटाएँ';

  @override
  String get profile_saved => 'इस फ़ोन में सहेजा गया';

  @override
  String get profile_lost =>
      'आपकी सहेजी जानकारी पढ़ी नहीं जा सकी। उसे फिर से जोड़ें।';

  @override
  String get gender_female => 'महिला';

  @override
  String get gender_male => 'पुरुष';

  @override
  String get gender_other => 'अन्य';

  @override
  String get gender_prefer_not => 'बताना नहीं चाहते';

  @override
  String get food_vegetarian => 'शाकाहारी';

  @override
  String get food_non_vegetarian => 'मांसाहारी';

  @override
  String get food_vegan => 'वीगन';

  @override
  String get dob_hint => 'DD/MM/YYYY';

  @override
  String get err_name => 'अपना पूरा नाम दर्ज करें, 2 से 80 अक्षर';

  @override
  String get err_dob => '31/12/1995 जैसी असली तारीख दर्ज करें';

  @override
  String get err_mobile => '10 अंकों का मोबाइल नंबर दर्ज करें';

  @override
  String get err_email => 'name@example.com जैसा ईमेल दर्ज करें';

  @override
  String get err_text => 'बहुत छोटा या बहुत लंबा';

  @override
  String get err_policy => '4 से 30 अक्षर, अंक या डैश इस्तेमाल करें';

  @override
  String get share_have => 'मेरी जानकारी से';

  @override
  String share_missing(String company) {
    return '$company को ये भी चाहिए';
  }

  @override
  String get share_saved_note =>
      'मेरी जानकारी में सहेजा जाता है, ताकि आपको एक ही बार लिखना पड़े।';

  @override
  String share_none_needed(String company) {
    return '$company को इसके लिए आपसे कोई जानकारी नहीं चाहिए।';
  }

  @override
  String get share_edit => 'बदलें';

  @override
  String details_changed(String company) {
    return 'आपकी जानकारी बदली है। $company के पास जो है उसे अपडेट करें?';
  }

  @override
  String get details_update => 'अपडेट करें';

  @override
  String get me_about => 'परिचय';

  @override
  String get about_title => 'Sammati के बारे में';

  @override
  String get about_prototype =>
      'Sammati एक प्रोटोटाइप है। बनावटी जानकारी का उपयोग करें।';

  @override
  String get about_no_recovery_title =>
      'इस संस्करण में खाता पुनर्प्राप्ति नहीं है';

  @override
  String get about_no_recovery_body =>
      'यह फ़ोन खो जाए या ऐप का डेटा मिट जाए, तो आपका वॉलेट, आपकी Sammati ID और सहेजी हुई जानकारी चली जाती है और आपको नया खाता बनाना पड़ता है। असली संस्करण में बैकअप और पुनर्प्राप्ति की योजना है।';

  @override
  String activity_used(
    String company,
    String data,
    String purpose,
    String outcome,
  ) {
    return '$company ने $purpose के लिए आपका $data इस्तेमाल किया। साझा किया गया फ़ैसला: $outcome।';
  }

  @override
  String activity_used_blocked(String company, String purpose) {
    return '$company ने $purpose के लिए आपका डेटा इस्तेमाल करने की कोशिश की। रोका गया।';
  }

  @override
  String get outcome_approved => 'मंज़ूर';

  @override
  String get outcome_declined => 'अस्वीकृत';

  @override
  String list_and(String rest, String last) {
    return '$rest और $last';
  }

  @override
  String get use_title => 'आपके डेटा का उपयोग कैसे हुआ';

  @override
  String get use_what => 'क्या इस्तेमाल हुआ';

  @override
  String get use_stored => 'कहाँ रखा गया';

  @override
  String get use_stored_value =>
      'प्रोसेसर पर एन्क्रिप्टेड रूप में। सिफरटेक्स्ट हैश:';

  @override
  String get use_stored_unknown => 'इस फ़ोन पर दर्ज नहीं';

  @override
  String get use_where => 'कहाँ प्रोसेस हुआ';

  @override
  String get use_where_value => 'Sammati प्रोसेसर (सिम्युलेटेड एन्क्लेव)';

  @override
  String get use_left => 'प्रोसेसर से क्या बाहर गया';

  @override
  String use_left_value(String outcome) {
    return 'सिर्फ़ फ़ैसला: $outcome। कोई जानकारी नहीं।';
  }

  @override
  String erased_named(String company, String data) {
    return '$company के पास अब आपका $data नहीं है।';
  }
}
