// Copy for /join and the status page (ui.md §3.2, §3.3). Hindi and Kannada need a native-speaker check before the demo.
export type Lang = "en" | "hi" | "kn";

export const JOIN_COPY = {
  join_title: { en: "Ask people for consent the right way", hi: "लोगों से सही तरीके से सहमति मांगें", kn: "ಜನರಿಂದ ಸರಿಯಾದ ರೀತಿಯಲ್ಲಿ ಒಪ್ಪಿಗೆ ಕೇಳಿ" },
  join_intro: {
    en: "Register your company. The regulator reviews it. Then you can ask customers for consent and check it before you use their data.",
    hi: "अपनी कंपनी पंजीकृत करें। नियामक उसकी समीक्षा करता है। फिर आप ग्राहकों से सहमति मांग सकते हैं और उनका डेटा इस्तेमाल करने से पहले उसे जाँच सकते हैं।",
    kn: "ನಿಮ್ಮ ಕಂಪನಿಯನ್ನು ನೋಂದಾಯಿಸಿ. ನಿಯಂತ್ರಕರು ಅದನ್ನು ಪರಿಶೀಲಿಸುತ್ತಾರೆ. ನಂತರ ನೀವು ಗ್ರಾಹಕರ ಒಪ್ಪಿಗೆ ಕೇಳಬಹುದು ಮತ್ತು ಅವರ ಡೇಟಾ ಬಳಸುವ ಮೊದಲು ಅದನ್ನು ಪರಿಶೀಲಿಸಬಹುದು.",
  },
  join_company: { en: "Company name", hi: "कंपनी का नाम", kn: "ಕಂಪನಿಯ ಹೆಸರು" },
  join_sector: { en: "Sector", hi: "क्षेत्र", kn: "ವಲಯ" },
  join_email: { en: "Contact email", hi: "संपर्क ईमेल", kn: "ಸಂಪರ್ಕ ಇಮೇಲ್" },
  join_email_note: {
    en: "Used only for this application. Deleted when the regulator decides.",
    hi: "केवल इस आवेदन के लिए। नियामक के निर्णय पर हटा दिया जाएगा।",
    kn: "ಈ ಅರ್ಜಿಗೆ ಮಾತ್ರ. ನಿಯಂತ್ರಕರು ತೀರ್ಮಾನಿಸಿದಾಗ ಅಳಿಸಲಾಗುತ್ತದೆ.",
  },
  join_purposes: { en: "Purposes you will ask for", hi: "आप किन उद्देश्यों के लिए सहमति मांगेंगे", kn: "ನೀವು ಕೇಳುವ ಉದ್ದೇಶಗಳು" },
  join_add_purpose: { en: "Add a purpose", hi: "उद्देश्य जोड़ें", kn: "ಉದ್ದೇಶ ಸೇರಿಸಿ" },
  join_remove: { en: "Remove", hi: "हटाएं", kn: "ತೆಗೆದುಹಾಕಿ" },
  join_code: { en: "Code", hi: "कोड", kn: "ಕೋಡ್" },
  join_title_field: { en: "Title", hi: "शीर्षक", kn: "ಶೀರ್ಷಿಕೆ" },
  join_description: { en: "What you will do with the data, in plain words", hi: "आप डेटा के साथ क्या करेंगे, सरल शब्दों में", kn: "ನೀವು ಡೇಟಾದೊಂದಿಗೆ ಏನು ಮಾಡುತ್ತೀರಿ, ಸರಳ ಮಾತುಗಳಲ್ಲಿ" },
  join_categories: { en: "Data categories (pick from the list)", hi: "डेटा श्रेणियाँ (सूची से चुनें)", kn: "ಡೇಟಾ ವರ್ಗಗಳು (ಪಟ್ಟಿಯಿಂದ ಆಯ್ಕೆಮಾಡಿ)" },
  join_retention: { en: "Kept for (days)", hi: "कितने दिन रखा जाएगा", kn: "ಎಷ್ಟು ದಿನ ಇಡಲಾಗುತ್ತದೆ" },
  join_shares: { en: "Shared with third parties", hi: "तीसरे पक्ष के साथ साझा", kn: "ಮೂರನೇ ಪಕ್ಷಗಳೊಂದಿಗೆ ಹಂಚಲಾಗುತ್ತದೆ" },
  join_required: { en: "Needed for the service", hi: "सेवा के लिए आवश्यक", kn: "ಸೇವೆಗೆ ಅಗತ್ಯ" },
  join_processors: { en: "Partners that receive data (optional)", hi: "डेटा पाने वाले साझेदार (वैकल्पिक)", kn: "ಡೇಟಾ ಪಡೆಯುವ ಪಾಲುದಾರರು (ಐಚ್ಛಿಕ)" },
  join_add_processor: { en: "Add a partner", hi: "साझेदार जोड़ें", kn: "ಪಾಲುದಾರರನ್ನು ಸೇರಿಸಿ" },
  join_processor_name: { en: "Name", hi: "नाम", kn: "ಹೆಸರು" },
  join_processor_for: { en: "Used for", hi: "किसलिए", kn: "ಯಾವುದಕ್ಕೆ" },
  join_submit: { en: "Send for review", hi: "समीक्षा के लिए भेजें", kn: "ಪರಿಶೀಲನೆಗೆ ಕಳುಹಿಸಿ" },
  join_sending: { en: "Sending…", hi: "भेजा जा रहा है…", kn: "ಕಳುಹಿಸಲಾಗುತ್ತಿದೆ…" },
  join_pending: { en: "Waiting for the regulator", hi: "नियामक की प्रतीक्षा", kn: "ನಿಯಂತ್ರಕರಿಗಾಗಿ ಕಾಯುತ್ತಿದೆ" },
  join_pending_hint: { en: "Keep this page's address. You can come back to it.", hi: "इस पेज का पता रखें। आप इस पर वापस आ सकते हैं।", kn: "ಈ ಪುಟದ ವಿಳಾಸ ಇಟ್ಟುಕೊಳ್ಳಿ. ನೀವು ಇದಕ್ಕೆ ಮರಳಿ ಬರಬಹುದು." },
  join_rejected: { en: "Not approved", hi: "स्वीकृत नहीं", kn: "ಅನುಮೋದಿಸಲಾಗಿಲ್ಲ" },
  join_rejected_hint: { en: "You can apply again with the changes.", hi: "आप बदलावों के साथ फिर आवेदन कर सकते हैं।", kn: "ಬದಲಾವಣೆಗಳೊಂದಿಗೆ ನೀವು ಮತ್ತೆ ಅರ್ಜಿ ಸಲ್ಲಿಸಬಹುದು." },
  join_approved: { en: "{name} is registered", hi: "{name} पंजीकृत है", kn: "{name} ನೋಂದಾಯಿಸಲಾಗಿದೆ" },
  join_sandbox: { en: "Sandbox", hi: "सैंडबॉक्स", kn: "ಸ್ಯಾಂಡ್‌ಬಾಕ್ಸ್" },
  join_address: { en: "Fiduciary address", hi: "फिड्यूशियरी पता", kn: "ಫಿಡ್ಯೂಷಿಯರಿ ವಿಳಾಸ" },
  join_api_key: { en: "API key", hi: "एपीआई कुंजी", kn: "ಎಪಿಐ ಕೀಲಿ" },
  join_key_once: {
    en: "Shown once. Sammati keeps only a fingerprint of it, so it cannot be shown again.",
    hi: "केवल एक बार दिखाया जाता है। Sammati केवल उसका फ़िंगरप्रिंट रखता है, इसलिए इसे दोबारा नहीं दिखाया जा सकता।",
    kn: "ಒಮ್ಮೆ ಮಾತ್ರ ತೋರಿಸಲಾಗುತ್ತದೆ. Sammati ಅದರ ಫಿಂಗರ್‌ಪ್ರಿಂಟ್ ಮಾತ್ರ ಇಟ್ಟುಕೊಳ್ಳುತ್ತದೆ, ಆದ್ದರಿಂದ ಅದನ್ನು ಮತ್ತೆ ತೋರಿಸಲಾಗುವುದಿಲ್ಲ.",
  },
  join_key_seen: {
    en: "You have already seen your key. Ask the regulator to issue a new one.",
    hi: "आप अपनी कुंजी पहले देख चुके हैं। नियामक से नई कुंजी माँगें।",
    kn: "ನಿಮ್ಮ ಕೀಲಿಯನ್ನು ನೀವು ಈಗಾಗಲೇ ನೋಡಿದ್ದೀರಿ. ಹೊಸದನ್ನು ನೀಡಲು ನಿಯಂತ್ರಕರನ್ನು ಕೇಳಿ.",
  },
  join_integrate: { en: "Integrate in 5 lines", hi: "5 पंक्तियों में जोड़ें", kn: "5 ಸಾಲುಗಳಲ್ಲಿ ಸೇರಿಸಿ" },
  join_first_request: { en: "Send your first request", hi: "अपना पहला अनुरोध भेजें", kn: "ನಿಮ್ಮ ಮೊದಲ ವಿನಂತಿಯನ್ನು ಕಳುಹಿಸಿ" },
  join_processor_howto: { en: "Using the Processor", hi: "प्रोसेसर का उपयोग", kn: "ಪ್ರೊಸೆಸರ್ ಬಳಕೆ" },
  join_sandbox_note: {
    en: "In the sandbox you can ask, and receive consent from, only the regulator's test customers. Ask the regulator to promote you when you are ready.",
    hi: "सैंडबॉक्स में आप केवल नियामक के परीक्षण ग्राहकों से सहमति मांग और पा सकते हैं। तैयार होने पर नियामक से प्रोन्नत करने को कहें।",
    kn: "ಸ್ಯಾಂಡ್‌ಬಾಕ್ಸ್‌ನಲ್ಲಿ ನೀವು ನಿಯಂತ್ರಕರ ಪರೀಕ್ಷಾ ಗ್ರಾಹಕರನ್ನು ಮಾತ್ರ ಕೇಳಬಹುದು ಮತ್ತು ಅವರಿಂದ ಮಾತ್ರ ಒಪ್ಪಿಗೆ ಪಡೆಯಬಹುದು. ಸಿದ್ಧರಾದಾಗ ಬಡ್ತಿ ನೀಡಲು ನಿಯಂತ್ರಕರನ್ನು ಕೇಳಿ.",
  },
  join_copy: { en: "Copy", hi: "कॉपी करें", kn: "ನಕಲಿಸಿ" },
  join_copied: { en: "Copied", hi: "कॉपी हो गया", kn: "ನಕಲಿಸಲಾಗಿದೆ" },
} as const satisfies Record<string, Record<Lang, string>>;

export type JoinKey = keyof typeof JOIN_COPY;

export function makeJoinT(lang: Lang) {
  return (key: JoinKey, vars?: Record<string, string>): string => {
    let text: string = JOIN_COPY[key][lang];
    for (const [k, v] of Object.entries(vars ?? {})) text = text.replace(`{${k}}`, v);
    return text;
  };
}
