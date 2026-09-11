# HP GAS CDCMS - Consumer Auto-Blocker Tool 🚀

यह टूल **HP GAS CDCMS** पोर्टल के **Consumer Management/Block Consumer (ScreenCode CM-16)** पेज पर बड़ी संख्या (Bulk) में Consumer Numbers को एक क्लिक में ऑटोमेटिक ब्लॉक करने के लिए बनाया गया है।

---

## 🌟 फीचर्स (Features)
- **100% Automatic**: Consumer No डालेगा ➔ Fetch क्लिक करेगा ➔ Wait करेगा ➔ Block Reason (`NonKYC-NCTC-NonGIU Block`) सेलेक्ट करेगा ➔ Remarks में `ekyc pending` लिखेगा ➔ Block बटन क्लिक करके कन्फर्म करेगा।
- **Chrome Extension UI**: आपके CDCMS पेज पर एक सुंदर Floating Control Widget आ जाएगा।
- **Bulk Paste**: Excel या Notepad से 10, 50, 100 या 1000 कंज्यूमर नंबर एक साथ कॉपी-पेस्ट करें।
- **Live Counter & Logs**: Total, Blocked, Failed और Remaining का लाइव स्टेटस दिखता रहेगा।
- **Auto Popup Accept**: Portal के alert / confirm ("Are you sure to block?") को आटोमेटिक Accept करेगा।
- **Excel/CSV Report**: प्रोसेस खत्म होने के बाद पूरी रिपोर्ट (`CSV/Excel`) डाउनलोड कर सकते हैं।
- **Failed List Copy**: जो नंबर ब्लॉक नहीं हुए, उन्हें एक क्लिक में कॉपी करके अलग से चेक कर सकते हैं।
- **Pause / Stop Control**: किसी भी समय प्रोसेस को Pause या Stop कर सकते हैं।

---

## 🛠️ Chrome में कैसे Install करें (Installation Steps)

सिर्फ 1 मिनट का काम है:

1. अपने **Google Chrome** ब्राउज़र को खोलें।
2. एड्रेस बार (URL bar) में टाइप करें:  
   `chrome://extensions` और **Enter** दबाएं।
3. ऊपर दाईं तरफ (Top-Right) **"Developer mode"** का टॉगल स्विच **ON** करें।
4. ऊपर बाईं तरफ (Top-Left) **"Load unpacked"** बटन पर क्लिक करें।
5. यह फोल्डर सेलेक्ट करें:  
   `C:\Users\USER\Videos\Cdcmas consumer block tool`
6. एक्सटेंशन तुरंत इंस्टॉल हो जाएगा: **"HP Gas CDCMS Consumer Auto-Blocker"** 🎉

---

## 📋 कैसे इस्तेमाल करें (How to Use)

### स्टेप 1: पोर्टल खोलें
- अपने Chrome ब्राउज़र में **HP Gas CDCMS** में लॉगिन करें।
- **Consumer Management/Block Consumer (CM-16)** स्क्रीन पर जाएं।

### स्टेप 2: टूल खोलें
- स्क्रीन पर आपको नीले रंग का एक बटन दिखेगा: **`⚡ CDCMS Auto-Blocker`**। उस पर क्लिक करें।
- Floating Panel खुल जाएगा।

### स्टेप 3: कंज्यूमर नंबर पेस्ट करें
- **"Consumer Numbers (Paste List)"** वाले बॉक्स में अपने सारे Consumer Numbers पेस्ट कर दें (हर लाइन में एक नंबर या कॉमा से अलग)।

### स्टेप 4: Start दबाएं
- **Block Reason**: `NonKYC-NCTC-NonGIU Block` (ऑटोमेटिक सेलेक्ट रहेगा)
- **Remarks**: `ekyc pending` (ऑटोमेटिक लिखा रहेगा)
- **▶ Start Blocking** बटन पर क्लिक करें!
- टूल एक-एक करके सारे कंज्यूमर्स को बिना किसी रुकावट के ब्लॉक करता रहेगा।

### स्टेप 5: रिपोर्ट डाउनलोड करें
- पूरा होने पर **"📥 Download Report (CSV)"** पर क्लिक करके पूरी लिस्ट डाउनलोड कर लें।

---

## 🧪 ऑफलाइन टेस्ट कैसे करें (Offline Simulator Test)
यदि आप लाइव पोर्टल पर चलाने से पहले इसका डेमो देखना चाहते हैं:
1. Chrome में इस फाइल को ओपन करें:  
   `file:///C:/Users/USER/Videos/Cdcmas consumer block tool/test_cdcms_page.html`
2. आपको ठीक CDCMS पोर्टल जैसा टेस्ट पेज दिखेगा।
3. `⚡ CDCMS Auto-Blocker` पर क्लिक करके कुछ नंबर (जैसे `825558`, `825559`, `825560`) पेस्ट करके `Start Blocking` दबाएं और जादू देखें!

---

## 👤 Developer & Official Support
- **Developer**: **Mr. Rahul Script**
- **Domain**: Official Copyright & Technical Support • Business Automation Solutions
- **WhatsApp**: [+917564948617](https://wa.me/917564948617)
- **Email**: [life.rahulg@gmail.com](mailto:life.rahulg@gmail.com)
