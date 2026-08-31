"use client";

/**
 * Lightweight UI internationalisation.
 *
 * English and Simplified Chinese. Chinese isn't an afterthought here — the
 * listing data itself arrives in Chinese and Chinese buyers are the largest
 * non-English group in the Auckland market, so the second language is the whole
 * point rather than a nicety.
 *
 * A flat key -> {en, zh} dictionary rather than a heavy i18n library: the app is
 * one bundle, the strings are known at build time, and a context + hook is all
 * the machinery a two-language site needs. `t("key")` returns the active
 * language, falling back to English (then the key itself) so a missing
 * translation degrades to readable rather than blank.
 *
 * `t` also does simple {name}-style interpolation so counts and values can sit
 * inside a translated sentence.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { translatePropertyType } from "./translations";

export type Lang = "en" | "zh" | "hi" | "pa" | "gu" | "ta";

export const LANGUAGES: { code: Lang; label: string; short: string }[] = [
  { code: "en", label: "English", short: "EN" },
  { code: "zh", label: "简体中文", short: "中" },
  { code: "hi", label: "हिन्दी", short: "हि" },
  { code: "pa", label: "ਪੰਜਾਬੀ", short: "ਪੰ" },
  { code: "gu", label: "ગુજરાતી", short: "ગુ" },
  { code: "ta", label: "தமிழ்", short: "த" },
];

// Every non-English language is optional: any string not yet translated falls
// back to English via `t` rather than failing the build, so coverage can grow
// safely as strings are added.
type Dict = Record<string, {
  en: string;
  zh: string;
  hi?: string;
  pa?: string;
  gu?: string;
  ta?: string;
}>;

// One entry per user-visible string. Keys are dotted by area so they stay
// findable as the set grows.
const STRINGS: Dict = {
  // --- navigation ---
  "nav.overview": { en: "Overview", zh: "概览", ta: "கண்ணோட்டம்", gu: "અવલોકન", pa: "ਸੰਖੇਪ", hi: "अवलोकन" },
  "nav.dealFinders": { en: "Deal Finders", zh: "机会发现", ta: "டீல் கண்டுபிடிப்பான்", gu: "ડીલ ફાઇન્ડર", pa: "ਡੀਲ ਫਾਈਂਡਰ", hi: "डील फ़ाइंडर" },
  "nav.admin": { en: "Admin", zh: "管理", ta: "நிர்வாகம்", gu: "એડમિન", pa: "ਐਡਮਿਨ", hi: "एडमिन" },
  "nav.askOllie": { en: "Ask Ollie", zh: "问 Ollie", ta: "Ollie இடம் கேளுங்கள்", gu: "Ollie ને પૂછો", pa: "Ollie ਤੋਂ ਪੁੱਛੋ", hi: "Ollie से पूछें" },
  "nav.today": { en: "Today's brief", zh: "今日简报", ta: "இன்றைய சுருக்கம்", gu: "આજનો સારાંશ", pa: "ਅੱਜ ਦਾ ਸਾਰ", hi: "आज का सारांश" },
  "nav.allProperties": { en: "All properties", zh: "全部房源", ta: "அனைத்து சொத்துகள்", gu: "બધી મિલકતો", pa: "ਸਾਰੀਆਂ ਜਾਇਦਾਦਾਂ", hi: "सभी संपत्तियाँ" },
  "nav.suburbTrends": { en: "Suburb trends", zh: "区域走势", ta: "புறநகர் போக்குகள்", gu: "ઉપનગર વલણો", pa: "ਉਪਨਗਰ ਰੁਝਾਨ", hi: "उपनगर रुझान" },
  "nav.underpriced": { en: "Underpriced", zh: "低于估值", ta: "குறைந்த விலை", gu: "ઓછી કિંમતવાળી", pa: "ਘੱਟ ਕੀਮਤ ਵਾਲੀਆਂ", hi: "कम कीमत वाली" },
  "nav.subdividable": { en: "Subdividable", zh: "可分割", ta: "உட்பிரிக்கக்கூடிய", gu: "ઉપવિભાજ્ય", pa: "ਉਪਵੰਡਯੋਗ", hi: "उपविभाज्य" },
  "map.mapView": { en: "Map", zh: "地图" },
  "map.listView": { en: "List", zh: "列表" },
  "map.forSale": { en: "For sale", zh: "在售" },
  "map.soldInArea": { en: "Sold", zh: "已售" },
  "map.loading": { en: "Loading map…", zh: "正在加载地图…" },
  "map.pointsShown": { en: "{n} on map", zh: "地图上 {n} 个" },
  "map.otherListing": { en: "Other listing", zh: "其他房源" },
  "map.soldSale": { en: "Sold sale", zh: "成交记录" },
  "map.asking": { en: "Asking", zh: "叫价" },
  "map.sold": { en: "Sold", zh: "成交价" },
  "map.est": { en: "Est", zh: "估值" },
  "map.buyScore": { en: "Buy score", zh: "买入评分" },
  "map.bedsN": { en: "{n} bd", zh: "{n} 卧" },
  "map.viewProperty": { en: "View property →", zh: "查看房源 →" },
  "nav.roomToAdd": { en: "Room to add a bedroom", zh: "可增卧室", ta: "படுக்கையறை சேர்க்க இடம்", gu: "બેડરૂમ ઉમેરવાની જગ્યા", pa: "ਬੈੱਡਰੂਮ ਜੋੜਨ ਦੀ ਗੁੰਜਾਇਸ਼", hi: "बेडरूम जोड़ने की गुंजाइश" },
  "nav.pendingUsers": { en: "Pending users", zh: "待审用户", ta: "நிலுவை பயனர்கள்", gu: "બાકી વપરાશકર્તાઓ", pa: "ਬਕਾਇਆ ਵਰਤੋਂਕਾਰ", hi: "लंबित उपयोगकर्ता" },
  "nav.adminDashboard": { en: "Dashboard", zh: "仪表板", ta: "டாஷ்போர்டு", gu: "ડેશબોર્ડ", pa: "ਡੈਸ਼ਬੋਰਡ", hi: "डैशबोर्ड" },
  "nav.allUsers": { en: "All users", zh: "全部用户", ta: "அனைத்து பயனர்கள்", gu: "બધા વપરાશકર્તાઓ", pa: "ਸਾਰੇ ਵਰਤੋਂਕਾਰ", hi: "सभी उपयोगकर्ता" },
  "nav.weeklyUpload": { en: "Weekly upload", zh: "每周上传", ta: "வாராந்திர பதிவேற்றம்", gu: "સાપ્તાહિક અપલોડ", pa: "ਹਫ਼ਤਾਵਾਰ ਅੱਪਲੋਡ", hi: "साप्ताहिक अपलोड" },
  "nav.reviewPublish": { en: "Review & publish", zh: "审核并发布", ta: "மதிப்பாய்வு & வெளியிடு", gu: "સમીક્ષા & પ્રકાશિત", pa: "ਸਮੀਖਿਆ & ਪ੍ਰਕਾਸ਼ਿਤ", hi: "समीक्षा और प्रकाशित" },
  "nav.compareBatches": { en: "Compare batches", zh: "批次对比", ta: "தொகுதி ஒப்பீடு", gu: "બેચ સરખામણી", pa: "ਬੈਚ ਤੁਲਨਾ", hi: "बैच तुलना" },
  "nav.signOut": { en: "Sign out", zh: "退出登录", ta: "வெளியேறு", gu: "સાઇન આઉટ", pa: "ਸਾਈਨ ਆਊਟ", hi: "साइन आउट" },

  // --- top bar ---
  "top.search": { en: "Search by address or suburb…", zh: "按地址或区域搜索…", ta: "முகவரி அல்லது புறநகரால் தேடுங்கள்…", gu: "સરનામા કે ઉપનગરથી શોધો…", pa: "ਪਤੇ ਜਾਂ ਉਪਨਗਰ ਨਾਲ ਖੋਜੋ…", hi: "पते या उपनगर से खोजें…" },
  "top.region": { en: "Auckland", zh: "奥克兰", ta: "ஆக்லாந்து", gu: "ઓકલેન્ડ", pa: "ਆਕਲੈਂਡ", hi: "ऑकलैंड" },

  // --- deal finder pages ---
  "deal.finder": { en: "DEAL FINDER", zh: "机会发现", ta: "டீல் கண்டுபிடிப்பான்", gu: "ડીલ ફાઇન્ડર", pa: "ਡੀਲ ਫਾਈਂਡਰ", hi: "डील फ़ाइंडर" },
  "deal.listings": { en: "LISTINGS", zh: "房源", ta: "பட்டியல்கள்", gu: "લિસ્ટિંગ", pa: "ਲਿਸਟਿੰਗ", hi: "लिस्टिंग" },
  "deal.medianMargin": { en: "MEDIAN MARGIN", zh: "中位数差价", ta: "இடைநிலை வித்தியாசம்", gu: "મધ્યક તફાવત", pa: "ਮੱਧਮਾਨ ਅੰਤਰ", hi: "मध्यक अंतर" },
  "deal.medianLots": { en: "MEDIAN LOTS", zh: "中位数地块", ta: "இடைநிலை மனைகள்", gu: "મધ્યક લોટ", pa: "ਮੱਧਮਾਨ ਲਾਟ", hi: "मध्यक लॉट" },
  "deal.sortedByMargin": { en: "Sorted by margin ↓", zh: "按差价排序 ↓", ta: "வித்தியாசப்படி வரிசைப்படுத்தப்பட்டது ↓", gu: "તફાવત પ્રમાણે ક્રમબદ્ધ ↓", pa: "ਅੰਤਰ ਅਨੁਸਾਰ ਕ੍ਰਮਬੱਧ ↓", hi: "अंतर के अनुसार क्रमित ↓" },
  "deal.sortedByLots": { en: "Sorted by lots ↓", zh: "按地块排序 ↓", ta: "மனைகள்படி வரிசைப்படுத்தப்பட்டது ↓", gu: "લોટ પ્રમાણે ક્રમબદ્ધ ↓", pa: "ਲਾਟ ਅਨੁਸਾਰ ਕ੍ਰਮਬੱਧ ↓", hi: "लॉट के अनुसार क्रमित ↓" },
  "deal.loadMore": { en: "Load more of {total} listings", zh: "加载更多（共 {total} 条）", ta: "{total} இல் மேலும் ஏற்று", gu: "{total} માંથી વધુ લોડ કરો", pa: "{total} ਵਿੱਚੋਂ ਹੋਰ ਲੋਡ ਕਰੋ", hi: "{total} में से और लोड करें" },
  "deal.filterPlaceholder": { en: "Filter by suburb or address…", zh: "按区域或地址筛选…", ta: "புறநகர் அல்லது முகவரியால் வடிகட்டு…", gu: "ઉપનગર કે સરનામાથી ગાળો…", pa: "ਉਪਨਗਰ ਜਾਂ ਪਤੇ ਨਾਲ ਛਾਂਟੋ…", hi: "उपनगर या पते से छाँटें…" },
  "deal.sharpestDeal": { en: "SHARPEST DEAL", zh: "最佳机会", ta: "சிறந்த டீல்", gu: "શ્રેષ્ઠ ડીલ", pa: "ਸਭ ਤੋਂ ਵਧੀਆ ਡੀਲ", hi: "सबसे अच्छी डील" },
  "deal.largestSite": { en: "LARGEST SITE", zh: "最大地块", ta: "பெரிய மனை", gu: "સૌથી મોટો પ્લોટ", pa: "ਸਭ ਤੋਂ ਵੱਡਾ ਪਲਾਟ", hi: "सबसे बड़ा प्लॉट" },
  "deal.marginVsList": { en: "MARGIN VS LIST PRICE", zh: "对比标价差幅", ta: "பட்டியல் விலைக்கு எதிராக வித்தியாசம்", gu: "યાદી કિંમત સામે તફાવત", pa: "ਸੂਚੀ ਮੁੱਲ ਦੇ ਮੁਕਾਬਲੇ ਅੰਤਰ", hi: "सूची मूल्य की तुलना में अंतर" },
  "deal.additionalLots": { en: "ADDITIONAL LOTS", zh: "可增地块", ta: "கூடுதல் மனைகள்", gu: "વધારાના લોટ", pa: "ਵਾਧੂ ਲਾਟ", hi: "अतिरिक्त लॉट" },
  "deal.listPrice": { en: "LIST PRICE", zh: "标价", ta: "பட்டியல் விலை", gu: "યાદી કિંમત", pa: "ਸੂਚੀ ਮੁੱਲ", hi: "सूची मूल्य" },
  "deal.bd": { en: "{n} bd", zh: "{n} 卧", ta: "{n} படு", gu: "{n} બેડ", pa: "{n} ਬੈੱਡ", hi: "{n} बेड" },
  "deal.ba": { en: "{n} ba", zh: "{n} 浴", ta: "{n} குளி", gu: "{n} બાથ", pa: "{n} ਬਾਥ", hi: "{n} बाथ" },
  "deal.landChip": { en: "{v} land", zh: "土地 {v}", ta: "நிலம் {v}", gu: "જમીન {v}", pa: "ਜ਼ਮੀਨ {v}", hi: "भूमि {v}" },
  "deal.floorChip": { en: "{n} m² floor", zh: "建筑 {n} m²", ta: "தளம் {n} m²", gu: "ફ્લોર {n} m²", pa: "ਫ਼ਲੋਰ {n} m²", hi: "फ़्लोर {n} m²" },
  "deal.floorShort": { en: "{n} m² floor", zh: "{n} m² 建筑", ta: "தளம் {n} m²", gu: "ફ્લોર {n} m²", pa: "ਫ਼ਲੋਰ {n} m²", hi: "फ़्लोर {n} m²" },
  "deal.confLine": { en: "{conf} confidence", zh: "{conf}置信度", ta: "{conf} நம்பிக்கை", gu: "{conf} વિશ્વાસ", pa: "{conf} ਭਰੋਸਾ", hi: "{conf} विश्वास" },
  "deal.compSales": { en: " · {n} comparable sales", zh: " · {n} 宗可比成交", ta: " · {n} ஒப்பீட்டு விற்பனைகள்", gu: " · {n} તુલનાત્મક વેચાણ", pa: " · {n} ਤੁਲਨਾਤਮਕ ਵਿਕਰੀਆਂ", hi: " · {n} तुलनात्मक बिक्री" },
  "deal.likelyRange": { en: " · likely range {lo}–{hi}", zh: " · 大致区间 {lo}–{hi}", ta: " · சாத்திய வரம்பு {lo}–{hi}", gu: " · સંભવિત મર્યાદા {lo}–{hi}", pa: " · ਸੰਭਾਵੀ ਹੱਦ {lo}–{hi}", hi: " · संभावित सीमा {lo}–{hi}" },
  "deal.confHigh": { en: "high", zh: "高", ta: "உயர்", gu: "ઊંચો", pa: "ਉੱਚ", hi: "उच्च" },
  "deal.confMedium": { en: "medium", zh: "中", ta: "நடுத்தர", gu: "મધ્યમ", pa: "ਮੱਧਮ", hi: "मध्यम" },
  "deal.confLow": { en: "low", zh: "低", ta: "குறைந்த", gu: "નીચો", pa: "ਘੱਟ", hi: "निम्न" },
  "deal.dOnMarket": { en: "{n}d on market", zh: "在售 {n} 天", ta: "சந்தையில் {n} நாட்கள்", gu: "બજારમાં {n} દિવસ", pa: "ਬਾਜ਼ਾਰ ਵਿੱਚ {n} ਦਿਨ", hi: "बाज़ार में {n} दिन" },
  "deal.newListing": { en: "new listing", zh: "新上架", ta: "புதிய பட்டியல்", gu: "નવી લિસ્ટિંગ", pa: "ਨਵੀਂ ਲਿਸਟਿੰਗ", hi: "नई लिस्टिंग" },
  "deal.yieldMeta": { en: " · {v}% yield", zh: " · 收益率 {v}%", ta: " · வருவாய் {v}%", gu: " · વળતર {v}%", pa: " · ਪ੍ਰਤੀਫਲ {v}%", hi: " · प्रतिफल {v}%" },
  "deal.buyScore": { en: "BUY SCORE", zh: "买入评分", ta: "வாங்கும் மதிப்பெண்", gu: "ખરીદ સ્કોર", pa: "ਖਰੀਦ ਸਕੋਰ", hi: "खरीद स्कोर" },
  "deal.underpriced": { en: "Underpriced", zh: "低于估值", ta: "குறைந்த விலை", gu: "ઓછી કિંમત", pa: "ਘੱਟ ਕੀਮਤ", hi: "कम कीमत" },
  "deal.subdividesInto": { en: "↗ Subdivides into {n} lots", zh: "↗ 可分割为 {n} 块地", ta: "↗ {n} மனைகளாகப் பிரிகிறது", gu: "↗ {n} લોટમાં વિભાજિત", pa: "↗ {n} ਲਾਟਾਂ ਵਿੱਚ ਵੰਡਿਆ", hi: "↗ {n} लॉट में विभाजित" },
  "deal.gain": { en: "{v} gain", zh: "{v} 收益", ta: "{v} லாபம்", gu: "{v} લાભ", pa: "{v} ਲਾਭ", hi: "{v} लाभ" },
  "deal.lotsPill": { en: "↗ {n} lots", zh: "↗ {n} 块地", ta: "↗ {n} மனைகள்", gu: "↗ {n} લોટ", pa: "↗ {n} ਲਾਟ", hi: "↗ {n} लॉट" },
  "deal.floorM2": { en: "{n} m²", zh: "{n} m²", ta: "{n} m²", gu: "{n} m²", pa: "{n} m²", hi: "{n} m²" },
  "deal.buyPrice": { en: "EST. BUY PRICE", zh: "预估建议买价", ta: "வாங்கும் விலை", gu: "ખરીદ ભાવ", pa: "ਖਰੀਦ ਮੁੱਲ", hi: "खरीद मूल्य" },
  "deal.estValue": { en: "EST. VALUE", zh: "估值", ta: "மதிப்பிடப்பட்ட மதிப்பு", gu: "અંદાજિત મૂલ્ય", pa: "ਅਨੁਮਾਨਿਤ ਮੁੱਲ", hi: "अनुमानित मूल्य" },
  "deal.belowValue": { en: "below value", zh: "低于估值", ta: "மதிப்புக்குக் கீழே", gu: "મૂલ્યથી ઓછું", pa: "ਮੁੱਲ ਤੋਂ ਘੱਟ", hi: "मूल्य से कम" },
  "deal.netGain": { en: "net gain", zh: "净收益", ta: "நிகர லாபம்", gu: "ચોખ્ખો લાભ", pa: "ਸ਼ੁੱਧ ਲਾਭ", hi: "शुद्ध लाभ" },
  "deal.noMatch": { en: "No listings match these filters.", zh: "没有符合条件的房源。", ta: "இந்த வடிகட்டிகளுக்கு எந்த பட்டியலும் பொருந்தவில்லை.", gu: "આ ફિલ્ટર સાથે કોઈ લિસ્ટિંગ મેળ ખાતી નથી.", pa: "ਇਹਨਾਂ ਫਿਲਟਰਾਂ ਨਾਲ ਕੋਈ ਲਿਸਟਿੰਗ ਮੇਲ ਨਹੀਂ ਖਾਂਦੀ।", hi: "इन फ़िल्टरों से कोई लिस्टिंग मेल नहीं खाती।" },
  "deal.loading": { en: "loading…", zh: "加载中…", ta: "ஏற்றுகிறது…", gu: "લોડ થઈ રહ્યું છે…", pa: "ਲੋਡ ਹੋ ਰਿਹਾ ਹੈ…", hi: "लोड हो रहा है…" },
  "deal.underpricedTitle": { en: "Underpriced listings", zh: "低于估值房源", ta: "குறைந்த விலை பட்டியல்கள்", gu: "ઓછી કિંમતવાળી લિસ્ટિંગ", pa: "ਘੱਟ ਕੀਮਤ ਵਾਲੀਆਂ ਲਿਸਟਿੰਗਾਂ", hi: "कम कीमत वाली लिस्टिंग" },
  "deal.underpricedBlurb": {
    en: "Priced below our estimated value, drawn from like-for-like sold comparables. Ranked so the sharpest margin sits at the top.",
    zh: "标价低于我们基于同类成交估算的价值，按差价从大到小排列。", ta: "எங்கள் மதிப்பிடப்பட்ட மதிப்பை விட குறைந்த விலையில், ஒத்த விற்பனையான சொத்துகளின் அடிப்படையில். மிகப்பெரிய வித்தியாசம் மேலே இருக்கும்படி வரிசைப்படுத்தப்பட்டது.", gu: "અમારા અંદાજિત મૂલ્યથી ઓછી કિંમતે, સમાન વેચાયેલી મિલકતોના આધારે. સૌથી મોટા તફાવતને ટોચ પર રાખવામાં આવ્યો છે.", pa: "ਸਾਡੇ ਅਨੁਮਾਨਿਤ ਮੁੱਲ ਤੋਂ ਘੱਟ ਕੀਮਤ ਉੱਤੇ, ਮਿਲਦੀਆਂ-ਜੁਲਦੀਆਂ ਵਿਕੀਆਂ ਜਾਇਦਾਦਾਂ ਦੇ ਆਧਾਰ 'ਤੇ। ਸਭ ਤੋਂ ਵੱਡੇ ਅੰਤਰ ਨੂੰ ਸਿਖਰ 'ਤੇ ਰੱਖਿਆ ਗਿਆ ਹੈ।", hi: "हमारे अनुमानित मूल्य से कम कीमत पर, समान बिकी संपत्तियों के आधार पर। सबसे बड़े अंतर को शीर्ष पर रखा गया है।",
  },
  "deal.subdividableTitle": { en: "Subdividable properties", zh: "可分割房产", ta: "உட்பிரிக்கக்கூடிய சொத்துகள்", gu: "ઉપવિભાજ્ય મિલકતો", pa: "ਉਪਵੰਡਯੋਗ ਜਾਇਦਾਦਾਂ", hi: "उपविभाज्य संपत्तियाँ" },
  "deal.subdividableBlurb": {
    en: "Land area exceeds the minimum lot size for the zone, and the split turns a profit at our default costings. Ranked by how many extra lots the site yields.",
    zh: "土地面积超过该区最小地块要求，且按默认成本测算可获利。按可增地块数排序。", ta: "நில பரப்பளவு மண்டலத்தின் குறைந்தபட்ச மனை அளவை விட அதிகம், மேலும் எங்கள் இயல்புநிலை செலவில் பிரிவு லாபகரமானது. மனையிலிருந்து உருவாகும் கூடுதல் மனைகளின் எண்ணிக்கைப்படி வரிசைப்படுத்தப்பட்டது.", gu: "જમીનનું ક્ષેત્રફળ ઝોનના લઘુતમ લોટ કદ કરતાં વધારે છે, અને અમારી ડિફોલ્ટ કિંમતે વિભાજન નફાકારક છે. પ્લોટમાંથી બનતા વધારાના લોટની સંખ્યા પ્રમાણે ક્રમબદ્ધ.", pa: "ਜ਼ਮੀਨ ਦਾ ਖੇਤਰ ਜ਼ੋਨ ਦੇ ਘੱਟੋ-ਘੱਟ ਲਾਟ ਆਕਾਰ ਤੋਂ ਵੱਧ ਹੈ, ਅਤੇ ਸਾਡੀ ਡਿਫ਼ਾਲਟ ਲਾਗਤ 'ਤੇ ਵੰਡ ਲਾਭਦਾਇਕ ਹੈ। ਪਲਾਟ ਤੋਂ ਬਣਨ ਵਾਲੀਆਂ ਵਾਧੂ ਲਾਟਾਂ ਦੀ ਗਿਣਤੀ ਅਨੁਸਾਰ ਕ੍ਰਮਬੱਧ।", hi: "भूमि क्षेत्र ज़ोन के न्यूनतम लॉट आकार से अधिक है, और हमारी डिफ़ॉल्ट लागत पर विभाजन लाभदायक है। प्लॉट से बनने वाले अतिरिक्त लॉट की संख्या के अनुसार क्रमित।",
  },
  "deal.subdividableWarn": {
    en: "⚠ Screening only. Flags land that could support subdivision on lot size and zone. Overlays, services and council consent decide the real outcome — always verify with council.",
    zh: "⚠ 仅供初筛。仅依据地块面积与分区标记潜在可分割地。覆盖层、市政配套与议会许可决定最终结果——请务必向议会核实。", ta: "⚠ ஆரம்ப சோதனை மட்டுமே. மனை அளவு மற்றும் மண்டலத்தின் அடிப்படையில் உட்பிரிக்கக்கூடிய நிலத்தைக் குறிக்கிறது. மேலடுக்குகள், வசதிகள் மற்றும் கவுன்சில் அனுமதியே உண்மையான முடிவை தீர்மானிக்கின்றன — எப்போதும் கவுன்சிலிடம் உறுதிப்படுத்துங்கள்.", gu: "⚠ માત્ર પ્રારંભિક તપાસ. લોટ કદ અને ઝોનના આધારે ઉપવિભાજ્ય જમીનને ચિહ્નિત કરે છે. ઓવરલે, સુવિધાઓ અને કાઉન્સિલ મંજૂરી જ વાસ્તવિક પરિણામ નક્કી કરે છે — હંમેશા કાઉન્સિલ પાસેથી ખાતરી કરો.", pa: "⚠ ਸਿਰਫ਼ ਸ਼ੁਰੂਆਤੀ ਜਾਂਚ। ਲਾਟ ਆਕਾਰ ਅਤੇ ਜ਼ੋਨ ਦੇ ਆਧਾਰ 'ਤੇ ਉਪਵੰਡਯੋਗ ਜ਼ਮੀਨ ਨੂੰ ਚਿੰਨ੍ਹਿਤ ਕਰਦਾ ਹੈ। ਓਵਰਲੇ, ਸਹੂਲਤਾਂ ਅਤੇ ਕੌਂਸਲ ਮਨਜ਼ੂਰੀ ਹੀ ਅਸਲ ਨਤੀਜਾ ਤੈਅ ਕਰਦੇ ਹਨ — ਹਮੇਸ਼ਾ ਕੌਂਸਲ ਤੋਂ ਪੁਸ਼ਟੀ ਕਰੋ।", hi: "⚠ केवल प्रारंभिक जाँच। लॉट आकार और ज़ोन के आधार पर उपविभाजन योग्य भूमि को चिह्नित करता है। ओवरले, सुविधाएँ और काउंसिल अनुमति ही वास्तविक परिणाम तय करती हैं — हमेशा काउंसिल से पुष्टि करें।",
  },

  // --- ask ollie ---
  "ask.eyebrow": { en: "ANALYST", zh: "分析师", ta: "பகுப்பாய்வாளர்", gu: "વિશ્લેષક", pa: "ਵਿਸ਼ਲੇਸ਼ਕ", hi: "विश्लेषक" },
  "ask.title": { en: "Ask Ollie", zh: "问 Ollie", ta: "Ollie இடம் கேளுங்கள்", gu: "Ollie ને પૂછો", pa: "Ollie ਤੋਂ ਪੁੱਛੋ", hi: "Ollie से पूछें" },
  "ask.blurb": {
    en: "Any question about the data, in plain English. Every figure comes from a live query against your listings and sold records — never from the model's memory.",
    zh: "用日常语言询问任何关于数据的问题。每个数字都来自对房源与成交记录的实时查询，绝不出自模型记忆。", ta: "தரவு பற்றிய எந்த கேள்வியும், எளிய மொழியில். ஒவ்வொரு எண்ணும் உங்கள் பட்டியல்கள் மற்றும் விற்பனை பதிவுகளின் நேரடி வினவலிலிருந்து வருகிறது — ஒருபோதும் மாதிரியின் நினைவிலிருந்து அல்ல.", gu: "ડેટા વિશે કોઈપણ પ્રશ્ન, સરળ ભાષામાં. દરેક આંકડો તમારી લિસ્ટિંગ અને વેચાણ રેકોર્ડ પર લાઇવ ક્વેરીથી આવે છે — ક્યારેય મોડેલની યાદથી નહીં.", pa: "ਡੇਟਾ ਬਾਰੇ ਕੋਈ ਵੀ ਸਵਾਲ, ਸਧਾਰਨ ਭਾਸ਼ਾ ਵਿੱਚ। ਹਰ ਅੰਕੜਾ ਤੁਹਾਡੀਆਂ ਲਿਸਟਿੰਗਾਂ ਅਤੇ ਵਿਕਰੀ ਰਿਕਾਰਡਾਂ 'ਤੇ ਲਾਈਵ ਕਿਊਰੀ ਤੋਂ ਆਉਂਦਾ ਹੈ — ਕਦੇ ਵੀ ਮਾਡਲ ਦੀ ਯਾਦ ਤੋਂ ਨਹੀਂ।", hi: "डेटा के बारे में कोई भी सवाल, सरल भाषा में। हर आँकड़ा आपकी लिस्टिंग और बिक्री रिकॉर्ड पर लाइव क्वेरी से आता है — कभी भी मॉडल की स्मृति से नहीं।",
  },
  "ask.provider": { en: "PROVIDER", zh: "服务商", ta: "வழங்குநர்", gu: "પ્રોવાઇડર", pa: "ਪ੍ਰੋਵਾਈਡਰ", hi: "प्रोवाइडर" },
  "ask.connectTitle": { en: "Connect an API key to start", zh: "添加 API 密钥以开始", ta: "தொடங்க ஒரு API விசையைச் சேர்க்கவும்", gu: "શરૂ કરવા માટે એક API કી ઉમેરો", pa: "ਸ਼ੁਰੂ ਕਰਨ ਲਈ ਇੱਕ API ਕੁੰਜੀ ਜੋੜੋ", hi: "शुरू करने के लिए एक API कुंजी जोड़ें" },
  "ask.connectBody": {
    en: "Bring your own Claude or OpenAI key. It's stored encrypted, used only for your own questions, and billed to your provider account.",
    zh: "使用你自己的 Claude 或 OpenAI 密钥。加密存储，仅用于你自己的提问，费用计入你的服务商账户。", ta: "உங்கள் சொந்த Claude அல்லது OpenAI விசையைக் கொண்டு வாருங்கள். இது குறியாக்கம் செய்யப்பட்டு சேமிக்கப்படுகிறது, உங்கள் கேள்விகளுக்கு மட்டுமே பயன்படுத்தப்படுகிறது, உங்கள் வழங்குநர் கணக்கில் கட்டணமிடப்படுகிறது.", gu: "તમારી પોતાની Claude કે OpenAI કી લાવો. તે એન્ક્રિપ્ટેડ સ્વરૂપે સંગ્રહાય છે, માત્ર તમારા પ્રશ્નો માટે વપરાય છે, અને તમારા પ્રોવાઇડર ખાતામાં બિલ થાય છે.", pa: "ਆਪਣੀ ਖੁਦ ਦੀ Claude ਜਾਂ OpenAI ਕੁੰਜੀ ਲਿਆਓ। ਇਹ ਏਨਕ੍ਰਿਪਟਿਡ ਰੂਪ ਵਿੱਚ ਸੰਭਾਲੀ ਜਾਂਦੀ ਹੈ, ਸਿਰਫ਼ ਤੁਹਾਡੇ ਸਵਾਲਾਂ ਲਈ ਵਰਤੀ ਜਾਂਦੀ ਹੈ, ਅਤੇ ਤੁਹਾਡੇ ਪ੍ਰੋਵਾਈਡਰ ਖਾਤੇ ਵਿੱਚ ਬਿਲ ਹੁੰਦੀ ਹੈ।", hi: "अपनी खुद की Claude या OpenAI कुंजी लाएँ। यह एन्क्रिप्टेड रूप में संग्रहीत होती है, केवल आपके सवालों के लिए उपयोग होती है, और आपके प्रोवाइडर खाते में बिल होती है।",
  },
  "ask.addKey": { en: "Add key in Settings →", zh: "在设置中添加密钥 →", ta: "அமைப்புகளில் விசை சேர்க்கவும் →", gu: "સેટિંગ્સમાં કી ઉમેરો →", pa: "ਸੈਟਿੰਗਜ਼ ਵਿੱਚ ਕੁੰਜੀ ਜੋੜੋ →", hi: "सेटिंग्स में कुंजी जोड़ें →" },
  "ask.tryThese": { en: "TRY ONE OF THESE", zh: "试试这些", ta: "இவற்றில் ஒன்றை முயற்சிக்கவும்", gu: "આમાંથી એક અજમાવો", pa: "ਇਹਨਾਂ ਵਿੱਚੋਂ ਇੱਕ ਅਜ਼ਮਾਓ", hi: "इनमें से एक आज़माएँ" },
  "ask.placeholder": { en: "Ask about the data…", zh: "询问数据…", ta: "தரவு பற்றி கேளுங்கள்…", gu: "ડેટા વિશે પૂછો…", pa: "ਡੇਟਾ ਬਾਰੇ ਪੁੱਛੋ…", hi: "डेटा के बारे में पूछें…" },
  "ask.placeholderNoKey": { en: "Add an API key in Settings first…", zh: "请先在设置中添加 API 密钥…", ta: "முதலில் அமைப்புகளில் ஒரு API விசையைச் சேர்க்கவும்…", gu: "પહેલા સેટિંગ્સમાં એક API કી ઉમેરો…", pa: "ਪਹਿਲਾਂ ਸੈਟਿੰਗਜ਼ ਵਿੱਚ ਇੱਕ API ਕੁੰਜੀ ਜੋੜੋ…", hi: "पहले सेटिंग्स में एक API कुंजी जोड़ें…" },
  "ask.send": { en: "Ask", zh: "发送", ta: "கேள்", gu: "પૂછો", pa: "ਪੁੱਛੋ", hi: "पूछें" },
  "ask.clear": { en: "Clear", zh: "清空", ta: "அழி", gu: "સાફ કરો", pa: "ਸਾਫ਼ ਕਰੋ", hi: "साफ़ करें" },
  "ask.querying": { en: "querying the data…", zh: "正在查询数据…", ta: "தரவு வினவப்படுகிறது…", gu: "ડેટા ક્વેરી થઈ રહ્યો છે…", pa: "ਡੇਟਾ ਕਿਊਰੀ ਹੋ ਰਿਹਾ ਹੈ…", hi: "डेटा क्वेरी हो रहा है…" },
  "ask.showQueries": { en: "SHOW THE {n} QUERIES BEHIND THIS", zh: "查看背后的 {n} 条查询", ta: "இதன் பின்னுள்ள {n} வினவல்களைக் காட்டு", gu: "આની પાછળની {n} ક્વેરી બતાવો", pa: "ਇਸ ਦੇ ਪਿੱਛੇ ਦੀਆਂ {n} ਕਿਊਰੀਆਂ ਦਿਖਾਓ", hi: "इसके पीछे की {n} क्वेरी दिखाएँ" },
  "ask.hideQueries": { en: "HIDE THE {n} QUERIES BEHIND THIS", zh: "隐藏背后的 {n} 条查询", ta: "இதன் பின்னுள்ள {n} வினவல்களை மறை", gu: "આની પાછળની {n} ક્વેરી છુપાવો", pa: "ਇਸ ਦੇ ਪਿੱਛੇ ਦੀਆਂ {n} ਕਿਊਰੀਆਂ ਲੁਕਾਓ", hi: "इसके पीछे की {n} क्वेरी छिपाएँ" },
  "ask.audit": {
    en: "The assistant can only report what a query returns. If it can't answer something it will say so rather than estimate. Open the query toggle under any answer to see exactly what it ran.",
    zh: "助手只能报告查询返回的内容。若无法回答，它会如实说明而非估算。展开任一回答下方的查询即可查看其实际执行的语句。", ta: "உதவியாளர் வினவல் திருப்பியதை மட்டுமே தெரிவிக்க முடியும். ஏதேனும் தெரியாவிட்டால் யூகிப்பதற்குப் பதிலாக அப்படிச் சொல்லும். எந்த பதிலின் கீழும் வினவல் நிலைமாற்றியைத் திறந்து அது உண்மையில் எதை இயக்கியது என்பதைப் பாருங்கள்.", gu: "સહાયક માત્ર તે જ કહી શકે જે ક્વેરી પરત કરે છે. જો તે કંઈ ન જાણતો હોય તો અંદાજ લગાવવાને બદલે એમ કહી દેશે. કોઈપણ જવાબ નીચે ક્વેરી ટૉગલ ખોલીને જુઓ કે તેણે ખરેખર શું ચલાવ્યું.", pa: "ਸਹਾਇਕ ਸਿਰਫ਼ ਉਹੀ ਦੱਸ ਸਕਦਾ ਹੈ ਜੋ ਕਿਊਰੀ ਵਾਪਸ ਕਰਦੀ ਹੈ। ਜੇ ਉਹ ਕੁਝ ਨਹੀਂ ਜਾਣਦਾ ਤਾਂ ਅੰਦਾਜ਼ਾ ਲਾਉਣ ਦੀ ਬਜਾਏ ਇਹ ਕਹਿ ਦੇਵੇਗਾ। ਕਿਸੇ ਵੀ ਜਵਾਬ ਹੇਠ ਕਿਊਰੀ ਟੌਗਲ ਖੋਲ੍ਹ ਕੇ ਵੇਖੋ ਕਿ ਉਸ ਨੇ ਅਸਲ ਵਿੱਚ ਕੀ ਚਲਾਇਆ।", hi: "सहायक केवल वही बता सकता है जो क्वेरी लौटाती है। अगर वह कुछ नहीं जानता तो अनुमान लगाने के बजाय ऐसा कह देगा। किसी भी उत्तर के नीचे क्वेरी टॉगल खोलकर देखें कि उसने वास्तव में क्या चलाया।",
  },

  // --- property detail ---
  "prop.buyPrice": { en: "EST. BUY PRICE", zh: "预估建议买价", ta: "வாங்கும் விலை", gu: "ખરીદ ભાવ", pa: "ਖਰੀਦ ਮੁੱਲ", hi: "खरीद मूल्य" },
  "prop.ourValuation": { en: "OUR VALUATION", zh: "我们的估值", ta: "எங்கள் மதிப்பீடு", gu: "અમારું મૂલ્યાંકન", pa: "ਸਾਡਾ ਮੁੱਲਾਂਕਣ", hi: "हमारा मूल्यांकन" },
  "prop.subdivision": { en: "SUBDIVISION", zh: "土地分割", ta: "உட்பிரிவு", gu: "ઉપવિભાજન", pa: "ਉਪਵੰਡ", hi: "उपविभाजन" },
  "prop.buyScore": { en: "BUY SCORE", zh: "买入评分", ta: "வாங்கும் மதிப்பெண்", gu: "ખરીદ સ્કોર", pa: "ਖਰੀਦ ਸਕੋਰ", hi: "खरीद स्कोर" },
  "prop.notFlagged": { en: "Not flagged", zh: "未标记", ta: "குறிக்கப்படவில்லை", gu: "ચિહ્નિત નથી", pa: "ਚਿੰਨ੍ਹਿਤ ਨਹੀਂ", hi: "चिह्नित नहीं" },
  "prop.zoneUnknown": { en: "Zone unknown", zh: "分区未知", ta: "மண்டலம் தெரியவில்லை", gu: "ઝોન અજ્ઞાત", pa: "ਜ਼ੋਨ ਅਗਿਆਤ", hi: "ज़ोन अज्ञात" },
  "prop.noFlags": { en: "No flags triggered", zh: "无触发标记", ta: "எந்த குறியும் செயல்படவில்லை", gu: "કોઈ ચિહ્ન સક્રિય નથી", pa: "ਕੋਈ ਚਿੰਨ੍ਹ ਸਰਗਰਮ ਨਹੀਂ", hi: "कोई चिह्न सक्रिय नहीं" },
  "prop.premiumOffListing": { en: "Premium — priced off listing", zh: "高端——按标价定价", ta: "பிரீமியம் — பட்டியல் விலையில்", gu: "પ્રીમિયમ — યાદી કિંમતે", pa: "ਪ੍ਰੀਮੀਅਮ — ਸੂਚੀ ਮੁੱਲ 'ਤੇ", hi: "प्रीमियम — सूची मूल्य पर" },
  "prop.vsCvSuffix": { en: "vs CV", zh: "对比政府估价", ta: "CV உடன் ஒப்பிடுகையில்", gu: "CV સામે", pa: "CV ਦੇ ਮੁਕਾਬਲੇ", hi: "CV की तुलना में" },
  "prop.keySpecs": { en: "Key specs", zh: "核心参数", ta: "முக்கிய விவரங்கள்", gu: "મુખ્ય વિગતો", pa: "ਮੁੱਖ ਵੇਰਵੇ", hi: "मुख्य विवरण" },
  "prop.beds": { en: "BEDS", zh: "卧室", ta: "படுக்கையறை", gu: "બેડરૂમ", pa: "ਬੈੱਡਰੂਮ", hi: "बेडरूम" },
  "prop.baths": { en: "BATHS", zh: "浴室", ta: "குளியலறை", gu: "બાથરૂમ", pa: "ਬਾਥਰੂਮ", hi: "बाथरूम" },
  "prop.cars": { en: "CARS", zh: "车位", ta: "கார்", gu: "કાર", pa: "ਕਾਰ", hi: "कार" },
  "prop.floor": { en: "FLOOR", zh: "建筑面积", ta: "தளம்", gu: "ફ્લોર", pa: "ਫ਼ਲੋਰ", hi: "फ़्लोर" },
  "prop.land": { en: "LAND", zh: "土地", ta: "நிலம்", gu: "જમીન", pa: "ਜ਼ਮੀਨ", hi: "भूमि" },
  "prop.predDom": { en: "PRED. DOM", zh: "预计售期", ta: "மதி. விற்பனை நாட்கள்", gu: "અનુ. વેચાણ દિવસ", pa: "ਅਨੁ. ਵਿਕਰੀ ਦਿਨ", hi: "अनु. बिक्री दिन" },
  "prop.pricingAnalysis": { en: "Pricing analysis", zh: "定价分析", ta: "விலை பகுப்பாய்வு", gu: "કિંમત વિશ્લેષણ", pa: "ਮੁੱਲ ਵਿਸ਼ਲੇਸ਼ਣ", hi: "मूल्य विश्लेषण" },
  "prop.listPrice": { en: "List price", zh: "标价", ta: "பட்டியல் விலை", gu: "યાદી કિંમત", pa: "ਸੂਚੀ ਮੁੱਲ", hi: "सूची मूल्य" },
  "prop.buyPriceRow": { en: "Est. buy price", zh: "预估建议买价", ta: "வாங்கும் விலை", gu: "ખરીદ ભાવ", pa: "ਖਰੀਦ ਮੁੱਲ", hi: "खरीद मूल्य" },
  "prop.ourValuationRow": { en: "Our valuation", zh: "我们的估值", ta: "எங்கள் மதிப்பீடு", gu: "અમારું મૂલ્યાંકન", pa: "ਸਾਡਾ ਮੁੱਲਾਂਕਣ", hi: "हमारा मूल्यांकन" },
  "prop.premiumPriced": { en: "Premium (priced off listing)", zh: "高端（按标价定价）", ta: "பிரீமியம் (பட்டியல் விலையில்)", gu: "પ્રીમિયમ (યાદી કિંમતે)", pa: "ਪ੍ਰੀਮੀਅਮ (ਸੂਚੀ ਮੁੱਲ 'ਤੇ)", hi: "प्रीमियम (सूची मूल्य पर)" },
  "prop.vsCv": { en: "vs CV", zh: "对比政府估价", ta: "CV உடன் ஒப்பிடுகையில்", gu: "CV સામે", pa: "CV ਦੇ ਮੁਕਾਬਲੇ", hi: "CV की तुलना में" },
  "prop.predictedDays": { en: "Predicted days to sell", zh: "预计售出天数", ta: "மதிப்பிடப்பட்ட விற்பனை நாட்கள்", gu: "અંદાજિત વેચાણ દિવસ", pa: "ਅਨੁਮਾਨਿਤ ਵਿਕਰੀ ਦਿਨ", hi: "अनुमानित बिक्री दिन" },
  "prop.marginVsList": { en: "Margin vs list price", zh: "对比标价差价", ta: "பட்டியல் விலைக்கு எதிராக வித்தியாசம்", gu: "યાદી કિંમત સામે તફાવત", pa: "ਸੂਚੀ ਮੁੱਲ ਦੇ ਮੁਕਾਬਲੇ ਅੰਤਰ", hi: "सूची मूल्य की तुलना में अंतर" },
  "prop.confidence": { en: "Confidence", zh: "置信度", ta: "நம்பிக்கை நிலை", gu: "વિશ્વાસ સ્તર", pa: "ਭਰੋਸਾ ਪੱਧਰ", hi: "विश्वास स्तर" },
  "prop.otherViews": { en: "OTHER MARKET VIEWS", zh: "其他市场观点", ta: "பிற சந்தை பார்வைகள்", gu: "અન્ય બજાર દૃષ્ટિકોણ", pa: "ਹੋਰ ਬਾਜ਼ਾਰ ਦ੍ਰਿਸ਼", hi: "अन्य बाज़ार दृष्टिकोण" },
  "prop.thirdParty": { en: "Third-party estimate", zh: "第三方估值", ta: "மூன்றாம் தரப்பு மதிப்பீடு", gu: "તૃતીય-પક્ષ અંદાજ", pa: "ਤੀਜੀ-ਧਿਰ ਅਨੁਮਾਨ", hi: "तृतीय-पक्ष अनुमान" },
  "prop.councilCv": { en: "Council CV", zh: "政府估价 (CV)", ta: "கவுன்சில் CV", gu: "કાઉન્સિલ CV", pa: "ਕੌਂਸਲ CV", hi: "काउंसिल CV" },
  "prop.compareTitle": { en: "ESTIMATES COMPARED", zh: "估值对比" },
  "prop.srcOllie": { en: "Ollie", zh: "Ollie" },
  "prop.srcHougarden": { en: "Hougarden / OneRoof", zh: "Hougarden / OneRoof" },
  "prop.srcCouncil": { en: "Council CV", zh: "政府估价" },
  "prop.srcAsking": { en: "Listed at", zh: "挂牌价" },
  "prop.srcHomes": { en: "homes.co.nz", zh: "homes.co.nz" },
  "prop.srcRealestate": { en: "realestate.co.nz", zh: "realestate.co.nz" },
  "prop.srcPropertyValue": { en: "propertyvalue.co.nz", zh: "propertyvalue.co.nz" },
  "prop.srcTrademe": { en: "trademe.co.nz", zh: "trademe.co.nz" },
  "prop.srcPending": { en: "coming soon", zh: "即将上线" },
  "prop.pvCheckTitle": { en: "Data check vs CoreLogic", zh: "与 CoreLogic 数据核对" },
  "prop.pvOursTheirs": { en: "ours {ours} · CoreLogic {theirs}", zh: "我们 {ours} · CoreLogic {theirs}" },
  "prop.pvCheckNote": { en: "Our listing data differs from CoreLogic (propertyvalue.co.nz) on these — worth a check before trusting derived figures.", zh: "我们的房源数据在这些项目上与 CoreLogic（propertyvalue.co.nz）不一致——在采信衍生数据前值得核实。" },
  "prop.pvField.land_area_m2": { en: "Land area", zh: "土地面积" },
  "prop.pvField.floor_area_m2": { en: "Floor area", zh: "建筑面积" },
  "prop.pvField.cv": { en: "Council CV", zh: "政府估价" },
  "prop.pvField.beds": { en: "Bedrooms", zh: "卧室" },
  "prop.pvField.baths": { en: "Bathrooms", zh: "浴室" },
  "prop.pvField.zoning": { en: "Zoning", zh: "分区" },
  "prop.pvGapsIntro": { en: "CoreLogic also fills gaps we're missing —", zh: "CoreLogic 还补充了我们缺失的数据——" },
  "prop.pvLastSale": { en: "Last sold (CoreLogic): {price} on {date}.", zh: "上次成交（CoreLogic）：{date} 成交价 {price}。" },
  "prop.outlierBelow": { en: "{pct}% below ours", zh: "比我们低 {pct}%" },
  "prop.outlierAbove": { en: "{pct}% above ours", zh: "比我们高 {pct}%" },
  "prop.outlierNote": { en: "{name} sits well outside the other estimates — shown for context, not used in our numbers.", zh: "{name} 明显偏离其他估值——仅供参考，不参与我们的计算。" },
  "prop.outlierWhyCv": { en: "Here, homes.co.nz is valuing off a council CV of {theirs}, whereas the current CV is {ours} — their figure hasn't caught up.", zh: "此处 homes.co.nz 使用的政府估价为 {theirs}，而当前政府估价为 {ours}——其数据尚未更新。" },
  "prop.compareSpread": { en: "Views span {lo}–{hi}.", zh: "各估值区间 {lo}–{hi}。" },
  "prop.contextNote": { en: "Shown for context. Neither figure feeds the valuation, the margin or the buy score.", zh: "仅供参考。两项数据均不参与估值、差价或买入评分。", ta: "சூழலுக்காகக் காட்டப்பட்டது. எந்த எண்ணும் மதிப்பீடு, வித்தியாசம் அல்லது வாங்கும் மதிப்பெண்ணில் சேர்க்கப்படவில்லை.", gu: "સંદર્ભ માટે બતાવ્યું. કોઈ આંકડો મૂલ્યાંકન, તફાવત કે ખરીદ સ્કોરમાં સામેલ થતો નથી.", pa: "ਸੰਦਰਭ ਲਈ ਦਿਖਾਇਆ ਗਿਆ। ਕੋਈ ਵੀ ਅੰਕੜਾ ਮੁੱਲਾਂਕਣ, ਅੰਤਰ ਜਾਂ ਖਰੀਦ ਸਕੋਰ ਵਿੱਚ ਸ਼ਾਮਲ ਨਹੀਂ ਹੁੰਦਾ।", hi: "संदर्भ के लिए दिखाया गया। कोई भी आँकड़ा मूल्यांकन, अंतर या खरीद स्कोर में शामिल नहीं होता।" },
  "prop.buyBasedOn": { en: "Buy price based on", zh: "建议买价基于", ta: "வாங்கும் விலை அடிப்படையானது", gu: "ખરીદ ભાવ આધારિત છે", pa: "ਖਰੀਦ ਮੁੱਲ ਆਧਾਰਿਤ ਹੈ", hi: "खरीद मूल्य आधारित है" },
  "prop.recentComps": { en: "recent comparable sale", zh: "近期可比成交", ta: "சமீபத்திய ஒப்பீட்டு விற்பனை", gu: "તાજેતરની તુલનાત્મક વેચાણ", pa: "ਹਾਲੀਆ ਤੁਲਨਾਤਮਕ ਵਿਕਰੀ", hi: "हाल की तुलनात्मक बिक्री" },
  "prop.recentCompsPl": { en: "recent comparable sales nearby", zh: "近期周边可比成交", ta: "அருகிலுள்ள சமீபத்திய ஒப்பீட்டு விற்பனைகள்", gu: "નજીકની તાજેતરની તુલનાત્મક વેચાણ", pa: "ਨੇੜਲੀਆਂ ਹਾਲੀਆ ਤੁਲਨਾਤਮਕ ਵਿਕਰੀਆਂ", hi: "पास की हाल की तुलनात्मक बिक्री" },
  "prop.noCloseComps": { en: "our valuation (no close comparable sales found)", zh: "我们的估值（未找到相近成交）", ta: "எங்கள் மதிப்பீடு (அருகில் ஒப்பீட்டு விற்பனை எதுவும் கிடைக்கவில்லை)", gu: "અમારું મૂલ્યાંકન (કોઈ નજીકની તુલનાત્મક વેચાણ મળી નથી)", pa: "ਸਾਡਾ ਮੁੱਲਾਂਕਣ (ਕੋਈ ਨੇੜਲੀ ਤੁਲਨਾਤਮਕ ਵਿਕਰੀ ਨਹੀਂ ਮਿਲੀ)", hi: "हमारा मूल्यांकन (कोई निकट तुलनात्मक बिक्री नहीं मिली)" },
  "prop.likelyRange": { en: "likely range", zh: "预计区间", ta: "சாத்திய வரம்பு", gu: "સંભવિત મર્યાદા", pa: "ਸੰਭਾਵੀ ਹੱਦ", hi: "संभावित सीमा" },
  "prop.cashflow": { en: "Cashflow estimate", zh: "现金流估算", ta: "பணப்பாய்வு மதிப்பீடு", gu: "કૅશફ્લો અંદાજ", pa: "ਕੈਸ਼ਫਲੋ ਅਨੁਮਾਨ", hi: "कैशफ़्लो अनुमान" },
  "prop.weeklyRent": { en: "Est. weekly rent", zh: "预计周租", ta: "மதி. வாராந்திர வாடகை", gu: "અનુ. સાપ્તાહિક ભાડું", pa: "ਅਨੁ. ਹਫ਼ਤਾਵਾਰ ਕਿਰਾਇਆ", hi: "अनु. साप्ताहिक किराया" },
  "prop.grossYield": { en: "Est. gross yield", zh: "预计毛收益率", ta: "மதி. மொத்த வருவாய்", gu: "અનુ. કુલ વળતર", pa: "ਅਨੁ. ਕੁੱਲ ਪ੍ਰਤੀਫਲ", hi: "अनु. सकल प्रतिफल" },
  "prop.annualCashflow": { en: "Annual cashflow", zh: "年现金流", ta: "வருடாந்திர பணப்பாய்வு", gu: "વાર્ષિક કૅશફ્લો", pa: "ਸਾਲਾਨਾ ਕੈਸ਼ਫਲੋ", hi: "वार्षिक कैशफ़्लो" },
  "prop.cashOnCash": { en: "Cash-on-cash return", zh: "现金回报率", ta: "கேஷ்-ஆன்-கேஷ் வருவாய்", gu: "કૅશ-ઓન-કૅશ વળતર", pa: "ਕੈਸ਼-ਆਨ-ਕੈਸ਼ ਰਿਟਰਨ", hi: "कैश-ऑन-कैश रिटर्न" },
  "prop.breakeven": { en: "Deposit to break even", zh: "保本首付比例", ta: "சமநிலைக்கு டெபாசிட்", gu: "સરભર માટે ડિપોઝિટ", pa: "ਬਰਾਬਰੀ ਲਈ ਡਿਪਾਜ਼ਿਟ", hi: "बराबरी के लिए डिपॉज़िट" },
  "prop.cashflowNote": { en: "Assumes a 30% deposit, 6.75% interest, 30-yr term, 29% opex.", zh: "假设 30% 首付、6.75% 利率、30 年期、29% 运营成本。", ta: "30% டெபாசிட், 6.75% வட்டி, 30-ஆண்டு காலம், 29% இயக்கச் செலவு எனக் கருதி.", gu: "30% ડિપોઝિટ, 6.75% વ્યાજ, 30-વર્ષ મુદત, 29% સંચાલન ખર્ચ ધારીને.", pa: "30% ਡਿਪਾਜ਼ਿਟ, 6.75% ਵਿਆਜ, 30-ਸਾਲ ਮਿਆਦ, 29% ਸੰਚਾਲਨ ਲਾਗਤ ਮੰਨ ਕੇ।", hi: "30% डिपॉज़िट, 6.75% ब्याज, 30-वर्ष अवधि, 29% परिचालन लागत मानकर।" },
  "prop.features": { en: "Features & details", zh: "特征与详情", ta: "அம்சங்கள் மற்றும் விவரங்கள்", gu: "વિશેષતાઓ અને વિગતો", pa: "ਵਿਸ਼ੇਸ਼ਤਾਵਾਂ ਅਤੇ ਵੇਰਵੇ", hi: "विशेषताएँ और विवरण" },
  "prop.yearBuilt": { en: "Year built", zh: "建成年份", ta: "கட்டப்பட்ட ஆண்டு", gu: "બાંધકામ વર્ષ", pa: "ਬਣਨ ਦਾ ਸਾਲ", hi: "निर्माण वर्ष" },
  "prop.storeys": { en: "Storeys", zh: "楼层数", ta: "மாடிகள்", gu: "માળ", pa: "ਮੰਜ਼ਿਲਾਂ", hi: "मंज़िलें" },
  "prop.coveredParking": { en: "Covered parking", zh: "有盖车位", ta: "மூடிய பார்க்கிங்", gu: "ઢાંકેલ પાર્કિંગ", pa: "ਢਕੀ ਪਾਰਕਿੰਗ", hi: "ढकी पार्किंग" },
  "prop.swimmingPool": { en: "Swimming pool", zh: "游泳池", ta: "நீச்சல் குளம்", gu: "સ્વિમિંગ પૂલ", pa: "ਸਵੀਮਿੰਗ ਪੂਲ", hi: "स्विमिंग पूल" },
  "prop.landContour": { en: "Land contour", zh: "地形", ta: "நில சாய்வு", gu: "જમીનનો ઢાળ", pa: "ਜ਼ਮੀਨ ਦੀ ਢਲਾਣ", hi: "भूमि की ढलान" },
  "prop.titleType": { en: "Title type", zh: "产权类型", ta: "உரிமை வகை", gu: "ટાઇટલ પ્રકાર", pa: "ਟਾਈਟਲ ਕਿਸਮ", hi: "टाइटल प्रकार" },
  "prop.zoning": { en: "Zoning", zh: "分区", ta: "மண்டலப்படுத்தல்", gu: "ઝોનિંગ", pa: "ਜ਼ੋਨਿੰਗ", hi: "ज़ोनिंग" },
  "prop.subdivFeasibility": { en: "Subdivision feasibility", zh: "分割可行性", ta: "உட்பிரிவு சாத்தியம்", gu: "ઉપવિભાજન સંભાવના", pa: "ਉਪਵੰਡ ਸੰਭਾਵਨਾ", hi: "उपविभाजन व्यवहार्यता" },
  "prop.zone": { en: "Zone", zh: "分区", ta: "மண்டலம்", gu: "ઝોન", pa: "ਜ਼ੋਨ", hi: "ज़ोन" },
  "prop.minLot": { en: "Min lot size", zh: "最小地块", ta: "குறைந்தபட்ச மனை அளவு", gu: "લઘુતમ લોટ કદ", pa: "ਘੱਟੋ-ਘੱਟ ਲਾਟ ਆਕਾਰ", hi: "न्यूनतम लॉट आकार" },
  "prop.additionalLots": { en: "Additional lots", zh: "可增地块", ta: "கூடுதல் மனைகள்", gu: "વધારાના લોટ", pa: "ਵਾਧੂ ਲਾਟ", hi: "अतिरिक्त लॉट" },
  "prop.totalSubdiv": { en: "Total subdivided value", zh: "分割后总价值", ta: "மொத்த உட்பிரிவு மதிப்பு", gu: "કુલ ઉપવિભાજિત મૂલ્ય", pa: "ਕੁੱਲ ਉਪਵੰਡ ਮੁੱਲ", hi: "कुल उपविभाजित मूल्य" },
  "prop.bestStrategy": { en: "Best strategy", zh: "最优策略", ta: "சிறந்த உத்தி", gu: "શ્રેષ્ઠ વ્યૂહરચના", pa: "ਸਭ ਤੋਂ ਵਧੀਆ ਰਣਨੀਤੀ", hi: "सर्वोत्तम रणनीति" },
  "prop.bestNetGain": { en: "Best net gain", zh: "最优净收益", ta: "சிறந்த நிகர லாபம்", gu: "શ્રેષ્ઠ ચોખ્ખો લાભ", pa: "ਸਭ ਤੋਂ ਵਧੀਆ ਸ਼ੁੱਧ ਲਾਭ", hi: "सर्वोत्तम शुद्ध लाभ" },
  "prop.subdivWarn": { en: "⚠ Screening only — verify with council before relying on these figures.", zh: "⚠ 仅供初筛——采用前请向议会核实。", ta: "⚠ ஆரம்ப சோதனை மட்டுமே — இந்த எண்களை நம்பும் முன் கவுன்சிலிடம் உறுதிப்படுத்துங்கள்.", gu: "⚠ માત્ર પ્રારંભિક તપાસ — આ આંકડા પર આધાર રાખતા પહેલા કાઉન્સિલ પાસેથી ખાતરી કરો.", pa: "⚠ ਸਿਰਫ਼ ਸ਼ੁਰੂਆਤੀ ਜਾਂਚ — ਇਹਨਾਂ ਅੰਕੜਿਆਂ 'ਤੇ ਨਿਰਭਰ ਹੋਣ ਤੋਂ ਪਹਿਲਾਂ ਕੌਂਸਲ ਤੋਂ ਪੁਸ਼ਟੀ ਕਰੋ।", hi: "⚠ केवल प्रारंभिक जाँच — इन आँकड़ों पर निर्भर होने से पहले काउंसिल से पुष्टि करें।" },
  "prop.location": { en: "Location", zh: "位置", ta: "இடம்", gu: "સ્થાન", pa: "ਸਥਾਨ", hi: "स्थान" },
  "prop.approxLocation": { en: "◎ APPROX. LOCATION", zh: "◎ 大致位置", ta: "◎ தோராயமான இடம்", gu: "◎ અંદાજિત સ્થાન", pa: "◎ ਅਨੁਮਾਨਿਤ ਸਥਾਨ", hi: "◎ अनुमानित स्थान" },
  "prop.locationNote": { en: "Indicative location only — geocoded from the street address, not a surveyed boundary.", zh: "仅为示意位置——由街道地址生成，非测绘边界。", ta: "குறியீட்டு இடம் மட்டுமே — தெரு முகவரியிலிருந்து ஜியோகோட் செய்யப்பட்டது, அளக்கப்பட்ட எல்லை அல்ல.", gu: "માત્ર સૂચક સ્થાન — શેરીના સરનામાથી જિયોકોડ કરેલ, સર્વેક્ષિત સીમા નહીં.", pa: "ਸਿਰਫ਼ ਸੰਕੇਤਕ ਸਥਾਨ — ਗਲੀ ਦੇ ਪਤੇ ਤੋਂ ਜੀਓਕੋਡ ਕੀਤਾ, ਸਰਵੇਖਿਤ ਹੱਦ ਨਹੀਂ।", hi: "केवल सांकेतिक स्थान — सड़क के पते से जियोकोड किया गया, सर्वेक्षित सीमा नहीं।" },
  "prop.recentSalesIn": { en: "Recent sales in {suburb}", zh: "{suburb} 近期成交", ta: "{suburb} இல் சமீபத்திய விற்பனைகள்", gu: "{suburb} માં તાજેતરની વેચાણ", pa: "{suburb} ਵਿੱਚ ਹਾਲੀਆ ਵਿਕਰੀਆਂ", hi: "{suburb} में हाल की बिक्री" },
  "prop.recentSalesSub": { en: "{n} sold listings matching this property's profile — sanity-check the valuation against real sales nearby.", zh: "{n} 条与本房源相符的成交——用周边真实成交核对估值。", ta: "இந்த சொத்தின் விவரத்துடன் பொருந்தும் {n} விற்கப்பட்ட பட்டியல்கள் — மதிப்பீட்டை அருகிலுள்ள உண்மையான விற்பனைகளுடன் சரிபார்க்கவும்.", gu: "આ મિલકતના પ્રોફાઇલ સાથે મેળ ખાતી {n} વેચાયેલી લિસ્ટિંગ — મૂલ્યાંકનને નજીકની વાસ્તવિક વેચાણ સાથે ચકાસો.", pa: "ਇਸ ਜਾਇਦਾਦ ਦੇ ਪ੍ਰੋਫਾਈਲ ਨਾਲ ਮੇਲ ਖਾਂਦੀਆਂ {n} ਵਿਕੀਆਂ ਲਿਸਟਿੰਗਾਂ — ਮੁੱਲਾਂਕਣ ਨੂੰ ਨੇੜਲੀਆਂ ਅਸਲ ਵਿਕਰੀਆਂ ਨਾਲ ਜਾਂਚੋ।", hi: "इस संपत्ति के प्रोफ़ाइल से मेल खाती {n} बिकी लिस्टिंग — मूल्यांकन को पास की वास्तविक बिक्री से जाँचें।" },
  "prop.medianSale": { en: "MEDIAN SALE", zh: "成交中位数", ta: "இடைநிலை விற்பனை", gu: "મધ્યક વેચાણ", pa: "ਮੱਧਮਾਨ ਵਿਕਰੀ", hi: "मध्यक बिक्री" },
  "prop.averageSale": { en: "AVERAGE SALE", zh: "成交均价", ta: "சராசரி விற்பனை", gu: "સરેરાશ વેચાણ", pa: "ਔਸਤ ਵਿਕਰੀ", hi: "औसत बिक्री" },
  "prop.averageVsCv": { en: "AVERAGE VS CV", zh: "均价对比政府估价", ta: "CV உடன் ஒப்பிடுகையில் சராசரி", gu: "CV સામે સરેરાશ", pa: "CV ਦੇ ਮੁਕਾਬਲੇ ਔਸਤ", hi: "CV की तुलना में औसत" },
  "prop.address": { en: "ADDRESS", zh: "地址", ta: "முகவரி", gu: "સરનામું", pa: "ਪਤਾ", hi: "पता" },
  "prop.soldFor": { en: "SOLD FOR", zh: "成交价", ta: "விற்றது", gu: "વેચાયું", pa: "ਵਿਕਿਆ", hi: "बिका" },
  "prop.vsCvCol": { en: "VS CV", zh: "对比政府估价", ta: "CV உடன்", gu: "CV સામે", pa: "CV ਦੇ ਮੁਕਾਬਲੇ", hi: "CV की तुलना में" },
  "prop.medianSaleVsCv": { en: "Median sale vs CV ({n} sales with a CV)", zh: "成交中位数对比政府估价（{n} 笔含估价）", ta: "CV உடன் இடைநிலை விற்பனை ({n} விற்பனைகள், CV உடன்)", gu: "CV સામે મધ્યક વેચાણ ({n} વેચાણ, CV સહિત)", pa: "CV ਦੇ ਮੁਕਾਬਲੇ ਮੱਧਮਾਨ ਵਿਕਰੀ ({n} ਵਿਕਰੀਆਂ, CV ਸਮੇਤ)", hi: "CV की तुलना में मध्यक बिक्री ({n} बिक्री, CV सहित)" },
  "prop.middleHalf": { en: "Middle half of those sales", zh: "中间半数成交区间", ta: "அந்த விற்பனைகளின் நடு பாதி", gu: "તે વેચાણનો મધ્ય અડધો ભાગ", pa: "ਉਹਨਾਂ ਵਿਕਰੀਆਂ ਦਾ ਵਿਚਕਾਰਲਾ ਅੱਧ", hi: "उन बिक्री का मध्य आधा" },
  "prop.thisAskVsCv": { en: "This listing's asking price vs CV", zh: "本房源标价对比政府估价", ta: "CV உடன் இந்த பட்டியலின் கேட்கும் விலை", gu: "CV સામે આ લિસ્ટિંગની માંગ કિંમત", pa: "CV ਦੇ ਮੁਕਾਬਲੇ ਇਸ ਲਿਸਟਿੰਗ ਦਾ ਮੰਗ ਮੁੱਲ", hi: "CV की तुलना में इस लिस्टिंग का माँगा मूल्य" },
  "prop.medianDom": { en: "Days to sell — median ({n} sales)", zh: "售出天数——中位数（{n} 笔）", ta: "விற்பனை நாட்கள் — இடைநிலை ({n} விற்பனைகள்)", gu: "વેચાણમાં દિવસ — મધ્યક ({n} વેચાણ)", pa: "ਵਿਕਰੀ ਵਿੱਚ ਦਿਨ — ਮੱਧਮਾਨ ({n} ਵਿਕਰੀਆਂ)", hi: "बिक्री में दिन — मध्यक ({n} बिक्री)" },
  "prop.avgDom": { en: "Days to sell — average", zh: "售出天数——平均", ta: "விற்பனை நாட்கள் — சராசரி", gu: "વેચાણમાં દિવસ — સરેરાશ", pa: "ਵਿਕਰੀ ਵਿੱਚ ਦਿਨ — ਔਸਤ", hi: "बिक्री में दिन — औसत" },
  "prop.howSold": { en: "HOW THESE SOLD", zh: "成交方式", ta: "இவை எப்படி விற்றன", gu: "આ કેવી રીતે વેચાયું", pa: "ਇਹ ਕਿਵੇਂ ਵਿਕੀਆਂ", hi: "ये कैसे बिकीं" },
  "prop.methodAcross": { en: "SALE METHOD ACROSS {suburb}", zh: "{suburb} 的成交方式", ta: "{suburb} இல் விற்பனை முறை", gu: "{suburb} માં વેચાણની રીત", pa: "{suburb} ਵਿੱਚ ਵਿਕਰੀ ਦਾ ਤਰੀਕਾ", hi: "{suburb} में बिक्री का तरीका" },
  "prop.methodValueTitle": { en: "WHAT IT'S WORTH BY SALE METHOD", zh: "按成交方式的估值" },
  "prop.auctionPremium": { en: "Auction premium over negotiation", zh: "拍卖较议价溢价", ta: "பேச்சுவார்த்தையை விட ஏல பிரீமியம்", gu: "વાટાઘાટ સામે હરાજી પ્રીમિયમ", pa: "ਗੱਲਬਾਤ ਦੇ ਮੁਕਾਬਲੇ ਨੀਲਾਮੀ ਪ੍ਰੀਮੀਅਮ", hi: "बातचीत की तुलना में नीलामी प्रीमियम" },
  "prop.worthNegotiation": { en: "WORTH IF SOLD BY NEGOTIATION", zh: "议价成交估值", ta: "பேச்சுவார்த்தையில் விற்றால் மதிப்பு", gu: "વાટાઘાટથી વેચાય તો મૂલ્ય", pa: "ਗੱਲਬਾਤ ਨਾਲ ਵਿਕਣ 'ਤੇ ਮੁੱਲ", hi: "बातचीत से बिकने पर मूल्य" },
  "prop.worthAuction": { en: "WORTH IF SOLD AT AUCTION", zh: "拍卖成交估值", ta: "ஏலத்தில் விற்றால் மதிப்பு", gu: "હરાજીમાં વેચાય તો મૂલ્ય", pa: "ਨੀਲਾਮੀ ਵਿੱਚ ਵਿਕਣ 'ਤੇ ਮੁੱਲ", hi: "नीलामी में बिकने पर मूल्य" },
  "prop.days": { en: "days", zh: "天", ta: "நாட்கள்", gu: "દિવસ", pa: "ਦਿਨ", hi: "दिन" },
  "prop.points": { en: "points", zh: "个百分点", ta: "புள்ளிகள்", gu: "પોઇન્ટ", pa: "ਅੰਕ", hi: "अंक" },
  "prop.sale": { en: "sale", zh: "笔", ta: "விற்பனை", gu: "વેચાણ", pa: "ਵਿਕਰੀ", hi: "बिक्री" },
  "prop.sales": { en: "sales", zh: "笔", ta: "விற்பனைகள்", gu: "વેચાણ", pa: "ਵਿਕਰੀਆਂ", hi: "बिक्री" },
  "prop.tooFew": { en: "too few to rely on", zh: "样本过少不可依赖", ta: "நம்புவதற்கு மிகக் குறைவு", gu: "ભરોસા માટે બહુ ઓછું", pa: "ਭਰੋਸੇ ਲਈ ਬਹੁਤ ਘੱਟ", hi: "भरोसे के लिए बहुत कम" },
  "prop.pastSales": { en: "Past sales of this property", zh: "本房产历史成交", ta: "இந்த சொத்தின் கடந்தகால விற்பனைகள்", gu: "આ મિલકતની ભૂતકાળની વેચાણ", pa: "ਇਸ ਜਾਇਦਾਦ ਦੀਆਂ ਪਿਛਲੀਆਂ ਵਿਕਰੀਆਂ", hi: "इस संपत्ति की पिछली बिक्री" },
  "prop.lastSoldFor": { en: "Last sold for", zh: "上次成交", ta: "கடைசியாக விற்றது", gu: "છેલ્લે વેચાયું", pa: "ਪਿਛਲੀ ਵਾਰ ਵਿਕਿਆ", hi: "पिछली बार बिका" },
  "prop.cvMoved": { en: "How CV has moved", zh: "政府估价变化", ta: "CV எப்படி மாறியது", gu: "CV કેવી રીતે બદલાયું", pa: "CV ਕਿਵੇਂ ਬਦਲਿਆ", hi: "CV कैसे बदला" },
  "prop.totalCvChange": { en: "Total CV change", zh: "总估价变化", ta: "மொத்த CV மாற்றம்", gu: "કુલ CV ફેરફાર", pa: "ਕੁੱਲ CV ਤਬਦੀਲੀ", hi: "कुल CV परिवर्तन" },
  "prop.landChange": { en: "Land value change", zh: "地价变化", ta: "நில மதிப்பு மாற்றம்", gu: "જમીન મૂલ્ય ફેરફાર", pa: "ਜ਼ਮੀਨ ਮੁੱਲ ਤਬਦੀਲੀ", hi: "भूमि मूल्य परिवर्तन" },
  "prop.improvementsChange": { en: "Improvements change", zh: "建筑价值变化", ta: "மேம்பாடுகள் மாற்றம்", gu: "સુધારા ફેરફાર", pa: "ਸੁਧਾਰ ਤਬਦੀਲੀ", hi: "सुधार परिवर्तन" },
  "prop.weeklySnapshots": { en: "Our weekly snapshots of this listing", zh: "本房源的每周快照", ta: "இந்த பட்டியலின் எங்கள் வாராந்திர ஸ்னாப்ஷாட்கள்", gu: "આ લિસ્ટિંગના અમારા સાપ્તાહિક સ્નેપશોટ", pa: "ਇਸ ਲਿਸਟਿੰਗ ਦੇ ਸਾਡੇ ਹਫ਼ਤਾਵਾਰ ਸਨੈਪਸ਼ਾਟ", hi: "इस लिस्टिंग के हमारे साप्ताहिक स्नैपशॉट" },
  "prop.askingPrice": { en: "ASKING PRICE", zh: "标价", ta: "கேட்கும் விலை", gu: "માંગ કિંમત", pa: "ਮੰਗ ਮੁੱਲ", hi: "माँगा मूल्य" },
  "prop.ourEstValue": { en: "OUR ESTIMATED VALUE", zh: "我们的估值", ta: "எங்கள் மதிப்பிடப்பட்ட மதிப்பு", gu: "અમારું અંદાજિત મૂલ્ય", pa: "ਸਾਡਾ ਅਨੁਮਾਨਿਤ ਮੁੱਲ", hi: "हमारा अनुमानित मूल्य" },
  "prop.snapshotNote": { en: "This listing only appears in the current week's snapshot. Once a future upload also contains this same listing (matched by slug), week-over-week price changes will appear here.", zh: "本房源仅出现在当前周快照中。当未来上传再次包含该房源（按标识匹配）后，此处将显示周环比价格变化。", ta: "இந்த பட்டியல் இந்த வாரத்தின் ஸ்னாப்ஷாட்டில் மட்டுமே தோன்றுகிறது. எதிர்கால பதிவேற்றம் இதே பட்டியலையும் சேர்க்கும்போது (slug மூலம் பொருந்தல்), வாரம்-வாரம் விலை மாற்றங்கள் இங்கே தோன்றும்.", gu: "આ લિસ્ટિંગ માત્ર આ અઠવાડિયાના સ્નેપશોટમાં દેખાય છે. જ્યારે ભવિષ્યનો કોઈ અપલોડ આ જ લિસ્ટિંગને પણ સામેલ કરશે (slug સાથે મેળ), ત્યારે અઠવાડિયા-દર-અઠવાડિયા કિંમત ફેરફાર અહીં દેખાશે.", pa: "ਇਹ ਲਿਸਟਿੰਗ ਸਿਰਫ਼ ਇਸ ਹਫ਼ਤੇ ਦੇ ਸਨੈਪਸ਼ਾਟ ਵਿੱਚ ਦਿਖਦੀ ਹੈ। ਜਦੋਂ ਭਵਿੱਖ ਦਾ ਕੋਈ ਅੱਪਲੋਡ ਇਸੇ ਲਿਸਟਿੰਗ ਨੂੰ ਵੀ ਸ਼ਾਮਲ ਕਰੇਗਾ (slug ਨਾਲ ਮੇਲ), ਤਾਂ ਹਫ਼ਤੇ-ਦਰ-ਹਫ਼ਤੇ ਮੁੱਲ ਤਬਦੀਲੀਆਂ ਇੱਥੇ ਦਿਖਣਗੀਆਂ।", hi: "यह लिस्टिंग केवल इस सप्ताह के स्नैपशॉट में दिखती है। जब भविष्य का कोई अपलोड इसी लिस्टिंग को भी शामिल करेगा (slug से मिलान), तो सप्ताह-दर-सप्ताह मूल्य परिवर्तन यहाँ दिखेंगे।" },
  "prop.backToAll": { en: "← Back to all properties", zh: "← 返回全部房源", ta: "← அனைத்து சொத்துகளுக்கும் திரும்பு", gu: "← બધી મિલકતો પર પાછા", pa: "← ਸਾਰੀਆਂ ਜਾਇਦਾਦਾਂ 'ਤੇ ਵਾਪਸ", hi: "← सभी संपत्तियों पर वापस" },
  "prop.loading": { en: "Loading…", zh: "加载中…", ta: "ஏற்றுகிறது…", gu: "લોડ થઈ રહ્યું છે…", pa: "ਲੋਡ ਹੋ ਰਿਹਾ ਹੈ…", hi: "लोड हो रहा है…" },
  "prop.matchedTitle": { en: "Matched to this property's title type", zh: "已匹配本房源产权类型", ta: "இந்த சொத்தின் உரிமை வகையுடன் பொருத்தப்பட்டது", gu: "આ મિલકતના ટાઇટલ પ્રકાર સાથે મેળ કર્યો", pa: "ਇਸ ਜਾਇਦਾਦ ਦੀ ਟਾਈਟਲ ਕਿਸਮ ਨਾਲ ਮੇਲ ਕੀਤਾ", hi: "इस संपत्ति के टाइटल प्रकार से मेल किया गया" },
  "prop.mixedTitles": { en: "Too few same-title sales nearby — showing mixed titles.", zh: "周边同产权成交过少——显示混合产权。", ta: "அருகில் ஒரே-உரிமை விற்பனைகள் மிகக் குறைவு — கலப்பு உரிமைகள் காட்டப்படுகின்றன.", gu: "નજીકમાં સમાન-ટાઇટલ વેચાણ બહુ ઓછી — મિશ્રિત ટાઇટલ બતાવાય છે.", pa: "ਨੇੜੇ ਸਮਾਨ-ਟਾਈਟਲ ਵਿਕਰੀਆਂ ਬਹੁਤ ਘੱਟ — ਮਿਸ਼ਰਤ ਟਾਈਟਲ ਦਿਖਾਏ ਜਾ ਰਹੇ ਹਨ।", hi: "पास में समान-टाइटल बिक्री बहुत कम — मिश्रित टाइटल दिखाए जा रहे हैं।" },
  "prop.verifiedRecords": { en: "Sale prices are from verified Auckland sold records.", zh: "成交价来自经核实的奥克兰成交记录。", ta: "விற்பனை விலைகள் சரிபார்க்கப்பட்ட ஆக்லாந்து விற்பனை பதிவுகளிலிருந்து.", gu: "વેચાણ કિંમત ચકાસાયેલ ઓકલેન્ડ વેચાણ રેકોર્ડમાંથી છે.", pa: "ਵਿਕਰੀ ਮੁੱਲ ਪ੍ਰਮਾਣਿਤ ਆਕਲੈਂਡ ਵਿਕਰੀ ਰਿਕਾਰਡਾਂ ਤੋਂ ਹਨ।", hi: "बिक्री मूल्य सत्यापित ऑकलैंड बिक्री रिकॉर्ड से हैं।" },
  "prop.howFastSelling": { en: "How fast {suburb} is selling", zh: "{suburb} 的成交速度", ta: "{suburb} எவ்வளவு வேகமாக விற்கிறது", gu: "{suburb} કેટલી ઝડપથી વેચાઈ રહ્યું છે", pa: "{suburb} ਕਿੰਨੀ ਤੇਜ਼ੀ ਨਾਲ ਵਿਕ ਰਿਹਾ ਹੈ", hi: "{suburb} कितनी तेज़ी से बिक रहा है" },
  "prop.howFastSub": { en: "Median days from listing to sale, month by month. A falling line means the market is speeding up.", zh: "按月统计的上市到成交中位天数。曲线下降表示市场加速。", ta: "பட்டியலிலிருந்து விற்பனை வரை இடைநிலை நாட்கள், மாதம்-மாதம். இறங்கும் கோடு சந்தை வேகமடைவதைக் குறிக்கிறது.", gu: "લિસ્ટિંગથી વેચાણ સુધી મધ્યક દિવસ, મહિને-મહિને. ઘટતી રેખાનો અર્થ બજાર ઝડપી થઈ રહ્યું છે.", pa: "ਲਿਸਟਿੰਗ ਤੋਂ ਵਿਕਰੀ ਤੱਕ ਮੱਧਮਾਨ ਦਿਨ, ਮਹੀਨੇ-ਦਰ-ਮਹੀਨੇ। ਡਿੱਗਦੀ ਰੇਖਾ ਦਾ ਮਤਲਬ ਬਾਜ਼ਾਰ ਤੇਜ਼ ਹੋ ਰਿਹਾ ਹੈ।", hi: "लिस्टिंग से बिक्री तक मध्यक दिन, महीने-दर-महीने। गिरती रेखा का अर्थ है बाज़ार तेज़ हो रहा है।" },

  // --- today's brief ---
  "today.eyebrow": { en: "DAILY BRIEF · {date}", zh: "每日简报 · {date}", ta: "தினசரி சுருக்கம் · {date}", gu: "દૈનિક સારાંશ · {date}", pa: "ਰੋਜ਼ਾਨਾ ਸਾਰ · {date}", hi: "दैनिक सारांश · {date}" },
  "today.title": { en: "What's worth your attention", zh: "值得你关注的机会", ta: "உங்கள் கவனத்திற்குரியது எது", gu: "તમારા ધ્યાનને લાયક શું છે", pa: "ਤੁਹਾਡੇ ਧਿਆਨ ਯੋਗ ਕੀ ਹੈ", hi: "आपके ध्यान योग्य क्या है" },
  "today.intro": { en: "Ollie scanned {n} live listings. Here's where the opportunity is right now.", zh: "Ollie 扫描了 {n} 条在售房源。以下是当前的机会所在。", ta: "Ollie {n} நேரடி பட்டியல்களை ஸ்கேன் செய்தது. இப்போது வாய்ப்புகள் இங்கே.", gu: "Ollie એ {n} લાઇવ લિસ્ટિંગ સ્કેન કરી. અત્યારે તક અહીં છે.", pa: "Ollie ਨੇ {n} ਲਾਈਵ ਲਿਸਟਿੰਗਾਂ ਸਕੈਨ ਕੀਤੀਆਂ। ਹੁਣ ਮੌਕੇ ਇੱਥੇ ਹਨ।", hi: "Ollie ने {n} लाइव लिस्टिंग स्कैन कीं। अभी अवसर यहाँ हैं।" },
  "today.marketPulse": { en: "Market pulse · Auckland", zh: "市场脉搏 · 奥克兰", ta: "சந்தை நாடித்துடிப்பு · ஆக்லாந்து", gu: "બજારની નાડી · ઓકલેન્ડ", pa: "ਬਾਜ਼ਾਰ ਦੀ ਨਬਜ਼ · ਆਕਲੈਂਡ", hi: "बाज़ार की नब्ज़ · ऑकलैंड" },
  "today.vsLastWeek": { en: "vs last week", zh: "较上周", ta: "கடந்த வாரத்துடன்", gu: "ગયા અઠવાડિયા સામે", pa: "ਪਿਛਲੇ ਹਫ਼ਤੇ ਦੇ ਮੁਕਾਬਲੇ", hi: "पिछले सप्ताह की तुलना में" },
  "today.activeListings": { en: "Active listings", zh: "在售房源", ta: "செயலில் பட்டியல்கள்", gu: "સક્રિય લિસ્ટિંગ", pa: "ਸਰਗਰਮ ਲਿਸਟਿੰਗਾਂ", hi: "सक्रिय लिस्टिंग" },
  "today.medianAsking": { en: "Median asking", zh: "标价中位数", ta: "இடைநிலை கேட்கும் விலை", gu: "મધ્યક માંગ કિંમત", pa: "ਮੱਧਮਾਨ ਮੰਗ ਮੁੱਲ", hi: "मध्यक माँगा मूल्य" },
  "today.medianDom": { en: "Median predicted DOM", zh: "预计售期中位数", ta: "இடைநிலை மதிப்பிடப்பட்ட விற்பனை நாட்கள்", gu: "મધ્યક અંદાજિત વેચાણ દિવસ", pa: "ਮੱਧਮਾਨ ਅਨੁਮਾਨਿਤ ਵਿਕਰੀ ਦਿਨ", hi: "मध्यक अनुमानित बिक्री दिन" },
  "today.underpriced": { en: "Underpriced", zh: "低于估值", ta: "குறைந்த விலை", gu: "ઓછી કિંમત", pa: "ਘੱਟ ਕੀਮਤ", hi: "कम कीमत" },
  "today.subdividable": { en: "Subdividable", zh: "可分割", ta: "உட்பிரிக்கக்கூடிய", gu: "ઉપવિભાજ્ય", pa: "ਉਪਵੰਡਯੋਗ", hi: "उपविभाज्य" },
  "today.belowValue": { en: "below estimated value", zh: "低于估值", ta: "மதிப்பிடப்பட்ட மதிப்புக்குக் கீழே", gu: "અંદાજિત મૂલ્યથી ઓછું", pa: "ਅਨੁਮਾਨਿਤ ਮੁੱਲ ਤੋਂ ਘੱਟ", hi: "अनुमानित मूल्य से कम" },
  "today.landOverZone": { en: "land over zone minimum", zh: "土地超过分区下限", ta: "மண்டல குறைந்தபட்சத்தை விட நிலம்", gu: "ઝોન લઘુતમથી વધુ જમીન", pa: "ਜ਼ੋਨ ਘੱਟੋ-ਘੱਟ ਤੋਂ ਵੱਧ ਜ਼ਮੀਨ", hi: "ज़ोन न्यूनतम से अधिक भूमि" },
  "today.newThisWeek": { en: "New this week", zh: "本周新增", ta: "இந்த வாரம் புதியது", gu: "આ અઠવાડિયે નવી", pa: "ਇਸ ਹਫ਼ਤੇ ਨਵੀਆਂ", hi: "इस सप्ताह नई" },
  "today.newSub": { en: "listings added · {removed} removed · {still} still on market", zh: "新增房源 · {removed} 下架 · {still} 仍在售", ta: "பட்டியல்கள் சேர்க்கப்பட்டன · {removed} அகற்றப்பட்டன · {still} இன்னும் சந்தையில்", gu: "લિસ્ટિંગ ઉમેરાઈ · {removed} દૂર કરાઈ · {still} હજુ બજારમાં", pa: "ਲਿਸਟਿੰਗਾਂ ਜੋੜੀਆਂ · {removed} ਹਟਾਈਆਂ · {still} ਅਜੇ ਵੀ ਬਾਜ਼ਾਰ ਵਿੱਚ", hi: "लिस्टिंग जोड़ी गईं · {removed} हटाई गईं · {still} अब भी बाज़ार में" },
  "today.viewCompare": { en: "View full compare →", zh: "查看完整对比 →", ta: "முழு ஒப்பீட்டைப் பார் →", gu: "પૂરી સરખામણી જુઓ →", pa: "ਪੂਰੀ ਤੁਲਨਾ ਵੇਖੋ →", hi: "पूरी तुलना देखें →" },
  "today.medianAskingChange": { en: "Median asking change", zh: "标价中位数变化", ta: "இடைநிலை கேட்கும் விலை மாற்றம்", gu: "મધ્યક માંગ કિંમતમાં ફેરફાર", pa: "ਮੱਧਮਾਨ ਮੰਗ ਮੁੱਲ ਵਿੱਚ ਤਬਦੀਲੀ", hi: "मध्यक माँगे मूल्य में बदलाव" },
  "today.acrossBothWeeks": { en: "across listings present in both weeks", zh: "基于两周内均在售的房源", ta: "இரு வாரங்களிலும் உள்ள பட்டியல்களில்", gu: "બંને અઠવાડિયે હાજર લિસ્ટિંગ પર", pa: "ਦੋਵੇਂ ਹਫ਼ਤੇ ਮੌਜੂਦ ਲਿਸਟਿੰਗਾਂ 'ਤੇ", hi: "दोनों सप्ताह मौजूद लिस्टिंग पर" },
  "today.snapshotRhythm": { en: "Snapshot rhythm", zh: "快照频率", ta: "ஸ்னாப்ஷாட் தாளம்", gu: "સ્નેપશોટ લય", pa: "ਸਨੈਪਸ਼ਾਟ ਲੈਅ", hi: "स्नैपशॉट लय" },
  "today.weekly": { en: "Weekly", zh: "每周", ta: "வாராந்திரம்", gu: "સાપ્તાહિક", pa: "ਹਫ਼ਤਾਵਾਰ", hi: "साप्ताहिक" },
  "today.snapshotSub": { en: "{n} live · scored on upload", zh: "{n} 条在售 · 上传时评分", ta: "{n} நேரடி · பதிவேற்றத்தில் மதிப்பெண்", gu: "{n} લાઇવ · અપલોડ પર સ્કોર કરેલ", pa: "{n} ਲਾਈਵ · ਅੱਪਲੋਡ 'ਤੇ ਸਕੋਰ ਕੀਤਾ", hi: "{n} लाइव · अपलोड पर स्कोर किया गया" },
  "today.biggestDrops": { en: "Biggest price drops this week", zh: "本周最大降价", ta: "இந்த வாரம் மிகப்பெரிய விலை வீழ்ச்சிகள்", gu: "આ અઠવાડિયે સૌથી મોટી કિંમત ઘટાડો", pa: "ਇਸ ਹਫ਼ਤੇ ਸਭ ਤੋਂ ਵੱਡੀ ਕੀਮਤ ਗਿਰਾਵਟ", hi: "इस सप्ताह सबसे बड़ी कीमत गिरावट" },
  "today.biggestRises": { en: "Biggest price rises this week", zh: "本周最大涨价", ta: "இந்த வாரம் மிகப்பெரிய விலை உயர்வுகள்", gu: "આ અઠવાડિયે સૌથી મોટો કિંમત વધારો", pa: "ਇਸ ਹਫ਼ਤੇ ਸਭ ਤੋਂ ਵੱਡੀ ਕੀਮਤ ਵਾਧਾ", hi: "इस सप्ताह सबसे बड़ी कीमत वृद्धि" },
  "today.buyScore": { en: "Buy score", zh: "买入评分", ta: "வாங்கும் மதிப்பெண்", gu: "ખરીદ સ્કોર", pa: "ਖਰੀਦ ਸਕੋਰ", hi: "खरीद स्कोर" },
  "today.couldntLoad": { en: "Couldn't load today's brief", zh: "无法加载今日简报", ta: "இன்றைய சுருக்கத்தை ஏற்ற முடியவில்லை", gu: "આજનો સારાંશ લોડ થઈ શક્યો નહીં", pa: "ਅੱਜ ਦਾ ਸਾਰ ਲੋਡ ਨਹੀਂ ਹੋ ਸਕਿਆ", hi: "आज का सारांश लोड नहीं हो सका" },
  "today.loading": { en: "Loading today's brief…", zh: "正在加载今日简报…", ta: "இன்றைய சுருக்கம் ஏற்றுகிறது…", gu: "આજનો સારાંશ લોડ થઈ રહ્યો છે…", pa: "ਅੱਜ ਦਾ ਸਾਰ ਲੋਡ ਹੋ ਰਿਹਾ ਹੈ…", hi: "आज का सारांश लोड हो रहा है…" },
  "today.topSignals": { en: "Top signals (by buy score)", zh: "顶级信号（按买入评分）", ta: "சிறந்த சமிக்ஞைகள் (வாங்கும் மதிப்பெண்படி)", gu: "ટોચના સંકેત (ખરીદ સ્કોર પ્રમાણે)", pa: "ਸਿਖਰਲੇ ਸੰਕੇਤ (ਖਰੀਦ ਸਕੋਰ ਅਨੁਸਾਰ)", hi: "शीर्ष संकेत (खरीद स्कोर के अनुसार)" },
  "today.comparingSnapshots": { en: "comparing latest two snapshots", zh: "对比最近两次快照", ta: "சமீபத்திய இரண்டு ஸ்னாப்ஷாட்களின் ஒப்பீடு", gu: "તાજેતરના બે સ્નેપશોટની સરખામણી", pa: "ਨਵੀਨਤਮ ਦੋ ਸਨੈਪਸ਼ਾਟ ਦੀ ਤੁਲਨਾ", hi: "नवीनतम दो स्नैपशॉट की तुलना" },
  "today.asking": { en: "Asking", zh: "标价", ta: "கேட்பு", gu: "માંગ", pa: "ਮੰਗ", hi: "माँगा" },
  "today.est": { en: "Est", zh: "估值", ta: "மதி.", gu: "અનુ.", pa: "ਅਨੁ.", hi: "अनु." },
  "today.days": { en: "days", zh: "天", ta: "நாட்கள்", gu: "દિવસ", pa: "ਦਿਨ", hi: "दिन" },
  "today.failedLoad": { en: "Failed to load", zh: "加载失败", ta: "ஏற்ற முடியவில்லை", gu: "લોડ કરવામાં નિષ્ફળ", pa: "ਲੋਡ ਕਰਨ ਵਿੱਚ ਅਸਫਲ", hi: "लोड करने में विफल" },

  // --- headline deals (today) ---
  "hd.marginGems": { en: "MARGIN ON HIGH-CONVICTION DEALS", zh: "高把握机会的差价总额", ta: "உயர்-நம்பிக்கை டீல்களில் வித்தியாசம்", gu: "ઊંચા-વિશ્વાસ ડીલ પર તફાવત", pa: "ਉੱਚ-ਭਰੋਸਾ ਡੀਲਾਂ 'ਤੇ ਅੰਤਰ", hi: "उच्च-विश्वास डील पर अंतर" },
  "hd.subdivProfit": { en: "SUBDIVISION PROFIT AVAILABLE", zh: "可实现分割利润", ta: "கிடைக்கும் உட்பிரிவு லாபம்", gu: "ઉપલબ્ધ ઉપવિભાજન લાભ", pa: "ਉਪਲਬਧ ਉਪਵੰਡ ਲਾਭ", hi: "उपलब्ध उपविभाजन लाभ" },
  "hd.bedroomUplift": { en: "UPLIFT FROM ADDING A BEDROOM", zh: "增加卧室的增值", ta: "படுக்கையறை சேர்ப்பதால் மதிப்பு உயர்வு", gu: "બેડરૂમ ઉમેરવાથી મૂલ્ય વધારો", pa: "ਬੈੱਡਰੂਮ ਜੋੜਨ ਨਾਲ ਮੁੱਲ ਵਾਧਾ", hi: "बेडरूम जोड़ने से मूल्य वृद्धि" },
  "hd.marginAll": { en: "MARGIN ACROSS ALL UNDERPRICED", zh: "全部低估房源差价总额", ta: "அனைத்து குறைந்த விலையிலும் மொத்த வித்தியாசம்", gu: "બધી ઓછી કિંમત પર કુલ તફાવત", pa: "ਸਾਰੀਆਂ ਘੱਟ ਕੀਮਤ 'ਤੇ ਕੁੱਲ ਅੰਤਰ", hi: "सभी कम कीमत पर कुल अंतर" },
  "hd.gemsHint": { en: "across {n} listings · 15%+ below value, 8+ comps", zh: "覆盖 {n} 条 · 低于估值 15%+、8+ 可比成交", ta: "{n} பட்டியல்களில் · மதிப்பை விட 15%+ குறைவு, 8+ ஒப்பீடு", gu: "{n} લિસ્ટિંગ પર · મૂલ્યથી 15%+ ઓછું, 8+ તુલના", pa: "{n} ਲਿਸਟਿੰਗਾਂ 'ਤੇ · ਮੁੱਲ ਤੋਂ 15%+ ਘੱਟ, 8+ ਤੁਲਨਾ", hi: "{n} लिस्टिंग पर · मूल्य से 15%+ कम, 8+ तुलना" },
  "hd.subdivHint": { en: "across {n} sites · before consent and finance", zh: "覆盖 {n} 处 · 未计许可与融资", ta: "{n} மனைகளில் · அனுமதி மற்றும் நிதிக்கு முன்", gu: "{n} પ્લોટ પર · મંજૂરી અને નાણાં પહેલા", pa: "{n} ਪਲਾਟਾਂ 'ਤੇ · ਮਨਜ਼ੂਰੀ ਅਤੇ ਵਿੱਤ ਤੋਂ ਪਹਿਲਾਂ", hi: "{n} प्लॉट पर · अनुमति और वित्त से पहले" },
  "hd.bedroomHint": { en: "{n} houses already have the floor area · {dp} also underpriced", zh: "{n} 套已具备面积 · 其中 {dp} 套同时低估", ta: "{n} வீடுகளில் ஏற்கனவே தள பரப்பு உள்ளது · {dp} குறைந்த விலையும்", gu: "{n} ઘરો પાસે પહેલેથી ફ્લોર ક્ષેત્ર છે · {dp} ઓછી કિંમત પણ", pa: "{n} ਘਰਾਂ ਕੋਲ ਪਹਿਲਾਂ ਹੀ ਫ਼ਲੋਰ ਖੇਤਰ ਹੈ · {dp} ਘੱਟ ਕੀਮਤ ਵੀ", hi: "{n} घरों में पहले से फ़्लोर क्षेत्र है · {dp} कम कीमत भी" },
  "hd.marginHint": { en: "across {n} listings · includes thinner signals", zh: "覆盖 {n} 条 · 含较弱信号", ta: "{n} பட்டியல்களில் · பலவீன சமிக்ஞைகளும் அடங்கும்", gu: "{n} લિસ્ટિંગ પર · નબળા સંકેત પણ સામેલ", pa: "{n} ਲਿਸਟਿੰਗਾਂ 'ਤੇ · ਕਮਜ਼ੋਰ ਸੰਕੇਤ ਵੀ ਸ਼ਾਮਲ", hi: "{n} लिस्टिंग पर · कमज़ोर संकेत भी शामिल" },
  "hd.biggestGap": { en: "◆ BIGGEST GAP ON THE MARKET RIGHT NOW", zh: "◆ 当前市场最大价差", ta: "◆ இப்போது சந்தையில் மிகப்பெரிய வித்தியாசம்", gu: "◆ અત્યારે બજારમાં સૌથી મોટો તફાવત", pa: "◆ ਹੁਣ ਬਾਜ਼ਾਰ ਵਿੱਚ ਸਭ ਤੋਂ ਵੱਡਾ ਅੰਤਰ", hi: "◆ अभी बाज़ार में सबसे बड़ा अंतर" },
  "hd.belowValuation": { en: "BELOW OUR VALUATION", zh: "低于我们的估值", ta: "எங்கள் மதிப்பீட்டுக்குக் கீழே", gu: "અમારા મૂલ્યાંકનથી ઓછું", pa: "ਸਾਡੇ ਮੁੱਲਾਂਕਣ ਤੋਂ ਘੱਟ", hi: "हमारे मूल्यांकन से कम" },
  "hd.listPrice": { en: "LIST PRICE", zh: "标价", ta: "பட்டியல் விலை", gu: "યાદી કિંમત", pa: "ਸੂਚੀ ਮੁੱਲ", hi: "सूची मूल्य" },
  "hd.estValue": { en: "EST. VALUE", zh: "估值", ta: "மதிப்பிடப்பட்ட மதிப்பு", gu: "અંદાજિત મૂલ્ય", pa: "ਅਨੁਮਾਨਿਤ ਮੁੱਲ", hi: "अनुमानित मूल्य" },
  "hd.bedsBaths": { en: "BEDS / BATHS", zh: "卧室 / 浴室", ta: "படு / குளி", gu: "બેડ / બાથ", pa: "ਬੈੱਡ / ਬਾਥ", hi: "बेड / बाथ" },
  "hd.margin": { en: "{pct} margin", zh: "差幅 {pct}", ta: "{pct} வித்தியாசம்", gu: "{pct} તફાવત", pa: "{pct} ਅੰਤਰ", hi: "{pct} अंतर" },

  // --- value-add districts (today) ---
  "vad.title": { en: "What a renovation adds, by district", zh: "各区域装修增值", ta: "மாவட்டப்படி புதுப்பித்தல் சேர்க்கும் மதிப்பு", gu: "જિલ્લા પ્રમાણે નવીનીકરણથી મૂલ્ય વધારો", pa: "ਜ਼ਿਲ੍ਹੇ ਅਨੁਸਾਰ ਨਵੀਨੀਕਰਨ ਨਾਲ ਮੁੱਲ ਵਾਧਾ", hi: "ज़िले के अनुसार नवीनीकरण से मूल्य वृद्धि" },
  "vad.sub": { en: "Compared against sold houses of the same size, same bedrooms and same type — the value of the feature, not of a bigger house.", zh: "与同面积、同卧室数、同类型的成交房屋对比——衡量该特征本身的价值，而非更大房屋的价值。", ta: "ஒரே அளவு, ஒரே படுக்கையறை மற்றும் ஒரே வகை விற்கப்பட்ட வீடுகளுடன் ஒப்பிடப்பட்டது — பெரிய வீட்டின் அல்ல, அந்த அம்சத்தின் மதிப்பு.", gu: "સમાન કદ, સમાન બેડરૂમ અને સમાન પ્રકારની વેચાયેલી મિલકતો સાથે તુલના — મોટા ઘરનું નહીં, પણ તે વિશેષતાનું મૂલ્ય.", pa: "ਸਮਾਨ ਆਕਾਰ, ਸਮਾਨ ਬੈੱਡਰੂਮ ਅਤੇ ਸਮਾਨ ਕਿਸਮ ਦੀਆਂ ਵਿਕੀਆਂ ਜਾਇਦਾਦਾਂ ਨਾਲ ਤੁਲਨਾ — ਵੱਡੇ ਘਰ ਦਾ ਨਹੀਂ, ਸਗੋਂ ਉਸ ਵਿਸ਼ੇਸ਼ਤਾ ਦਾ ਮੁੱਲ।", hi: "समान आकार, समान बेडरूम और समान प्रकार की बिकी संपत्तियों से तुलना — बड़े घर का नहीं, बल्कि उस विशेषता का मूल्य।" },
  "vad.showPool": { en: "SHOW POOL", zh: "显示泳池", ta: "குளம் காட்டு", gu: "પૂલ બતાવો", pa: "ਪੂਲ ਦਿਖਾਓ", hi: "पूल दिखाएँ" },
  "vad.hidePool": { en: "HIDE POOL", zh: "隐藏泳池", ta: "குளம் மறை", gu: "પૂલ છુપાવો", pa: "ਪੂਲ ਲੁਕਾਓ", hi: "पूल छिपाएँ" },
  "vad.bedroom": { en: "4th bedroom", zh: "第 4 间卧室", ta: "4வது படுக்கையறை", gu: "ચોથો બેડરૂમ", pa: "ਚੌਥਾ ਬੈੱਡਰੂਮ", hi: "चौथा बेडरूम" },
  "vad.bathroom": { en: "2nd bathroom", zh: "第 2 间浴室", ta: "2வது குளியலறை", gu: "બીજો બાથરૂમ", pa: "ਦੂਜਾ ਬਾਥਰੂਮ", hi: "दूसरा बाथरूम" },
  "vad.poolGap": { en: "pool gap — not a renovation estimate", zh: "泳池差值——非装修估算", ta: "குள வித்தியாசம் — புதுப்பித்தல் மதிப்பீடு அல்ல", gu: "પૂલ તફાવત — નવીનીકરણ અંદાજ નહીં", pa: "ਪੂਲ ਅੰਤਰ — ਨਵੀਨੀਕਰਨ ਅਨੁਮਾਨ ਨਹੀਂ", hi: "पूल अंतर — नवीनीकरण अनुमान नहीं" },
  "vad.poolShort": { en: "pool gap", zh: "泳池差值", ta: "குள வித்தியாசம்", gu: "પૂલ તફાવત", pa: "ਪੂਲ ਅੰਤਰ", hi: "पूल अंतर" },
  "vad.poolSuffix": { en: "not a renovation estimate", zh: "非装修估算", ta: "புதுப்பித்தல் மதிப்பீடு அல்ல", gu: "નવીનીકરણ અંદાજ નહીં", pa: "ਨਵੀਨੀਕਰਨ ਅਨੁਮਾਨ ਨਹੀਂ", hi: "नवीनीकरण अनुमान नहीं" },
  "vad.note": { en: "The small grey number is how many size-matched comparisons back each figure; a dash means too few sales. Bedrooms pay most in Auckland City and on the North Shore, and barely at all in Franklin or Manukau — bathrooms run the other way. A third bathroom measures at roughly zero Auckland-wide. The pool bar is the gap between houses that have one and houses that don't; it holds up against controls for size, bedrooms and land, so it reflects the calibre of house that has a pool rather than the pool itself.", zh: "灰色小字为支撑每项数据的同面积对比数量；短横表示成交过少。卧室在奥克兰市区与北岸增值最高，在 Franklin 或 Manukau 几乎无增值——浴室则相反。第三间浴室在全奥克兰范围内接近于零。泳池条为有泳池与无泳池房屋之间的差值；在控制面积、卧室与土地后依然成立，故反映的是拥有泳池房屋的档次，而非泳池本身。", ta: "சிறிய சாம்பல் எண் ஒவ்வொரு எண்ணின் பின்னால் எத்தனை அளவு-பொருந்திய ஒப்பீடுகள் உள்ளன என்பதைக் காட்டுகிறது; கோடு என்றால் மிகக் குறைவான விற்பனைகள். படுக்கையறை ஆக்லாந்து சிட்டி மற்றும் நார்த் ஷோரில் அதிக மதிப்பு தருகிறது, ஃப்ராங்க்ளின் அல்லது மனுகாவில் அரிதாகவே — குளியலறைகள் நேர்மாறாக. மூன்றாவது குளியலறை ஆக்லாந்து முழுவதும் ஏறக்குறைய பூஜ்யமாக அளவிடப்படுகிறது. குள பட்டை குளம் உள்ள வீடுகளுக்கும் இல்லாத வீடுகளுக்கும் இடையிலான வித்தியாசம்; இது அளவு, படுக்கையறை மற்றும் நிலக் கட்டுப்பாடுகளுக்குப் பிறகும் நிலைத்திருக்கிறது, எனவே இது குளத்தை அல்ல, குளம் உள்ள வீட்டின் தரத்தை பிரதிபலிக்கிறது.", gu: "નાનો ભૂખરો આંક બતાવે છે કે દરેક આંકડા પાછળ કેટલી કદ-મેળ તુલનાઓ છે; ડૅશનો અર્થ બહુ ઓછી વેચાણ. બેડરૂમનું સૌથી વધુ મૂલ્ય ઓકલેન્ડ સિટી અને નોર્થ શોરમાં છે, અને ફ્રેન્કલિન કે મનુકાઉમાં ભાગ્યે જ — બાથરૂમ તેનાથી ઉલટું. ત્રીજો બાથરૂમ પૂરા ઓકલેન્ડમાં લગભગ શૂન્ય મપાય છે. પૂલ બાર તે ઘરો વચ્ચેનો તફાવત છે જેમની પાસે પૂલ છે અને જેમની પાસે નથી; તે કદ, બેડરૂમ અને જમીનના નિયંત્રણ પછી પણ ટકે છે, તેથી તે પૂલને બદલે પૂલવાળા ઘરના સ્તરને દર્શાવે છે.", pa: "ਛੋਟਾ ਸਲੇਟੀ ਅੰਕ ਦੱਸਦਾ ਹੈ ਕਿ ਹਰ ਅੰਕੜੇ ਪਿੱਛੇ ਕਿੰਨੀਆਂ ਆਕਾਰ-ਮੇਲ ਤੁਲਨਾਵਾਂ ਹਨ; ਡੈਸ਼ ਦਾ ਮਤਲਬ ਬਹੁਤ ਘੱਟ ਵਿਕਰੀਆਂ। ਬੈੱਡਰੂਮ ਦਾ ਸਭ ਤੋਂ ਵੱਧ ਮੁੱਲ ਆਕਲੈਂਡ ਸਿਟੀ ਅਤੇ ਨਾਰਥ ਸ਼ੋਰ ਵਿੱਚ ਹੈ, ਅਤੇ ਫ੍ਰੈਂਕਲਿਨ ਜਾਂ ਮਨੁਕਾਊ ਵਿੱਚ ਮੁਸ਼ਕਲ ਨਾਲ — ਬਾਥਰੂਮ ਇਸ ਤੋਂ ਉਲਟ। ਤੀਜਾ ਬਾਥਰੂਮ ਪੂਰੇ ਆਕਲੈਂਡ ਵਿੱਚ ਲਗਭਗ ਸਿਫ਼ਰ ਮਾਪਿਆ ਜਾਂਦਾ ਹੈ। ਪੂਲ ਬਾਰ ਉਹਨਾਂ ਘਰਾਂ ਵਿਚਕਾਰ ਅੰਤਰ ਹੈ ਜਿਨ੍ਹਾਂ ਕੋਲ ਪੂਲ ਹੈ ਅਤੇ ਜਿਨ੍ਹਾਂ ਕੋਲ ਨਹੀਂ; ਇਹ ਆਕਾਰ, ਬੈੱਡਰੂਮ ਅਤੇ ਜ਼ਮੀਨ ਦੇ ਨਿਯੰਤਰਣ ਬਾਅਦ ਵੀ ਟਿਕਦਾ ਹੈ, ਇਸ ਲਈ ਇਹ ਪੂਲ ਦੀ ਬਜਾਏ ਪੂਲ ਵਾਲੇ ਘਰ ਦੇ ਪੱਧਰ ਨੂੰ ਦਰਸਾਉਂਦਾ ਹੈ।", hi: "छोटा धूसर अंक बताता है कि हर आँकड़े के पीछे कितनी आकार-मिलान तुलनाएँ हैं; डैश का अर्थ बहुत कम बिक्री। बेडरूम का सबसे अधिक मूल्य ऑकलैंड सिटी और नॉर्थ शोर में है, और फ़्रैंकलिन या मनुकाऊ में बमुश्किल — बाथरूम इसके उलट। तीसरा बाथरूम पूरे ऑकलैंड में लगभग शून्य मापा जाता है। पूल बार उन घरों के बीच का अंतर है जिनमें पूल है और जिनमें नहीं; यह आकार, बेडरूम और भूमि के नियंत्रण के बाद भी टिकता है, इसलिए यह पूल के बजाय पूल वाले घर के स्तर को दर्शाता है।" },

  // --- add-a-room ---
  "room.title": { en: "Room to add a bedroom", zh: "可增卧室的房源", ta: "படுக்கையறை சேர்க்க இடம்", gu: "બેડરૂમ ઉમેરવાની જગ્યા", pa: "ਬੈੱਡਰੂਮ ਜੋੜਨ ਦੀ ਗੁੰਜਾਇਸ਼", hi: "बेडरूम जोड़ने की गुंजाइश" },
  "room.blurb": { en: "These houses already carry the floor area of a home one bedroom larger — the space is inside the existing walls. Shown only in districts where a bedroom measurably pays.", zh: "这些房屋已具备多一间卧室的建筑面积——空间就在现有墙体之内。仅显示卧室能带来可衡量增值的区域。", ta: "இந்த வீடுகளில் ஏற்கனவே ஒரு படுக்கையறை பெரிய வீட்டின் தள பரப்பு உள்ளது — இடம் தற்போதைய சுவர்களுக்குள் உள்ளது. படுக்கையறை அளவிடத்தக்க மதிப்பு தரும் மாவட்டங்களில் மட்டுமே காட்டப்பட்டது.", gu: "આ ઘરો પાસે પહેલેથી એક બેડરૂમ મોટા ઘર જેટલું ફ્લોર ક્ષેત્ર છે — જગ્યા હાલની દીવાલોની અંદર છે. માત્ર તે જિલ્લાઓમાં બતાવ્યું જ્યાં બેડરૂમનું માપી શકાય તેવું મૂલ્ય છે.", pa: "ਇਹਨਾਂ ਘਰਾਂ ਕੋਲ ਪਹਿਲਾਂ ਹੀ ਇੱਕ ਬੈੱਡਰੂਮ ਵੱਡੇ ਘਰ ਜਿੰਨਾ ਫ਼ਲੋਰ ਖੇਤਰ ਹੈ — ਜਗ੍ਹਾ ਮੌਜੂਦਾ ਕੰਧਾਂ ਦੇ ਅੰਦਰ ਹੈ। ਸਿਰਫ਼ ਉਹਨਾਂ ਜ਼ਿਲ੍ਹਿਆਂ ਵਿੱਚ ਦਿਖਾਇਆ ਜਿੱਥੇ ਬੈੱਡਰੂਮ ਦਾ ਮਾਪਣਯੋਗ ਮੁੱਲ ਹੈ।", hi: "इन घरों में पहले से ही एक बेडरूम बड़े घर जितना फ़्लोर क्षेत्र है — जगह मौजूदा दीवारों के भीतर है। केवल उन ज़िलों में दिखाया गया जहाँ बेडरूम का मापनीय मूल्य है।" },
  "room.uplift": { en: "UPLIFT ON THE TABLE", zh: "可实现增值", ta: "சாத்தியமான மதிப்பு உயர்வு", gu: "સંભવિત મૂલ્ય વધારો", pa: "ਸੰਭਾਵੀ ਮੁੱਲ ਵਾਧਾ", hi: "संभावित मूल्य वृद्धि" },
  "room.houses": { en: "HOUSES", zh: "房屋", ta: "வீடுகள்", gu: "ઘરો", pa: "ਘਰ", hi: "घर" },
  "room.alsoUnderpriced": { en: "ALSO UNDERPRICED", zh: "同时低估", ta: "குறைந்த விலையும்", gu: "ઓછી કિંમત પણ", pa: "ਘੱਟ ਕੀਮਤ ਵੀ", hi: "कम कीमत भी" },
  "room.warn": { en: "⚠ Uplift is resale value only — conversion cost is not netted off. Floor area cannot tell us whether the layout, windows or egress permit the partition, so treat this as a shortlist to inspect rather than a guarantee.", zh: "⚠ 增值仅为转售价值——未扣除改造成本。建筑面积无法判断户型、采光或消防是否允许隔断，故请视为待核实清单而非保证。", ta: "⚠ மதிப்பு உயர்வு மறுவிற்பனை மதிப்பு மட்டுமே — மாற்றச் செலவு கழிக்கப்படவில்லை. தள பரப்பு லேஅவுட், ஜன்னல்கள் அல்லது வெளியேற்றம் பிரிவை அனுமதிக்குமா என்பதைச் சொல்ல முடியாது, எனவே இதை உத்தரவாதமாக அல்ல, சோதிக்க வேண்டிய பட்டியலாகக் கருதுங்கள்.", gu: "⚠ મૂલ્ય વધારો માત્ર પુનર્વેચાણ મૂલ્ય છે — રૂપાંતરણ ખર્ચ બાદ કરાયો નથી. ફ્લોર ક્ષેત્ર એ કહી શકતું નથી કે લેઆઉટ, બારીઓ કે નિકાસ વિભાજનની પરવાનગી આપે છે કે નહીં, તેથી આને ગેરંટી નહીં પણ તપાસવાની યાદી ગણો.", pa: "⚠ ਮੁੱਲ ਵਾਧਾ ਸਿਰਫ਼ ਮੁੜ-ਵਿਕਰੀ ਮੁੱਲ ਹੈ — ਬਦਲਾਅ ਦੀ ਲਾਗਤ ਘਟਾਈ ਨਹੀਂ ਗਈ। ਫ਼ਲੋਰ ਖੇਤਰ ਇਹ ਨਹੀਂ ਦੱਸ ਸਕਦਾ ਕਿ ਲੇਆਊਟ, ਖਿੜਕੀਆਂ ਜਾਂ ਨਿਕਾਸ ਵੰਡ ਦੀ ਇਜਾਜ਼ਤ ਦਿੰਦੇ ਹਨ ਜਾਂ ਨਹੀਂ, ਇਸ ਲਈ ਇਸ ਨੂੰ ਗਾਰੰਟੀ ਨਹੀਂ ਸਗੋਂ ਜਾਂਚ ਦੀ ਸੂਚੀ ਸਮਝੋ।", hi: "⚠ मूल्य वृद्धि केवल पुनर्विक्रय मूल्य है — रूपांतरण लागत घटाई नहीं गई। फ़्लोर क्षेत्र यह नहीं बता सकता कि लेआउट, खिड़कियाँ या निकास विभाजन की अनुमति देते हैं या नहीं, इसलिए इसे गारंटी नहीं बल्कि निरीक्षण की सूची मानें।" },

  // --- buyers agent ---
  "agent.title": { en: "Talk to an Ollie buyer's agent", zh: "联系 Ollie 买方经纪", ta: "Ollie வாங்குபவர் முகவரிடம் பேசுங்கள்", gu: "Ollie ખરીદદાર એજન્ટ સાથે વાત કરો", pa: "Ollie ਖਰੀਦਦਾਰ ਏਜੰਟ ਨਾਲ ਗੱਲ ਕਰੋ", hi: "Ollie खरीदार एजेंट से बात करें" },
  "agent.sub": { en: "No upfront fee — we act for the buyer, not the vendor.", zh: "无预付费用——我们代表买方，而非卖方。", ta: "முன்பணக் கட்டணம் இல்லை — நாங்கள் வாங்குபவருக்காக செயல்படுகிறோம், விற்பவருக்காக அல்ல.", gu: "કોઈ અગાઉથી ફી નહીં — અમે ખરીદદાર માટે કામ કરીએ છીએ, વેચનાર માટે નહીં.", pa: "ਕੋਈ ਅਗਾਊਂ ਫ਼ੀਸ ਨਹੀਂ — ਅਸੀਂ ਖਰੀਦਦਾਰ ਲਈ ਕੰਮ ਕਰਦੇ ਹਾਂ, ਵਿਕਰੇਤਾ ਲਈ ਨਹੀਂ।", hi: "कोई अग्रिम शुल्क नहीं — हम खरीदार के लिए काम करते हैं, विक्रेता के लिए नहीं।" },
  "agent.role": { en: "BUYER'S AGENT", zh: "买方经纪", ta: "வாங்குபவர் முகவர்", gu: "ખરીદદાર એજન્ટ", pa: "ਖਰੀਦਦਾਰ ਏਜੰਟ", hi: "खरीदार एजेंट" },
  "agent.call": { en: "Call {phone}", zh: "致电 {phone}", ta: "{phone} ஐ அழைக்கவும்", gu: "{phone} પર કૉલ કરો", pa: "{phone} 'ਤੇ ਕਾਲ ਕਰੋ", hi: "{phone} पर कॉल करें" },
  "agent.email": { en: "Email about this property", zh: "就此房源发邮件", ta: "இந்த சொத்து பற்றி மின்னஞ்சல் அனுப்பு", gu: "આ મિલકત વિશે ઈમેલ કરો", pa: "ਇਸ ਜਾਇਦਾਦ ਬਾਰੇ ਈਮੇਲ ਕਰੋ", hi: "इस संपत्ति के बारे में ईमेल करें" },
  "agent.emailNote": { en: "The email opens pre-filled with this address and our buy price — nothing is sent until you press send.", zh: "邮件将预填此地址与我们的建议买价——在你点击发送前不会寄出。", ta: "மின்னஞ்சல் இந்த முகவரி மற்றும் எங்கள் வாங்கும் விலையுடன் முன்பே நிரப்பப்பட்டு திறக்கிறது — நீங்கள் அனுப்பு அழுத்தும் வரை எதுவும் அனுப்பப்படாது.", gu: "ઈમેલ આ સરનામા અને અમારા ખરીદ ભાવ સાથે પહેલેથી ભરેલ ખૂલે છે — તમે મોકલો ન દબાવો ત્યાં સુધી કંઈ મોકલાતું નથી.", pa: "ਈਮੇਲ ਇਸ ਪਤੇ ਅਤੇ ਸਾਡੇ ਖਰੀਦ ਮੁੱਲ ਨਾਲ ਪਹਿਲਾਂ ਭਰੀ ਖੁੱਲ੍ਹਦੀ ਹੈ — ਜਦੋਂ ਤੱਕ ਤੁਸੀਂ ਭੇਜੋ ਨਾ ਦਬਾਓ, ਕੁਝ ਨਹੀਂ ਭੇਜਿਆ ਜਾਂਦਾ।", hi: "ईमेल इस पते और हमारे खरीद मूल्य के साथ पहले से भरा खुलता है — जब तक आप भेजें न दबाएँ, कुछ नहीं भेजा जाता।" },
  "agent.notConfigured": { en: "⚠ No buyer's agent configured. Set the agent environment variables, then rebuild.", zh: "⚠ 未配置买方经纪。请设置经纪环境变量后重新构建。", ta: "⚠ வாங்குபவர் முகவர் அமைக்கப்படவில்லை. முகவர் சூழல் மாறிகளை அமைத்து, மீண்டும் build செய்யுங்கள்.", gu: "⚠ કોઈ ખરીદદાર એજન્ટ ગોઠવેલ નથી. એજન્ટ એન્વાયર્નમેન્ટ વેરિએબલ સેટ કરો, પછી ફરી બિલ્ડ કરો.", pa: "⚠ ਕੋਈ ਖਰੀਦਦਾਰ ਏਜੰਟ ਸੰਰਚਿਤ ਨਹੀਂ। ਏਜੰਟ ਏਨਵਾਇਰਨਮੈਂਟ ਵੇਰੀਏਬਲ ਸੈੱਟ ਕਰੋ, ਫਿਰ ਮੁੜ-ਬਿਲਡ ਕਰੋ।", hi: "⚠ कोई खरीदार एजेंट कॉन्फ़िगर नहीं। एजेंट एनवायरनमेंट वेरिएबल सेट करें, फिर रीबिल्ड करें।" },

  // --- auth ---
  "auth.signIn": { en: "Sign in", zh: "登录", ta: "உள்நுழை", gu: "સાઇન ઇન", pa: "ਸਾਈਨ ਇਨ", hi: "साइन इन" },
  "auth.email": { en: "Email", zh: "邮箱", ta: "மின்னஞ்சல்", gu: "ઈમેલ", pa: "ਈਮੇਲ", hi: "ईमेल" },
  "auth.password": { en: "Password", zh: "密码", ta: "கடவுச்சொல்", gu: "પાસવર્ડ", pa: "ਪਾਸਵਰਡ", hi: "पासवर्ड" },
  "auth.demoNote": { en: "Enter your email and password to sign in.", zh: "输入您的邮箱和密码以登录。", ta: "உள்நுழைய உங்கள் மின்னஞ்சல் மற்றும் கடவுச்சொல்லை உள்ளிடவும்.", gu: "સાઇન ઇન કરવા તમારો ઈમેલ અને પાસવર્ડ દાખલ કરો.", pa: "ਸਾਈਨ ਇਨ ਕਰਨ ਲਈ ਆਪਣਾ ਈਮੇਲ ਅਤੇ ਪਾਸਵਰਡ ਦਾਖਲ ਕਰੋ।", hi: "साइन इन करने के लिए अपना ईमेल और पासवर्ड दर्ज करें।" },
  "auth.newHere": { en: "New here?", zh: "初次使用？", ta: "புதியவரா?", gu: "નવા છો?", pa: "ਨਵੇਂ ਹੋ?", hi: "नए हैं?" },
  "auth.requestAccess": { en: "Request access", zh: "申请权限", ta: "அணுகலைக் கோரு", gu: "એક્સેસની વિનંતી કરો", pa: "ਪਹੁੰਚ ਦੀ ਬੇਨਤੀ ਕਰੋ", hi: "एक्सेस का अनुरोध करें" },
  "auth.signUpTitle": { en: "Request access", zh: "申请权限", ta: "அணுகலைக் கோரு", gu: "એક્સેસની વિનંતી કરો", pa: "ਪਹੁੰਚ ਦੀ ਬੇਨਤੀ ਕਰੋ", hi: "एक्सेस का अनुरोध करें" },
  "auth.signUpSub": { en: "Tell us a little about you. We'll review and approve.", zh: "请简单介绍你自己。我们会审核并批准。", ta: "உங்களைப் பற்றி சிறிது சொல்லுங்கள். நாங்கள் மதிப்பாய்வு செய்து அனுமதிப்போம்.", gu: "તમારા વિશે થોડું જણાવો. અમે સમીક્ષા કરીને મંજૂર કરીશું.", pa: "ਆਪਣੇ ਬਾਰੇ ਥੋੜ੍ਹਾ ਦੱਸੋ। ਅਸੀਂ ਸਮੀਖਿਆ ਕਰਕੇ ਮਨਜ਼ੂਰ ਕਰਾਂਗੇ।", hi: "अपने बारे में थोड़ा बताएँ। हम समीक्षा कर स्वीकृत करेंगे।" },
  "auth.fullName": { en: "Full name", zh: "姓名", ta: "முழு பெயர்", gu: "પૂરું નામ", pa: "ਪੂਰਾ ਨਾਮ", hi: "पूरा नाम" },
  "auth.company": { en: "Company", zh: "公司", ta: "நிறுவனம்", gu: "કંપની", pa: "ਕੰਪਨੀ", hi: "कंपनी" },
  "auth.phone": { en: "Phone", zh: "电话", ta: "தொலைபேசி", gu: "ફોન", pa: "ਫ਼ੋਨ", hi: "फ़ोन" },
  "auth.submitRequest": { en: "Submit request", zh: "提交申请", ta: "கோரிக்கையை அனுப்பு", gu: "વિનંતી મોકલો", pa: "ਬੇਨਤੀ ਭੇਜੋ", hi: "अनुरोध भेजें" },
  "auth.haveAccount": { en: "Already have access?", zh: "已有账号？", ta: "ஏற்கனவே அணுகல் உள்ளதா?", gu: "પહેલેથી એક્સેસ છે?", pa: "ਪਹਿਲਾਂ ਹੀ ਪਹੁੰਚ ਹੈ?", hi: "पहले से एक्सेस है?" },
  "auth.requestReceived": { en: "Request received", zh: "已收到申请", ta: "கோரிக்கை பெறப்பட்டது", gu: "વિનંતી મળી", pa: "ਬੇਨਤੀ ਮਿਲੀ", hi: "अनुरोध प्राप्त हुआ" },
  "auth.reviewNote": { en: "An admin will review your account. You will get an email when it is approved.", zh: "管理员将审核你的账号。通过后你会收到邮件通知。", ta: "ஒரு நிர்வாகி உங்கள் கணக்கை மதிப்பாய்வு செய்வார். அனுமதிக்கப்பட்டவுடன் உங்களுக்கு மின்னஞ்சல் வரும்.", gu: "એક એડમિન તમારા ખાતાની સમીક્ષા કરશે. મંજૂર થતાં તમને ઈમેલ મળશે.", pa: "ਇੱਕ ਐਡਮਿਨ ਤੁਹਾਡੇ ਖਾਤੇ ਦੀ ਸਮੀਖਿਆ ਕਰੇਗਾ। ਮਨਜ਼ੂਰ ਹੋਣ 'ਤੇ ਤੁਹਾਨੂੰ ਈਮੇਲ ਮਿਲੇਗੀ।", hi: "एक एडमिन आपके खाते की समीक्षा करेगा। स्वीकृत होने पर आपको ईमेल मिलेगा।" },
  "auth.backHome": { en: "← Back to home", zh: "← 返回首页", ta: "← முகப்புக்கு திரும்பு", gu: "← હોમ પર પાછા", pa: "← ਹੋਮ 'ਤੇ ਵਾਪਸ", hi: "← होम पर वापस" },
  "auth.alreadyApproved": { en: "Already approved?", zh: "已获批准？", ta: "ஏற்கனவே அனுமதிக்கப்பட்டதா?", gu: "પહેલેથી મંજૂર?", pa: "ਪਹਿਲਾਂ ਹੀ ਮਨਜ਼ੂਰ?", hi: "पहले से स्वीकृत?" },
  "auth.signUpFailed": { en: "Sign-up failed", zh: "注册失败", ta: "பதிவு தோல்வி", gu: "સાઇન-અપ નિષ્ફળ", pa: "ਸਾਈਨ-ਅੱਪ ਅਸਫਲ", hi: "साइन-अप विफल" },
  "auth.signingIn": { en: "Signing in…", zh: "正在登录…", ta: "உள்நுழைகிறது…", gu: "સાઇન ઇન થઈ રહ્યું છે…", pa: "ਸਾਈਨ ਇਨ ਹੋ ਰਿਹਾ ਹੈ…", hi: "साइन इन हो रहा है…" },
  "auth.signInFailed": { en: "Sign-in failed", zh: "登录失败", ta: "உள்நுழைவு தோல்வி", gu: "સાઇન-ઇન નિષ્ફળ", pa: "ਸਾਈਨ-ਇਨ ਅਸਫਲ", hi: "साइन-इन विफल" },
  "auth.submitting": { en: "Submitting…", zh: "正在提交…", ta: "அனுப்புகிறது…", gu: "મોકલાઈ રહ્યું છે…", pa: "ਭੇਜਿਆ ਜਾ ਰਿਹਾ ਹੈ…", hi: "भेजा जा रहा है…" },
  "auth.requestFailed": { en: "Request failed", zh: "申请失败", ta: "கோரிக்கை தோல்வி", gu: "વિનંતી નિષ્ફળ", pa: "ਬੇਨਤੀ ਅਸਫਲ", hi: "अनुरोध विफल" },
  "auth.requestSent": { en: "Request received — we'll be in touch once approved.", zh: "已收到申请——审核通过后我们会与你联系。", ta: "கோரிக்கை பெறப்பட்டது — அனுமதிக்குப் பிறகு நாங்கள் தொடர்பு கொள்வோம்.", gu: "વિનંતી મળી — મંજૂરી પછી અમે સંપર્ક કરીશું.", pa: "ਬੇਨਤੀ ਮਿਲੀ — ਮਨਜ਼ੂਰੀ ਬਾਅਦ ਅਸੀਂ ਸੰਪਰਕ ਕਰਾਂਗੇ।", hi: "अनुरोध प्राप्त — स्वीकृति के बाद हम संपर्क करेंगे।" },

  // --- trends ---
  "trends.title": { en: "Suburb trends", zh: "区域走势", ta: "புறநகர் போக்குகள்", gu: "ઉપનગર વલણો", pa: "ਉਪਨਗਰ ਰੁਝਾਨ", hi: "उपनगर रुझान" },
  "trends.introA": { en: "long-term market history", zh: "长期市场历史", ta: "நீண்டகால சந்தை வரலாறு", gu: "લાંબા ગાળાનો બજાર ઇતિહાસ", pa: "ਲੰਮੇ ਸਮੇਂ ਦਾ ਬਾਜ਼ਾਰ ਇਤਿਹਾਸ", hi: "दीर्घकालिक बाज़ार इतिहास" },
  "trends.introB": { en: "our weekly snapshots", zh: "我们的每周快照", ta: "எங்கள் வாராந்திர ஸ்னாப்ஷாட்கள்", gu: "અમારા સાપ્તાહિક સ્નેપશોટ", pa: "ਸਾਡੇ ਹਫ਼ਤਾਵਾਰ ਸਨੈਪਸ਼ਾਟ", hi: "हमारे साप्ताहिक स्नैपशॉट" },
  "trends.intro": { en: "Two views of how a suburb has moved: {a} (years of monthly suburb medians, hover any point for detail), plus {b} (shorter horizon, grows with each upload).", zh: "两种视角看区域走势：{a}（多年逐月区域中位数，悬停任一点查看详情），以及 {b}（时间跨度较短，随每次上传增长）。", ta: "புறநகர் எப்படி நகர்ந்தது என்பதைப் பார்க்க இரண்டு வழிகள்: {a} (ஆண்டுகளின் மாதாந்திர புறநகர் இடைநிலைகள், விவரத்திற்கு எந்த புள்ளியிலும் hover செய்யவும்), மற்றும் {b} (குறுகிய கால அளவு, ஒவ்வொரு பதிவேற்றத்துடன் வளர்கிறது).", gu: "ઉપનગરની ગતિ જોવાની બે રીત: {a} (વર્ષોના માસિક ઉપનગર મધ્યક, વિગત માટે કોઈપણ બિંદુ પર હોવર કરો), અને {b} (ટૂંકી અવધિ, દરેક અપલોડ સાથે વધે છે).", pa: "ਉਪਨਗਰ ਦੀ ਚਾਲ ਵੇਖਣ ਦੇ ਦੋ ਤਰੀਕੇ: {a} (ਸਾਲਾਂ ਦੇ ਮਾਸਿਕ ਉਪਨਗਰ ਮੱਧਮਾਨ, ਵੇਰਵੇ ਲਈ ਕਿਸੇ ਵੀ ਬਿੰਦੂ 'ਤੇ ਹੋਵਰ ਕਰੋ), ਅਤੇ {b} (ਛੋਟੀ ਮਿਆਦ, ਹਰ ਅੱਪਲੋਡ ਨਾਲ ਵਧਦੀ ਹੈ)।", hi: "उपनगर की गति देखने के दो तरीके: {a} (वर्षों के मासिक उपनगर मध्यक, विवरण के लिए किसी भी बिंदु पर होवर करें), और {b} (छोटी अवधि, हर अपलोड के साथ बढ़ती है)।" },
  "trends.suburb": { en: "Suburb", zh: "区域", ta: "புறநகர்", gu: "ઉપનગર", pa: "ਉਪਨਗਰ", hi: "उपनगर" },
  "trends.typeSuburb": { en: "Type a suburb name", zh: "输入区域名称", ta: "புறநகர் பெயரை தட்டச்சு செய்யவும்", gu: "ઉપનગરનું નામ ટાઇપ કરો", pa: "ਉਪਨਗਰ ਦਾ ਨਾਮ ਟਾਈਪ ਕਰੋ", hi: "उपनगर का नाम टाइप करें" },
  "trends.orPick": { en: "or pick:", zh: "或选择：", ta: "அல்லது தேர்ந்தெடு:", gu: "અથવા પસંદ કરો:", pa: "ਜਾਂ ਚੁਣੋ:", hi: "या चुनें:" },
  "trends.loading": { en: "Loading…", zh: "加载中…", ta: "ஏற்றுகிறது…", gu: "લોડ થઈ રહ્યું છે…", pa: "ਲੋਡ ਹੋ ਰਿਹਾ ਹੈ…", hi: "लोड हो रहा है…" },
  "trends.currentAsking": { en: "Current median asking", zh: "当前标价中位数", ta: "தற்போதைய இடைநிலை கேட்கும் விலை", gu: "વર્તમાન મધ્યક માંગ કિંમત", pa: "ਮੌਜੂਦਾ ਮੱਧਮਾਨ ਮੰਗ ਮੁੱਲ", hi: "वर्तमान मध्यक माँगा मूल्य" },
  "trends.liveListings": { en: "Live listings in suburb", zh: "该区在售房源", ta: "புறநகரில் நேரடி பட்டியல்கள்", gu: "ઉપનગરમાં લાઇવ લિસ્ટિંગ", pa: "ਉਪਨਗਰ ਵਿੱਚ ਲਾਈਵ ਲਿਸਟਿੰਗਾਂ", hi: "उपनगर में लाइव लिस्टिंग" },
  "trends.snapshotsSoFar": { en: "Weekly snapshots so far", zh: "至今每周快照数", ta: "இதுவரை வாராந்திர ஸ்னாப்ஷாட்கள்", gu: "અત્યાર સુધી સાપ્તાહિક સ્નેપશોટ", pa: "ਹੁਣ ਤੱਕ ਹਫ਼ਤਾਵਾਰ ਸਨੈਪਸ਼ਾਟ", hi: "अब तक साप्ताहिक स्नैपशॉट" },
  "trends.noLongTerm": { en: "No long-term trend data available for {suburb} (probably means no listings in this suburb carry the trend payload). Try a different suburb.", zh: "暂无 {suburb} 的长期走势数据（可能是该区域没有房源携带走势数据）。请尝试其他区域。", ta: "{suburb} க்கு நீண்டகால போக்கு தரவு எதுவும் இல்லை (இந்த புறநகரின் எந்த பட்டியலிலும் போக்கு தரவு இல்லை என்று அர்த்தம்). வேறு புறநகரை முயற்சிக்கவும்.", gu: "{suburb} માટે કોઈ લાંબા ગાળાનો વલણ ડેટા ઉપલબ્ધ નથી (કદાચ આ ઉપનગરની કોઈ લિસ્ટિંગમાં વલણ ડેટા નથી). કોઈ બીજું ઉપનગર અજમાવો.", pa: "{suburb} ਲਈ ਕੋਈ ਲੰਮੇ ਸਮੇਂ ਦਾ ਰੁਝਾਨ ਡੇਟਾ ਉਪਲਬਧ ਨਹੀਂ (ਸ਼ਾਇਦ ਇਸ ਉਪਨਗਰ ਦੀ ਕਿਸੇ ਲਿਸਟਿੰਗ ਵਿੱਚ ਰੁਝਾਨ ਡੇਟਾ ਨਹੀਂ ਹੈ)। ਕੋਈ ਹੋਰ ਉਪਨਗਰ ਅਜ਼ਮਾਓ।", hi: "{suburb} के लिए कोई दीर्घकालिक रुझान डेटा उपलब्ध नहीं (शायद इस उपनगर की किसी लिस्टिंग में रुझान डेटा नहीं है)। कोई और उपनगर आज़माएँ।" },
  "trends.weeklySnapshots": { en: "Our weekly snapshots", zh: "我们的每周快照", ta: "எங்கள் வாராந்திர ஸ்னாப்ஷாட்கள்", gu: "અમારા સાપ્તાહિક સ્નેપશોટ", pa: "ਸਾਡੇ ਹਫ਼ਤਾਵਾਰ ਸਨੈਪਸ਼ਾਟ", hi: "हमारे साप्ताहिक स्नैपशॉट" },
  "trends.medianAcross": { en: "Median across listings active in {suburb} on each upload date", zh: "每个上传日期在 {suburb} 在售房源的中位数", ta: "ஒவ்வொரு பதிவேற்ற தேதியிலும் {suburb} இல் செயலில் உள்ள பட்டியல்களின் இடைநிலை", gu: "દરેક અપલોડ તારીખે {suburb} માં સક્રિય લિસ્ટિંગનો મધ્યક", pa: "ਹਰ ਅੱਪਲੋਡ ਮਿਤੀ 'ਤੇ {suburb} ਵਿੱਚ ਸਰਗਰਮ ਲਿਸਟਿੰਗਾਂ ਦਾ ਮੱਧਮਾਨ", hi: "प्रत्येक अपलोड तिथि पर {suburb} में सक्रिय लिस्टिंग का मध्यक" },
  "trends.snapshot": { en: "Snapshot", zh: "快照", ta: "ஸ்னாப்ஷாட்", gu: "સ્નેપશોટ", pa: "ਸਨੈਪਸ਼ਾਟ", hi: "स्नैपशॉट" },
  "trends.snapshotN": { en: "{n} snapshot", zh: "{n} 次快照", ta: "{n} ஸ்னாப்ஷாட்", gu: "{n} સ્નેપશોટ", pa: "{n} ਸਨੈਪਸ਼ਾਟ", hi: "{n} स्नैपशॉट" },
  "trends.snapshotNPlural": { en: "{n} snapshots", zh: "{n} 次快照", ta: "{n} ஸ்னாப்ஷாட்கள்", gu: "{n} સ્નેપશોટ", pa: "{n} ਸਨੈਪਸ਼ਾਟ", hi: "{n} स्नैपशॉट" },
  "trends.medianAsking": { en: "Median asking", zh: "标价中位数", ta: "இடைநிலை கேட்கும் விலை", gu: "મધ્યક માંગ કિંમત", pa: "ਮੱਧਮਾਨ ਮੰਗ ਮੁੱਲ", hi: "मध्यक माँगा मूल्य" },
  "trends.medianEstimate": { en: "Median estimate", zh: "估值中位数", ta: "இடைநிலை மதிப்பீடு", gu: "મધ્યક અંદાજ", pa: "ਮੱਧਮਾਨ ਅਨੁਮਾਨ", hi: "मध्यक अनुमान" },
  "trends.listings": { en: "Listings", zh: "房源数", ta: "பட்டியல்கள்", gu: "લિસ્ટિંગ", pa: "ਲਿਸਟਿੰਗਾਂ", hi: "लिस्टिंग" },
  "trends.onlyOne": { en: "Only one weekly snapshot so far. After next week's upload, you'll see how the median has moved here.", zh: "目前仅有一次每周快照。下周上传后，你将看到中位数在此的变化。", ta: "இதுவரை ஒரே ஒரு வாராந்திர ஸ்னாப்ஷாட். அடுத்த வாரப் பதிவேற்றத்திற்குப் பிறகு, இடைநிலை இங்கே எப்படி மாறியது என்பதைப் பார்ப்பீர்கள்.", gu: "અત્યાર સુધી માત્ર એક સાપ્તાહિક સ્નેપશોટ. આવતા અઠવાડિયાના અપલોડ પછી, તમે જોશો કે મધ્યક અહીં કેવી રીતે બદલાયો.", pa: "ਹੁਣ ਤੱਕ ਸਿਰਫ਼ ਇੱਕ ਹਫ਼ਤਾਵਾਰ ਸਨੈਪਸ਼ਾਟ। ਅਗਲੇ ਹਫ਼ਤੇ ਦੇ ਅੱਪਲੋਡ ਬਾਅਦ, ਤੁਸੀਂ ਵੇਖੋਗੇ ਕਿ ਮੱਧਮਾਨ ਇੱਥੇ ਕਿਵੇਂ ਬਦਲਿਆ।", hi: "अब तक केवल एक साप्ताहिक स्नैपशॉट। अगले सप्ताह के अपलोड के बाद, आप देखेंगे कि मध्यक यहाँ कैसे बदला।" },
  "trends.sampleUsed": { en: "Sample property used for the trend data:", zh: "用于走势数据的样本房源：", ta: "போக்கு தரவுக்குப் பயன்படுத்தப்பட்ட மாதிரி சொத்து:", gu: "વલણ ડેટા માટે વપરાયેલી નમૂના મિલકત:", pa: "ਰੁਝਾਨ ਡੇਟਾ ਲਈ ਵਰਤੀ ਗਈ ਨਮੂਨਾ ਜਾਇਦਾਦ:", hi: "रुझान डेटा के लिए उपयोग की गई नमूना संपत्ति:" },

  // --- properties table ---
  "ptable.filter": { en: "Filter by suburb or address…", zh: "按区域或地址筛选…", ta: "புறநகர் அல்லது முகவரியால் வடிகட்டு…", gu: "ઉપનગર કે સરનામાથી ગાળો…", pa: "ਉਪਨਗਰ ਜਾਂ ਪਤੇ ਨਾਲ ਛਾਂਟੋ…", hi: "उपनगर या पते से छाँटें…" },
  "ptable.allTypes": { en: "All types", zh: "全部类型", ta: "அனைத்து வகைகள்", gu: "બધા પ્રકાર", pa: "ਸਾਰੀਆਂ ਕਿਸਮਾਂ", hi: "सभी प्रकार" },
  "ptable.allAreas": { en: "All areas", zh: "全部区域", hi: "सभी क्षेत्र", pa: "ਸਾਰੇ ਖੇਤਰ", gu: "બધા વિસ્તારો", ta: "அனைத்து பகுதிகள்" },
  "ptable.anyBeds": { en: "Any beds", zh: "不限卧室", hi: "कोई भी बेडरूम", pa: "ਕੋਈ ਵੀ ਬੈੱਡਰੂਮ", gu: "કોઈપણ બેડરૂમ", ta: "எந்த படுக்கையறையும்" },
  "ptable.bedsPlus": { en: "{n}+ beds", zh: "{n}+ 卧室", hi: "{n}+ बेडरूम", pa: "{n}+ ਬੈੱਡਰੂਮ", gu: "{n}+ બેડરૂમ", ta: "{n}+ படுக்கையறை" },
  "ptable.anyPrice": { en: "Any price", zh: "不限价格", hi: "कोई भी कीमत", pa: "ਕੋਈ ਵੀ ਕੀਮਤ", gu: "કોઈપણ કિંમત", ta: "எந்த விலையும்" },
  "ptable.underPrice": { en: "Under {v}", zh: "低于 {v}", hi: "{v} से कम", pa: "{v} ਤੋਂ ਘੱਟ", gu: "{v} થી ઓછું", ta: "{v} க்கு கீழ்" },
  "ptable.house": { en: "House", zh: "独立屋", ta: "வீடு", gu: "ઘર", pa: "ਘਰ", hi: "घर" },
  "ptable.townhouse": { en: "Townhouse", zh: "城市屋", ta: "டவுன்ஹவுஸ்", gu: "ટાઉનહાઉસ", pa: "ਟਾਊਨਹਾਊਸ", hi: "टाउनहाउस" },
  "ptable.apartment": { en: "Apartment", zh: "公寓", ta: "அபார்ட்மெண்ட்", gu: "એપાર્ટમેન્ટ", pa: "ਅਪਾਰਟਮੈਂਟ", hi: "अपार्टमेंट" },
  "ptable.section": { en: "Section", zh: "建地", ta: "மனை", gu: "પ્લોટ", pa: "ਪਲਾਟ", hi: "प्लॉट" },
  "ptable.lifestyle": { en: "Lifestyle", zh: "乡村别墅", ta: "லைஃப்ஸ்டைல்", gu: "લાઇફસ્ટાઇલ", pa: "ਲਾਈਫ਼ਸਟਾਈਲ", hi: "लाइफ़स्टाइल" },
  "ptable.terraced": { en: "Terraced house", zh: "排房", hi: "टेरेस हाउस", pa: "ਟੈਰੇਸ ਹਾਊਸ", gu: "ટેરેસ હાઉસ", ta: "வரிசை வீடு" },
  "ptable.commercial": { en: "Commercial", zh: "商业", hi: "वाणिज्यिक", pa: "ਵਪਾਰਕ", gu: "વાણિજ્યિક", ta: "வணிக" },
  "ptable.investment": { en: "Investment", zh: "投资", hi: "निवेश", pa: "ਨਿਵੇਸ਼", gu: "રોકાણ", ta: "முதலீடு" },
  "ptable.carpark": { en: "Carpark", zh: "车位", hi: "कारपार्क", pa: "ਕਾਰਪਾਰਕ", gu: "કારપાર્ક", ta: "கார்பார்க்" },
  "ptable.property": { en: "Property", zh: "房源", ta: "சொத்து", gu: "મિલકત", pa: "ਜਾਇਦਾਦ", hi: "संपत्ति" },
  "ptable.listPrice": { en: "List price", zh: "标价", ta: "பட்டியல் விலை", gu: "યાદી કિંમત", pa: "ਸੂਚੀ ਮੁੱਲ", hi: "सूची मूल्य" },
  "ptable.buyPrice": { en: "Est. buy price", zh: "预估买入价", ta: "வாங்கும் விலை", gu: "ખરીદ ભાવ", pa: "ਖਰੀਦ ਮੁੱਲ", hi: "खरीद मूल्य" },
  "ptable.premium": { en: "Premium", zh: "溢价", ta: "பிரீமியம்", gu: "પ્રીમિયમ", pa: "ਪ੍ਰੀਮੀਅਮ", hi: "प्रीमियम" },
  "ptable.floor": { en: "Floor", zh: "面积", ta: "தளம்", gu: "ફ્લોર", pa: "ਫ਼ਲੋਰ", hi: "फ़्लोर" },
  "ptable.cashflow": { en: "Cashflow", zh: "现金流", ta: "பணப்பாய்வு", gu: "કૅશફ્લો", pa: "ਕੈਸ਼ਫਲੋ", hi: "कैशफ़्लो" },
  "ptable.subdiv": { en: "Subdiv.", zh: "可分割", ta: "உட்பிரிவு", gu: "ઉપવિભાજન", pa: "ਉਪਵੰਡ", hi: "उपविभाजन" },
  "ptable.flags": { en: "Flags", zh: "标记", ta: "குறிகள்", gu: "ચિહ્નો", pa: "ਚਿੰਨ੍ਹ", hi: "चिह्न" },
  "ptable.listed": { en: "Listed", zh: "上架", ta: "பட்டியலிடப்பட்டது", gu: "સૂચિબદ્ધ", pa: "ਸੂਚੀਬੱਧ", hi: "सूचीबद्ध" },
  "ptable.unit": { en: "Unit", zh: "单元房", ta: "யூனிட்", gu: "યુનિટ", pa: "ਯੂਨਿਟ", hi: "यूनिट" },
  "ptable.cashflowPlus": { en: "Cashflow +", zh: "现金流为正", ta: "பணப்பாய்வு +", gu: "કૅશફ્લો +", pa: "ਕੈਸ਼ਫਲੋ +", hi: "कैशफ़्लो +" },
  "ptable.score70": { en: "Score 70+", zh: "评分 70+", ta: "மதிப்பெண் 70+", gu: "સ્કોર 70+", pa: "ਸਕੋਰ 70+", hi: "स्कोर 70+" },
  "ptable.clear": { en: "Clear", zh: "清除", ta: "அழி", gu: "સાફ કરો", pa: "ਸਾਫ਼ ਕਰੋ", hi: "साफ़ करें" },
  "ptable.listingsN": { en: "{n} listings", zh: "{n} 条房源", ta: "{n} பட்டியல்கள்", gu: "{n} લિસ્ટિંગ", pa: "{n} ਲਿਸਟਿੰਗਾਂ", hi: "{n} लिस्टिंग" },
  "ptable.loading": { en: "Loading…", zh: "加载中…", ta: "ஏற்றுகிறது…", gu: "લોડ થઈ રહ્યું છે…", pa: "ਲੋਡ ਹੋ ਰਿਹਾ ਹੈ…", hi: "लोड हो रहा है…" },
  "ptable.noMatch": { en: "No listings match these filters.", zh: "没有符合这些筛选条件的房源。", ta: "இந்த வடிகட்டிகளுக்கு எந்த பட்டியலும் பொருந்தவில்லை.", gu: "આ ફિલ્ટર સાથે કોઈ લિસ્ટિંગ મેળ ખાતી નથી.", pa: "ਇਹਨਾਂ ਫਿਲਟਰਾਂ ਨਾਲ ਕੋਈ ਲਿਸਟਿੰਗ ਮੇਲ ਨਹੀਂ ਖਾਂਦੀ।", hi: "इन फ़िल्टरों से कोई लिस्टिंग मेल नहीं खाती।" },
  "ptable.bd": { en: "Bd", zh: "卧", ta: "படு", gu: "બેડ", pa: "ਬੈੱਡ", hi: "बेड" },
  "ptable.ba": { en: "Ba", zh: "浴", ta: "குளி", gu: "બાથ", pa: "ਬਾਥ", hi: "बाथ" },
  "ptable.land": { en: "Land", zh: "土地", ta: "நிலம்", gu: "જમીન", pa: "ਜ਼ਮੀਨ", hi: "भूमि" },
  "ptable.estValue": { en: "Est. value", zh: "估值", ta: "மதி. மதிப்பு", gu: "અનુ. મૂલ્ય", pa: "ਅਨੁ. ਮੁੱਲ", hi: "अनु. मूल्य" },
  "ptable.marginD": { en: "Margin $", zh: "差价 $", ta: "வித்தியாசம் $", gu: "તફાવત $", pa: "ਅੰਤਰ $", hi: "अंतर $" },
  "ptable.marginPct": { en: "Margin %", zh: "差幅 %", ta: "வித்தியாசம் %", gu: "તફાવત %", pa: "ਅੰਤਰ %", hi: "अंतर %" },
  "ptable.yield": { en: "Yield", zh: "收益率", ta: "வருவாய்", gu: "વળતર", pa: "ਪ੍ਰਤੀਫਲ", hi: "प्रतिफल" },
  "ptable.lots": { en: "Lots", zh: "地块", ta: "மனைகள்", gu: "લોટ", pa: "ਲਾਟ", hi: "लॉट" },
  "ptable.onMkt": { en: "On mkt", zh: "在售天数", ta: "சந்தையில்", gu: "બજારમાં", pa: "ਬਾਜ਼ਾਰ ਵਿੱਚ", hi: "बाज़ार में" },
  "ptable.score": { en: "Score", zh: "评分", ta: "மதிப்பெண்", gu: "સ્કોર", pa: "ਸਕੋਰ", hi: "स्कोर" },
  "ptable.pageOf": { en: "Page {page} of {total}", zh: "第 {page} 页，共 {total} 页", ta: "பக்கம் {page} / {total}", gu: "પાનું {page} / {total}", pa: "ਪੰਨਾ {page} / {total}", hi: "पृष्ठ {page} / {total}" },
  "ptable.first": { en: "« First", zh: "« 首页", ta: "« முதல்", gu: "« પ્રથમ", pa: "« ਪਹਿਲਾ", hi: "« पहला" },
  "ptable.prev": { en: "‹ Prev", zh: "‹ 上一页", ta: "‹ முந்தைய", gu: "‹ પાછલું", pa: "‹ ਪਿਛਲਾ", hi: "‹ पिछला" },
  "ptable.next": { en: "Next ›", zh: "下一页 ›", ta: "அடுத்து ›", gu: "આગલું ›", pa: "ਅਗਲਾ ›", hi: "अगला ›" },
  "ptable.last": { en: "Last »", zh: "末页 »", ta: "கடைசி »", gu: "છેલ્લું »", pa: "ਆਖਰੀ »", hi: "अंतिम »" },
  "ptable.underpriced": { en: "Underpriced", zh: "低于估值", ta: "குறைந்த விலை", gu: "ઓછી કિંમત", pa: "ਘੱਟ ਕੀਮਤ", hi: "कम कीमत" },

  // --- subdivision calc ---
  "subcalc.loading": { en: "Loading…", zh: "加载中…", ta: "ஏற்றுகிறது…", gu: "લોડ થઈ રહ્યું છે…", pa: "ਲੋਡ ਹੋ ਰਿਹਾ ਹੈ…", hi: "लोड हो रहा है…" },
  "subcalc.couldNot": { en: "Could not recalculate", zh: "无法重新计算", ta: "மீண்டும் கணக்கிட முடியவில்லை", gu: "ફરી ગણતરી થઈ શકી નહીં", pa: "ਮੁੜ ਗਣਨਾ ਨਹੀਂ ਹੋ ਸਕੀ", hi: "पुनः गणना नहीं हो सकी" },
  "subcalc.zone": { en: "Zone", zh: "分区", ta: "மண்டலம்", gu: "ઝોન", pa: "ਜ਼ੋਨ", hi: "ज़ोन" },
  "subcalc.minLot": { en: "Min lot size", zh: "最小地块", ta: "குறைந்தபட்ச மனை அளவு", gu: "લઘુતમ લોટ કદ", pa: "ਘੱਟੋ-ਘੱਟ ਲਾਟ ਆਕਾਰ", hi: "न्यूनतम लॉट आकार" },
  "subcalc.additionalLots": { en: "Additional lots", zh: "可增地块", ta: "கூடுதல் மனைகள்", gu: "વધારાના લોટ", pa: "ਵਾਧੂ ਲਾਟ", hi: "अतिरिक्त लॉट" },
  "subcalc.bestStrategy": { en: "Best strategy", zh: "最优策略", ta: "சிறந்த உத்தி", gu: "શ્રેષ્ઠ વ્યૂહરચના", pa: "ਸਭ ਤੋਂ ਵਧੀਆ ਰਣਨੀਤੀ", hi: "सर्वोत्तम रणनीति" },
  "subcalc.bestNetGain": { en: "Best net gain", zh: "最优净收益", ta: "சிறந்த நிகர லாபம்", gu: "શ્રેષ્ઠ ચોખ્ખો લાભ", pa: "ਸਭ ਤੋਂ ਵਧੀਆ ਸ਼ੁੱਧ ਲਾਭ", hi: "सर्वोत्तम शुद्ध लाभ" },
  "subcalc.implausibleTitle": { en: "These numbers don't stack up.", zh: "这些数字不合理。" },
  "subcalc.implausibleBody": { en: "The subdivided sections come out worth far more than the whole site is selling for — a sign the land is priced as one large block, not section-ready land. Treat this as a rough ceiling to verify, not a real gain. It's not counted as an opportunity.", zh: "分割后的地块估值远高于整个物业的售价——说明该地块是按整体大地块定价，而非可即分的成品地。请将此视为需核实的粗略上限，而非真实收益，且不计为机会。" },
  "subcalc.grossSales": { en: "Gross sales", zh: "总销售额", ta: "மொத்த விற்பனை", gu: "કુલ વેચાણ", pa: "ਕੁੱਲ ਵਿਕਰੀ", hi: "सकल बिक्री" },
  "subcalc.lessAcquisition": { en: "Less acquisition cost", zh: "减：收购成本", ta: "கழி கையகப்படுத்தல் செலவு", gu: "બાદ કરો સંપાદન ખર્ચ", pa: "ਘਟਾਓ ਪ੍ਰਾਪਤੀ ਲਾਗਤ", hi: "घटाएँ अधिग्रहण लागत" },
  "subcalc.lessConsent": { en: "Less consent + services", zh: "减：许可 + 基础设施", ta: "கழி அனுமதி + வசதிகள்", gu: "બાદ કરો મંજૂરી + સુવિધાઓ", pa: "ਘਟਾਓ ਮਨਜ਼ੂਰੀ + ਸਹੂਲਤਾਂ", hi: "घटाएँ अनुमति + सुविधाएँ" },
  "subcalc.lessIncidentals": { en: "Less incidentals", zh: "减：杂项费用", ta: "கழி இதர செலவுகள்", gu: "બાદ કરો પરચૂરણ ખર્ચ", pa: "ਘਟਾਓ ਫੁਟਕਲ ਖਰਚ", hi: "घटाएँ प्रासंगिक व्यय" },
  "subcalc.lessPurchase": { en: "Less purchase", zh: "减：购入价", ta: "கழி கொள்முதல்", gu: "બાદ કરો ખરીદી", pa: "ਘਟਾਓ ਖਰੀਦ", hi: "घटाएँ खरीद" },
  "subcalc.lessRealEstate": { en: "Less real-estate cost", zh: "减：中介费用", ta: "கழி ரியல்-எஸ்டேட் செலவு", gu: "બાદ કરો રિયલ-એસ્ટેટ ખર્ચ", pa: "ਘਟਾਓ ਰੀਅਲ-ਇਸਟੇਟ ਲਾਗਤ", hi: "घटाएँ रियल-एस्टेट लागत" },
  "subcalc.netGain": { en: "Net gain", zh: "净收益", ta: "நிகர லாபம்", gu: "ચોખ્ખો લાભ", pa: "ਸ਼ੁੱਧ ਲਾਭ", hi: "शुद्ध लाभ" },
  "subcalc.totalSubdivided": { en: "Total subdivided value", zh: "分割后总价值", ta: "மொத்த உட்பிரிவு மதிப்பு", gu: "કુલ ઉપવિભાજિત મૂલ્ય", pa: "ਕੁੱਲ ਉਪਵੰਡ ਮੁੱਲ", hi: "कुल उपविभाजित मूल्य" },
  "subcalc.acquisitionCost": { en: "Acquisition cost", zh: "收购成本", ta: "கையகப்படுத்தல் செலவு", gu: "સંપાદન ખર્ચ", pa: "ਪ੍ਰਾਪਤੀ ਲਾਗਤ", hi: "अधिग्रहण लागत" },
  "subcalc.buildingsWorth": { en: "Buildings worth", zh: "建筑价值", ta: "கட்டிடங்களின் மதிப்பு", gu: "મકાનોનું મૂલ્ય", pa: "ਇਮਾਰਤਾਂ ਦਾ ਮੁੱਲ", hi: "भवनों का मूल्य" },
  "subcalc.buyPrice": { en: "Buy price", zh: "买入价", ta: "வாங்கும் விலை", gu: "ખરીદ ભાવ", pa: "ਖਰੀਦ ਮੁੱਲ", hi: "खरीद मूल्य" },
  "subcalc.feesPerSection": { en: "Fees per new section", zh: "每块新地块费用", ta: "ஒரு புதிய மனைக்கு கட்டணம்", gu: "પ્રતિ નવો પ્લોટ ફી", pa: "ਪ੍ਰਤੀ ਨਵਾਂ ਪਲਾਟ ਫ਼ੀਸ", hi: "प्रति नए प्लॉट शुल्क" },
  "subcalc.houseResells": { en: "House resells at", zh: "房屋转售价", ta: "வீடு மறுவிற்பனை மதிப்பு", gu: "ઘર પુનર્વેચાણ મૂલ્ય", pa: "ਘਰ ਮੁੜ-ਵਿਕਰੀ ਮੁੱਲ", hi: "घर पुनर्विक्रय मूल्य" },
  "subcalc.incidentalsPerSection": { en: "Incidentals per section", zh: "每块杂项费用", ta: "ஒரு மனைக்கு இதர செலவு", gu: "પ્રતિ પ્લોટ પરચૂરણ ખર્ચ", pa: "ਪ੍ਰਤੀ ਪਲਾਟ ਫੁਟਕਲ ਖਰਚ", hi: "प्रति प्लॉट प्रासंगिक व्यय" },
  "subcalc.rawLandRate": { en: "Raw land rate", zh: "生地单价", ta: "கச்சா நில விகிதம்", gu: "કાચી જમીન દર", pa: "ਕੱਚੀ ਜ਼ਮੀਨ ਦਰ", hi: "कच्ची भूमि दर" },
  "subcalc.sectionRate": { en: "Section rate", zh: "地块单价", ta: "மனை விகிதம்", gu: "પ્લોટ દર", pa: "ਪਲਾਟ ਦਰ", hi: "प्लॉट दर" },
  "subcalc.title": { en: "Subdivision feasibility", zh: "分割可行性", ta: "உட்பிரிவு சாத்தியம்", gu: "ઉપવિભાજન સંભાવના", pa: "ਉਪਵੰਡ ਸੰਭਾਵਨਾ", hi: "उपविभाजन व्यवहार्यता" },
  "subcalc.reset": { en: "Reset to defaults", zh: "恢复默认值", ta: "இயல்புநிலைக்கு மீட்டமை", gu: "ડિફોલ્ટ પર રીસેટ કરો", pa: "ਡਿਫ਼ਾਲਟ 'ਤੇ ਰੀਸੈੱਟ ਕਰੋ", hi: "डिफ़ॉल्ट पर रीसेट करें" },
  "subcalc.councilMarket": { en: "Council → market", zh: "政府估值 → 市场", ta: "கவுன்சில் → சந்தை", gu: "કાઉન્સિલ → બજાર", pa: "ਕੌਂਸਲ → ਬਾਜ਼ਾਰ", hi: "काउंसिल → बाज़ार" },
  "subcalc.subdivRefurb": { en: "Subdivision + refurb", zh: "分割 + 翻新", ta: "உட்பிரிவு + புதுப்பித்தல்", gu: "ઉપવિભાજન + સમારકામ", pa: "ਉਪਵੰਡ + ਮੁਰੰਮਤ", hi: "उपविभाजन + मरम्मत" },
  "subcalc.realEstateCost": { en: "Real-estate cost", zh: "中介费用", ta: "ரியல்-எஸ்டேட் செலவு", gu: "રિયલ-એસ્ટેટ ખર્ચ", pa: "ਰੀਅਲ-ਇਸਟੇਟ ਲਾਗਤ", hi: "रियल-एस्टेट लागत" },
  "subcalc.bestStrategyValue": { en: "Retain house + sell sections", zh: "保留房屋 + 出售地块", ta: "வீட்டை வைத்திரு + மனைகளை விற்", gu: "ઘર રાખો + પ્લોટ વેચો", pa: "ਘਰ ਰੱਖੋ + ਪਲਾਟ ਵੇਚੋ", hi: "घर रखें + प्लॉट बेचें" },
  "subcalc.subdivideStrategyValue": { en: "Subdivide into {n} sections", zh: "分割为 {n} 块地", hi: "{n} भूखंडों में विभाजित करें", pa: "{n} ਪਲਾਟਾਂ ਵਿੱਚ ਵੰਡੋ", gu: "{n} પ્લોટમાં વિભાજિત કરો", ta: "{n} மனைகளாகப் பிரிக்கவும்" },
  "subcalc.modeRetain": { en: "Retain house", zh: "保留房屋", hi: "घर रखें", pa: "ਘਰ ਰੱਖੋ", gu: "ઘર રાખો", ta: "வீட்டை வைத்திரு" },
  "subcalc.modeDemolish": { en: "Demolish & subdivide", zh: "拆除并分割", hi: "गिराकर विभाजित करें", pa: "ਢਾਹ ਕੇ ਵੰਡੋ", gu: "તોડીને વિભાજિત કરો", ta: "இடித்துப் பிரி" },
  "subcalc.demolishStrategyValue": { en: "Demolish & subdivide into {n} sections", zh: "拆除并分割为 {n} 块地", hi: "गिराकर {n} भूखंडों में विभाजित करें", pa: "ਢਾਹ ਕੇ {n} ਪਲਾਟਾਂ ਵਿੱਚ ਵੰਡੋ", gu: "તોડીને {n} પ્લોટમાં વિભાજિત કરો", ta: "இடித்து {n} மனைகளாகப் பிரி" },
  "subcalc.lessDemolition": { en: "Less demolition + works", zh: "减：拆除 + 工程", hi: "घटाएँ ध्वस्तीकरण + कार्य", pa: "ਘਟਾਓ ਢਾਹੁਣ + ਕੰਮ", gu: "બાદ કરો તોડફોડ + કામ", ta: "கழி இடிப்பு + பணிகள்" },
  "subcalc.lessHolding": { en: "Less holding + finance ({years} yr)", zh: "减：持有 + 融资（{years} 年）", hi: "घटाएँ होल्डिंग + वित्त ({years} वर्ष)", pa: "ਘਟਾਓ ਹੋਲਡਿੰਗ + ਵਿੱਤ ({years} ਸਾਲ)", gu: "બાદ કરો હોલ્ડિંગ + ફાઇનાન્સ ({years} વર્ષ)", ta: "கழி வைத்திருப்பு + நிதி ({years} ஆண்டு)" },
  "subcalc.lessContingency": { en: "Less contingency", zh: "减：应急储备", hi: "घटाएँ आकस्मिकता", pa: "ਘਟਾਓ ਸੰਕਟ-ਰਾਖਵਾਂ", gu: "બાદ કરો આકસ્મિક અનામત", ta: "கழி தற்செயல் நிதி" },
  "subcalc.lessGst": { en: "Less GST (net)", zh: "减：GST（净额）", hi: "घटाएँ GST (शुद्ध)", pa: "ਘਟਾਓ GST (ਸ਼ੁੱਧ)", gu: "બાદ કરો GST (ચોખ્ખું)", ta: "கழி GST (நிகர)" },
  "subcalc.buildRate": { en: "Build cost", zh: "建造成本", hi: "निर्माण लागत", pa: "ਉਸਾਰੀ ਲਾਗਤ", gu: "બાંધકામ ખર્ચ", ta: "கட்டுமான செலவு" },
  "subcalc.holdingRate": { en: "Finance rate /yr", zh: "融资年利率", hi: "वित्त दर /वर्ष", pa: "ਵਿੱਤ ਦਰ /ਸਾਲ", gu: "ફાઇનાન્સ દર /વર્ષ", ta: "நிதி விகிதம் /ஆண்டு" },
  "subcalc.holdingYears": { en: "Holding period", zh: "持有年限", hi: "होल्डिंग अवधि", pa: "ਹੋਲਡਿੰਗ ਮਿਆਦ", gu: "હોલ્ડિંગ સમયગાળો", ta: "வைத்திருப்பு காலம்" },
  "subcalc.contingencyRate": { en: "Contingency", zh: "应急储备", hi: "आकस्मिकता", pa: "ਸੰਕਟ-ਰਾਖਵਾਂ", gu: "આકસ્મિક અનામત", ta: "தற்செயல் நிதி" },
  "subcalc.gstRate": { en: "GST rate", zh: "GST 税率", hi: "GST दर", pa: "GST ਦਰ", gu: "GST દર", ta: "GST விகிதம்" },
  "subcalc.houseOnRetained": { en: "House on retained {land}", zh: "保留 {land} 上的房屋", ta: "வைத்திருந்த {land} இல் வீடு", gu: "રાખેલ {land} પર ઘર", pa: "ਰੱਖੇ {land} 'ਤੇ ਘਰ", hi: "रखे गए {land} पर घर" },
  "subcalc.land": { en: "land", zh: "土地", ta: "நிலம்", gu: "જમીન", pa: "ਜ਼ਮੀਨ", hi: "भूमि" },
  "subcalc.newSections": { en: "{n} new sections{rate}", zh: "{n} 块新地块{rate}", ta: "{n} புதிய மனைகள்{rate}", gu: "{n} નવા પ્લોટ{rate}", pa: "{n} ਨਵੇਂ ਪਲਾਟ{rate}", hi: "{n} नए प्लॉट{rate}" },
  "subcalc.adjust": { en: "Adjust the numbers", zh: "调整数值", ta: "எண்களை சரிசெய்", gu: "આંકડા સમાયોજિત કરો", pa: "ਅੰਕੜੇ ਵਿਵਸਥਿਤ ਕਰੋ", hi: "संख्याएँ समायोजित करें" },
  "subcalc.edited": { en: " · edited", zh: " · 已编辑", ta: " · திருத்தப்பட்டது", gu: " · સંપાદિત", pa: " · ਸੰਪਾਦਿਤ", hi: " · संपादित" },
  "subcalc.updating": { en: " · updating…", zh: " · 更新中…", ta: " · புதுப்பிக்கிறது…", gu: " · અપડેટ થઈ રહ્યું છે…", pa: " · ਅੱਪਡੇਟ ਹੋ ਰਿਹਾ ਹੈ…", hi: " · अपडेट हो रहा है…" },
  "subcalc.enterNumber": { en: "Enter a number — e.g. 12000, 12k or 4%", zh: "请输入数字——例如 12000、12k 或 4%", ta: "ஒரு எண்ணை உள்ளிடு — எ.கா. 12000, 12k அல்லது 4%", gu: "એક સંખ્યા દાખલ કરો — જેમ કે 12000, 12k કે 4%", pa: "ਇੱਕ ਸੰਖਿਆ ਦਰਜ ਕਰੋ — ਜਿਵੇਂ 12000, 12k ਜਾਂ 4%", hi: "एक संख्या दर्ज करें — जैसे 12000, 12k या 4%" },
  "subcalc.notSaved": { en: "Your changes apply to this property only and are not saved. Defaults come from the council valuation and the suburb’s sold data.", zh: "你的更改仅适用于此房源，不会被保存。默认值来自政府估值与该区域的成交数据。", ta: "உங்கள் மாற்றங்கள் இந்த சொத்துக்கு மட்டுமே பொருந்தும், சேமிக்கப்படாது. இயல்புநிலைகள் கவுன்சில் மதிப்பீடு மற்றும் புறநகர் விற்பனை தரவிலிருந்து வருகின்றன.", gu: "તમારા ફેરફાર માત્ર આ મિલકત પર લાગુ થાય છે અને સચવાતા નથી. ડિફોલ્ટ કાઉન્સિલ મૂલ્યાંકન અને ઉપનગરના વેચાણ ડેટામાંથી આવે છે.", pa: "ਤੁਹਾਡੇ ਬਦਲਾਅ ਸਿਰਫ਼ ਇਸ ਜਾਇਦਾਦ 'ਤੇ ਲਾਗੂ ਹੁੰਦੇ ਹਨ ਅਤੇ ਸੰਭਾਲੇ ਨਹੀਂ ਜਾਂਦੇ। ਡਿਫ਼ਾਲਟ ਕੌਂਸਲ ਮੁੱਲਾਂਕਣ ਅਤੇ ਉਪਨਗਰ ਦੀ ਵਿਕਰੀ ਡੇਟਾ ਤੋਂ ਆਉਂਦੇ ਹਨ।", hi: "आपके बदलाव केवल इस संपत्ति पर लागू होते हैं और सहेजे नहीं जाते। डिफ़ॉल्ट काउंसिल मूल्यांकन और उपनगर की बिक्री डेटा से आते हैं।" },

  // --- dom / suburb charts ---
  "dom.loading": { en: "Loading market velocity…", zh: "正在加载市场速度…", ta: "சந்தை வேகம் ஏற்றுகிறது…", gu: "બજાર ગતિ લોડ થઈ રહી છે…", pa: "ਬਾਜ਼ਾਰ ਗਤੀ ਲੋਡ ਹੋ ਰਹੀ ਹੈ…", hi: "बाज़ार गति लोड हो रही है…" },
  "dom.couldNot": { en: "Could not load", zh: "无法加载", ta: "ஏற்ற முடியவில்லை", gu: "લોડ થઈ શક્યું નહીં", pa: "ਲੋਡ ਨਹੀਂ ਹੋ ਸਕਿਆ", hi: "लोड नहीं हो सका" },
  "dom.notEnough": { en: "Not enough sales history to plot a trend.", zh: "成交历史不足，无法绘制走势。", ta: "போக்கு வரைய போதுமான விற்பனை வரலாறு இல்லை.", gu: "વલણ દોરવા માટે પૂરતો વેચાણ ઇતિહાસ નથી.", pa: "ਰੁਝਾਨ ਬਣਾਉਣ ਲਈ ਕਾਫ਼ੀ ਵਿਕਰੀ ਇਤਿਹਾਸ ਨਹੀਂ।", hi: "रुझान बनाने के लिए पर्याप्त बिक्री इतिहास नहीं।" },
  "dom.aucklandAvg": { en: "Auckland avg", zh: "奥克兰均值", ta: "ஆக்லாந்து சராசரி", gu: "ઓકલેન્ડ સરેરાશ", pa: "ਆਕਲੈਂਡ ਔਸਤ", hi: "ऑकलैंड औसत" },
  "dom.auckland": { en: "Auckland", zh: "奥克兰", ta: "ஆக்லாந்து", gu: "ઓકલેન્ડ", pa: "ਆਕਲੈਂਡ", hi: "ऑकलैंड" },
  "dom.daysToSell": { en: "days to sell", zh: "天售出", ta: "விற்பனை நாட்கள்", gu: "વેચાણમાં દિવસ", pa: "ਵਿਕਰੀ ਵਿੱਚ ਦਿਨ", hi: "बिक्री में दिन" },
  "dom.medianToSellIn": { en: "median to sell in {suburb}", zh: "{suburb} 售出中位数", ta: "{suburb} இல் விற்பனை இடைநிலை", gu: "{suburb} માં વેચાણનો મધ્યક", pa: "{suburb} ਵਿੱਚ ਵਿਕਰੀ ਦਾ ਮੱਧਮਾਨ", hi: "{suburb} में बिक्री का मध्यक" },
  "dom.medianToSellAk": { en: "median to sell across Auckland", zh: "全奥克兰售出中位数", ta: "ஆக்லாந்து முழுவதும் விற்பனை இடைநிலை", gu: "પૂરા ઓકલેન્ડમાં વેચાણનો મધ્યક", pa: "ਪੂਰੇ ਆਕਲੈਂਡ ਵਿੱਚ ਵਿਕਰੀ ਦਾ ਮੱਧਮਾਨ", hi: "पूरे ऑकलैंड में बिक्री का मध्यक" },
  "dom.faster": { en: "faster than the prior quarter", zh: "快于上一季度", ta: "முந்தைய காலாண்டை விட வேகம்", gu: "ગયા ત્રિમાસિકથી ઝડપી", pa: "ਪਿਛਲੀ ਤਿਮਾਹੀ ਤੋਂ ਤੇਜ਼", hi: "पिछली तिमाही से तेज़" },
  "dom.slower": { en: "slower than the prior quarter", zh: "慢于上一季度", ta: "முந்தைய காலாண்டை விட மெதுவு", gu: "ગયા ત્રિમાસિકથી ધીમું", pa: "ਪਿਛਲੀ ਤਿਮਾਹੀ ਤੋਂ ਹੌਲੀ", hi: "पिछली तिमाही से धीमा" },
  "dom.daysUnit": { en: "days", zh: "天", ta: "நாட்கள்", gu: "દિવસ", pa: "ਦਿਨ", hi: "दिन" },
  "dom.salesCount": { en: "{n} sales", zh: "{n} 宗成交", ta: "{n} விற்பனைகள்", gu: "{n} વેચાણ", pa: "{n} ਵਿਕਰੀਆਂ", hi: "{n} बिक्री" },
  "dom.akMedianDays": { en: "Auckland median {n} days", zh: "奥克兰中位数 {n} 天", ta: "ஆக்லாந்து இடைநிலை {n} நாட்கள்", gu: "ઓકલેન્ડ મધ્યક {n} દિવસ", pa: "ਆਕਲੈਂਡ ਮੱਧਮਾਨ {n} ਦਿਨ", hi: "ऑकलैंड मध्यक {n} दिन" },
  "dom.onlySales": { en: "only {n} sales", zh: "仅 {n} 宗成交", ta: "{n} விற்பனைகள் மட்டுமே", gu: "માત્ર {n} વેચાણ", pa: "ਸਿਰਫ਼ {n} ਵਿਕਰੀਆਂ", hi: "केवल {n} बिक्री" },
  "dom.hollowNote": { en: "Hollow points are months with fewer than 15 sales — too few to read as a trend.", zh: "空心点表示成交少于 15 宗的月份——数量太少，不足以视为趋势。", ta: "வெற்று புள்ளிகள் 15 க்கும் குறைவான விற்பனைகள் உள்ள மாதங்கள் — போக்காகக் கருத மிகக் குறைவு.", gu: "પોલા બિંદુ એ મહિનાના છે જેમાં 15 થી ઓછી વેચાણ થઈ — વલણ ગણવા માટે બહુ ઓછું.", pa: "ਖੋਖਲੇ ਬਿੰਦੂ ਉਹਨਾਂ ਮਹੀਨਿਆਂ ਦੇ ਹਨ ਜਿਨ੍ਹਾਂ ਵਿੱਚ 15 ਤੋਂ ਘੱਟ ਵਿਕਰੀਆਂ ਹੋਈਆਂ — ਰੁਝਾਨ ਮੰਨਣ ਲਈ ਬਹੁਤ ਘੱਟ।", hi: "खोखले बिंदु उन महीनों के हैं जिनमें 15 से कम बिक्री हुई — रुझान मानने के लिए बहुत कम।" },
  "strend.change": { en: "Change", zh: "变化", ta: "மாற்றம்", gu: "ફેરફાર", pa: "ਤਬਦੀਲੀ", hi: "बदलाव" },
  "strend.medianSale": { en: "Median sale", zh: "成交中位数", ta: "இடைநிலை விற்பனை", gu: "મધ્યક વેચાણ", pa: "ਮੱਧਮਾਨ ਵਿਕਰੀ", hi: "मध्यक बिक्री" },
  "strend.sales": { en: "Sales", zh: "成交量", ta: "விற்பனைகள்", gu: "વેચાણ", pa: "ਵਿਕਰੀਆਂ", hi: "बिक्री" },
  "strend.title": { en: "{suburb} — median sale price trend", zh: "{suburb} — 成交价中位数走势", ta: "{suburb} — இடைநிலை விற்பனை விலை போக்கு", gu: "{suburb} — મધ્યક વેચાણ કિંમત વલણ", pa: "{suburb} — ਮੱਧਮਾਨ ਵਿਕਰੀ ਮੁੱਲ ਰੁਝਾਨ", hi: "{suburb} — मध्यक बिक्री मूल्य रुझान" },
  "strend.yearly": { en: "Yearly ({n})", zh: "按年 ({n})", ta: "ஆண்டு ({n})", gu: "વાર્ષિક ({n})", pa: "ਸਾਲਾਨਾ ({n})", hi: "वार्षिक ({n})" },
  "strend.monthly": { en: "Monthly ({n})", zh: "按月 ({n})", ta: "மாதம் ({n})", gu: "માસિક ({n})", pa: "ਮਾਸਿਕ ({n})", hi: "मासिक ({n})" },
  "strend.source": { en: "Source: long-term suburb-level aggregates · hover any point for detail", zh: "来源：长期区域级汇总 · 悬停任一点查看详情", ta: "மூலம்: நீண்டகால புறநகர்-நிலை தொகுப்புகள் · விவரத்திற்கு எந்த புள்ளியிலும் hover செய்யவும்", gu: "સ્રોત: લાંબા ગાળાના ઉપનગર-સ્તરીય સમુચ્ચય · વિગત માટે કોઈપણ બિંદુ પર હોવર કરો", pa: "ਸਰੋਤ: ਲੰਮੇ ਸਮੇਂ ਦੇ ਉਪਨਗਰ-ਪੱਧਰੀ ਸਮੁੱਚ · ਵੇਰਵੇ ਲਈ ਕਿਸੇ ਵੀ ਬਿੰਦੂ 'ਤੇ ਹੋਵਰ ਕਰੋ", hi: "स्रोत: दीर्घकालिक उपनगर-स्तरीय समुच्चय · विवरण के लिए किसी भी बिंदु पर होवर करें" },

  // --- admin: shared ---
  "adm.name": { en: "Name", zh: "姓名", ta: "பெயர்", gu: "નામ", pa: "ਨਾਮ", hi: "नाम" },
  "adm.company": { en: "Company", zh: "公司", ta: "நிறுவனம்", gu: "કંપની", pa: "ਕੰਪਨੀ", hi: "कंपनी" },
  "adm.email": { en: "Email", zh: "邮箱", ta: "மின்னஞ்சல்", gu: "ઈમેલ", pa: "ਈਮੇਲ", hi: "ईमेल" },
  "adm.phone": { en: "Phone", zh: "电话", ta: "தொலைபேசி", gu: "ફોન", pa: "ਫ਼ੋਨ", hi: "फ़ोन" },
  "adm.role": { en: "Role", zh: "角色", ta: "பங்கு", gu: "ભૂમિકા", pa: "ਭੂਮਿਕਾ", hi: "भूमिका" },
  "adm.status": { en: "Status", zh: "状态", ta: "நிலை", gu: "સ્થિતિ", pa: "ਸਥਿਤੀ", hi: "स्थिति" },
  "adm.action": { en: "Action", zh: "操作", ta: "நடவடிக்கை", gu: "ક્રિયા", pa: "ਕਾਰਵਾਈ", hi: "कार्रवाई" },
  // admin: pending
  "adm.pendingTitle": { en: "Pending users", zh: "待审核用户", ta: "நிலுவை பயனர்கள்", gu: "બાકી વપરાશકર્તાઓ", pa: "ਬਕਾਇਆ ਵਰਤੋਂਕਾਰ", hi: "लंबित उपयोगकर्ता" },
  "adm.pendingSub": { en: "{n} new sign-up waiting for approval.", zh: "{n} 个新注册等待审核。", ta: "{n} புதிய பதிவு அனுமதிக்காக காத்திருக்கிறது.", gu: "{n} નવો સાઇન-અપ મંજૂરીની રાહમાં.", pa: "{n} ਨਵਾਂ ਸਾਈਨ-ਅੱਪ ਮਨਜ਼ੂਰੀ ਦੀ ਉਡੀਕ ਵਿੱਚ।", hi: "{n} नया साइन-अप स्वीकृति की प्रतीक्षा में।" },
  "adm.pendingSubPlural": { en: "{n} new sign-ups waiting for approval.", zh: "{n} 个新注册等待审核。", ta: "{n} புதிய பதிவுகள் அனுமதிக்காக காத்திருக்கின்றன.", gu: "{n} નવા સાઇન-અપ મંજૂરીની રાહમાં.", pa: "{n} ਨਵੇਂ ਸਾਈਨ-ਅੱਪ ਮਨਜ਼ੂਰੀ ਦੀ ਉਡੀਕ ਵਿੱਚ।", hi: "{n} नए साइन-अप स्वीकृति की प्रतीक्षा में।" },
  "adm.pendingBadge": { en: "{n} pending", zh: "{n} 待审核", ta: "{n} நிலுவை", gu: "{n} બાકી", pa: "{n} ਬਕਾਇਆ", hi: "{n} लंबित" },
  "adm.noPending": { en: "No pending users.", zh: "没有待审核用户。", ta: "நிலுவை பயனர்கள் இல்லை.", gu: "કોઈ બાકી વપરાશકર્તા નથી.", pa: "ਕੋਈ ਬਕਾਇਆ ਵਰਤੋਂਕਾਰ ਨਹੀਂ।", hi: "कोई लंबित उपयोगकर्ता नहीं।" },
  "adm.reject": { en: "Reject", zh: "拒绝", ta: "நிராகரி", gu: "નકારો", pa: "ਰੱਦ ਕਰੋ", hi: "अस्वीकार करें" },
  "adm.approve": { en: "Approve", zh: "批准", ta: "அனுமதி", gu: "મંજૂર કરો", pa: "ਮਨਜ਼ੂਰ ਕਰੋ", hi: "स्वीकृत करें" },
  // admin: users
  "adm.allUsers": { en: "All users", zh: "全部用户", ta: "அனைத்து பயனர்கள்", gu: "બધા વપરાશકર્તાઓ", pa: "ਸਾਰੇ ਵਰਤੋਂਕਾਰ", hi: "सभी उपयोगकर्ता" },
  "adm.usersSub": { en: "{total} accounts · {active} active", zh: "{total} 个账号 · {active} 个已激活", ta: "{total} கணக்குகள் · {active} செயலில்", gu: "{total} ખાતા · {active} સક્રિય", pa: "{total} ਖਾਤੇ · {active} ਸਰਗਰਮ", hi: "{total} खाते · {active} सक्रिय" },
  "adm.searchUsers": { en: "Search users…", zh: "搜索用户…", ta: "பயனர்களை தேடு…", gu: "વપરાશકર્તા શોધો…", pa: "ਵਰਤੋਂਕਾਰ ਖੋਜੋ…", hi: "उपयोगकर्ता खोजें…" },
  "adm.deactivate": { en: "Deactivate", zh: "停用", ta: "செயலிழக்கச் செய்", gu: "નિષ્ક્રિય કરો", pa: "ਅਯੋਗ ਕਰੋ", hi: "निष्क्रिय करें" },
  "adm.reactivate": { en: "Reactivate", zh: "重新激活", ta: "மீண்டும் செயல்படுத்து", gu: "ફરી સક્રિય કરો", pa: "ਮੁੜ ਸਰਗਰਮ ਕਰੋ", hi: "पुनः सक्रिय करें" },
  "adm.statusApproved": { en: "approved", zh: "已批准", ta: "அனுமதிக்கப்பட்டது", gu: "મંજૂર", pa: "ਮਨਜ਼ੂਰ", hi: "स्वीकृत" },
  "adm.statusPending": { en: "pending", zh: "待审核", ta: "நிலுவை", gu: "બાકી", pa: "ਬਕਾਇਆ", hi: "लंबित" },
  "adm.statusRejected": { en: "rejected", zh: "已拒绝", ta: "நிராகரிக்கப்பட்டது", gu: "નકારેલ", pa: "ਰੱਦ", hi: "अस्वीकृत" },
  "adm.statusDeactivated": { en: "deactivated", zh: "已停用", ta: "செயலிழந்தது", gu: "નિષ્ક્રિય", pa: "ਅਯੋਗ", hi: "निष्क्रिय" },
  "adm.roleAdmin": { en: "admin", zh: "管理员", ta: "நிர்வாகி", gu: "એડમિન", pa: "ਐਡਮਿਨ", hi: "एडमिन" },
  "adm.roleUser": { en: "user", zh: "用户", ta: "பயனர்", gu: "વપરાશકર્તા", pa: "ਵਰਤੋਂਕਾਰ", hi: "उपयोगकर्ता" },
  "adm.addUser": { en: "Add user", zh: "添加用户", ta: "பயனரைச் சேர்", gu: "વપરાશકર્તા ઉમેરો", pa: "ਵਰਤੋਂਕਾਰ ਜੋੜੋ", hi: "उपयोगकर्ता जोड़ें" },
  "adm.cancel": { en: "Cancel", zh: "取消", ta: "ரத்து செய்", gu: "રદ કરો", pa: "ਰੱਦ ਕਰੋ", hi: "रद्द करें" },
  "adm.password": { en: "Password", zh: "密码", ta: "கடவுச்சொல்", gu: "પાસવર્ડ", pa: "ਪਾਸਵਰਡ", hi: "पासवर्ड" },
  "adm.passwordHint": { en: "At least 8 characters", zh: "至少 8 个字符", ta: "குறைந்தது 8 எழுத்துகள்", gu: "ઓછામાં ઓછા 8 અક્ષરો", pa: "ਘੱਟੋ-ਘੱਟ 8 ਅੱਖਰ", hi: "कम से कम 8 अक्षर" },
  "adm.createUser": { en: "Create user", zh: "创建用户", ta: "பயனரை உருவாக்கு", gu: "વપરાશકર્તા બનાવો", pa: "ਵਰਤੋਂਕਾਰ ਬਣਾਓ", hi: "उपयोगकर्ता बनाएँ" },
  "adm.creating": { en: "Creating…", zh: "创建中…", ta: "உருவாக்குகிறது…", gu: "બનાવી રહ્યું છે…", pa: "ਬਣਾ ਰਿਹਾ ਹੈ…", hi: "बना रहा है…" },
  "adm.addUserNote": { en: "The user is active immediately and can sign in with this password.", zh: "用户立即激活，可使用此密码登录。", ta: "பயனர் உடனடியாக செயலில் இருப்பார், இந்த கடவுச்சொல்லுடன் உள்நுழையலாம்.", gu: "વપરાશકર્તા તરત જ સક્રિય થાય છે અને આ પાસવર્ડથી સાઇન ઇન કરી શકે છે.", pa: "ਵਰਤੋਂਕਾਰ ਤੁਰੰਤ ਸਰਗਰਮ ਹੋ ਜਾਂਦਾ ਹੈ ਅਤੇ ਇਸ ਪਾਸਵਰਡ ਨਾਲ ਸਾਈਨ ਇਨ ਕਰ ਸਕਦਾ ਹੈ।", hi: "उपयोगकर्ता तुरंत सक्रिय हो जाता है और इस पासवर्ड से साइन इन कर सकता है।" },
  // admin: compare
  "adm.compareTitle": { en: "Compare weekly batches", zh: "对比每周批次", ta: "வாராந்திர தொகுதி ஒப்பீடு", gu: "સાપ્તાહિક બેચ સરખામણી", pa: "ਹਫ਼ਤਾਵਾਰ ਬੈਚ ਤੁਲਨਾ", hi: "साप्ताहिक बैच तुलना" },
  "adm.compareSub": { en: "See what changed between two weekly snapshots — listings added, removed, and the biggest price movers.", zh: "查看两次每周快照之间的变化——新增、下架房源及最大价格波动。", ta: "இரண்டு வாராந்திர ஸ்னாப்ஷாட்களுக்கு இடையே என்ன மாறியது என்பதைப் பாருங்கள் — சேர்க்கப்பட்ட, அகற்றப்பட்ட பட்டியல்கள், மற்றும் மிகப்பெரிய விலை மாற்றங்கள்.", gu: "જુઓ કે બે સાપ્તાહિક સ્નેપશોટ વચ્ચે શું બદલાયું — ઉમેરાયેલી, દૂર કરાયેલી લિસ્ટિંગ, અને સૌથી મોટા કિંમત ફેરફાર.", pa: "ਵੇਖੋ ਕਿ ਦੋ ਹਫ਼ਤਾਵਾਰ ਸਨੈਪਸ਼ਾਟ ਵਿਚਕਾਰ ਕੀ ਬਦਲਿਆ — ਜੋੜੀਆਂ, ਹਟਾਈਆਂ ਲਿਸਟਿੰਗਾਂ, ਅਤੇ ਸਭ ਤੋਂ ਵੱਡੇ ਮੁੱਲ ਬਦਲਾਅ।", hi: "देखें कि दो साप्ताहिक स्नैपशॉट के बीच क्या बदला — जोड़ी गई, हटाई गई लिस्टिंग, और सबसे बड़े मूल्य परिवर्तन।" },
  "adm.needTwo": { en: "You need at least 2 weekly snapshots to compare. Currently you have {n}. Upload again next week to unlock this view.", zh: "至少需要 2 次每周快照才能对比。目前你有 {n} 次。下周再次上传即可解锁此视图。", ta: "ஒப்பிட குறைந்தது 2 வாராந்திர ஸ்னாப்ஷாட்கள் தேவை. இப்போது உங்களிடம் {n} உள்ளன. இந்த காட்சியைத் திறக்க அடுத்த வாரம் மீண்டும் பதிவேற்றவும்.", gu: "સરખામણી માટે ઓછામાં ઓછા 2 સાપ્તાહિક સ્નેપશોટ જોઈએ. અત્યારે તમારી પાસે {n} છે. આ દૃશ્ય અનલોક કરવા આવતા અઠવાડિયે ફરી અપલોડ કરો.", pa: "ਤੁਲਨਾ ਲਈ ਘੱਟੋ-ਘੱਟ 2 ਹਫ਼ਤਾਵਾਰ ਸਨੈਪਸ਼ਾਟ ਚਾਹੀਦੇ ਹਨ। ਹੁਣ ਤੁਹਾਡੇ ਕੋਲ {n} ਹਨ। ਇਸ ਦ੍ਰਿਸ਼ ਨੂੰ ਅਨਲਾਕ ਕਰਨ ਲਈ ਅਗਲੇ ਹਫ਼ਤੇ ਫਿਰ ਅੱਪਲੋਡ ਕਰੋ।", hi: "तुलना के लिए कम से कम 2 साप्ताहिक स्नैपशॉट चाहिए। अभी आपके पास {n} हैं। इस दृश्य को अनलॉक करने के लिए अगले सप्ताह फिर अपलोड करें।" },
  "adm.olderBatch": { en: "Older batch", zh: "较早批次", ta: "பழைய தொகுதி", gu: "જૂનો બેચ", pa: "ਪੁਰਾਣਾ ਬੈਚ", hi: "पुराना बैच" },
  "adm.newerBatch": { en: "Newer batch", zh: "较新批次", ta: "புதிய தொகுதி", gu: "નવો બેચ", pa: "ਨਵਾਂ ਬੈਚ", hi: "नया बैच" },
  "adm.rowsN": { en: "{n} rows", zh: "{n} 行", ta: "{n} வரிசைகள்", gu: "{n} પંક્તિઓ", pa: "{n} ਕਤਾਰਾਂ", hi: "{n} पंक्तियाँ" },
  "adm.calculating": { en: "Calculating…", zh: "计算中…", ta: "கணக்கிடுகிறது…", gu: "ગણતરી થઈ રહી છે…", pa: "ਗਣਨਾ ਹੋ ਰਹੀ ਹੈ…", hi: "गणना हो रही है…" },
  "adm.rowsAdded": { en: "Rows added", zh: "新增行", ta: "சேர்க்கப்பட்ட வரிசைகள்", gu: "ઉમેરાયેલી પંક્તિઓ", pa: "ਜੋੜੀਆਂ ਕਤਾਰਾਂ", hi: "जोड़ी गई पंक्तियाँ" },
  "adm.rowsRemoved": { en: "Rows removed", zh: "移除行", ta: "அகற்றப்பட்ட வரிசைகள்", gu: "દૂર કરાયેલી પંક્તિઓ", pa: "ਹਟਾਈਆਂ ਕਤਾਰਾਂ", hi: "हटाई गई पंक्तियाँ" },
  "adm.stillOnMarket": { en: "Still on market", zh: "仍在售", ta: "இன்னும் சந்தையில்", gu: "હજુ બજારમાં", pa: "ਅਜੇ ਵੀ ਬਾਜ਼ਾਰ ਵਿੱਚ", hi: "अब भी बाज़ार में" },
  "adm.medianAskingChange": { en: "Median asking change", zh: "标价中位数变化", ta: "இடைநிலை கேட்கும் விலை மாற்றம்", gu: "મધ્યક માંગ કિંમતમાં ફેરફાર", pa: "ਮੱਧਮਾਨ ਮੰਗ ਮੁੱਲ ਵਿੱਚ ਤਬਦੀਲੀ", hi: "मध्यक माँगे मूल्य में बदलाव" },
  "adm.medianEstChange": { en: "Median estimate change", zh: "估值中位数变化", ta: "இடைநிலை மதிப்பீடு மாற்றம்", gu: "મધ્યક અંદાજમાં ફેરફાર", pa: "ਮੱਧਮਾਨ ਅਨੁਮਾਨ ਵਿੱਚ ਤਬਦੀਲੀ", hi: "मध्यक अनुमान में बदलाव" },
  "adm.top10Drops": { en: "Top 10 price drops", zh: "降价前 10", ta: "முதல் 10 விலை வீழ்ச்சிகள்", gu: "ટોચના 10 કિંમત ઘટાડા", pa: "ਸਿਖਰਲੀਆਂ 10 ਕੀਮਤ ਗਿਰਾਵਟਾਂ", hi: "शीर्ष 10 कीमत गिरावट" },
  "adm.top10Rises": { en: "Top 10 price rises", zh: "涨价前 10", ta: "முதல் 10 விலை உயர்வுகள்", gu: "ટોચના 10 કિંમત વધારા", pa: "ਸਿਖਰਲੇ 10 ਕੀਮਤ ਵਾਧੇ", hi: "शीर्ष 10 कीमत वृद्धि" },
  "adm.noMovers": { en: "No movers.", zh: "无变动。", ta: "மாற்றங்கள் இல்லை.", gu: "કોઈ ફેરફાર નથી.", pa: "ਕੋਈ ਤਬਦੀਲੀ ਨਹੀਂ।", hi: "कोई परिवर्तन नहीं।" },
  "adm.property": { en: "Property", zh: "房源", ta: "சொத்து", gu: "મિલકત", pa: "ਜਾਇਦਾਦ", hi: "संपत्ति" },
  "adm.was": { en: "Was", zh: "原价", ta: "முன்பு", gu: "પહેલા", pa: "ਪਹਿਲਾਂ", hi: "पहले" },
  "adm.now": { en: "Now", zh: "现价", ta: "இப்போது", gu: "હવે", pa: "ਹੁਣ", hi: "अब" },
  // admin: upload
  "adm.uploadTitle": { en: "Weekly data upload", zh: "每周数据上传", ta: "வாராந்திர தரவு பதிவேற்றம்", gu: "સાપ્તાહિક ડેટા અપલોડ", pa: "ਹਫ਼ਤਾਵਾਰ ਡੇਟਾ ਅੱਪਲੋਡ", hi: "साप्ताहिक डेटा अपलोड" },
  "adm.uploadSub": { en: "Drop in the latest scrapes. Files are saved to the server and processed in the background — you can leave this page open or come back later, the import keeps running. The pricing pipeline runs server-side.", zh: "放入最新抓取数据。文件将保存到服务器并在后台处理——你可以保持此页面打开或稍后返回，导入会持续进行。定价流程在服务器端运行。", ta: "சமீபத்திய ஸ்க்ரேப்புகளை இடுங்கள். கோப்புகள் சர்வரில் சேமிக்கப்பட்டு பின்னணியில் செயலாக்கப்படுகின்றன — இந்த பக்கத்தைத் திறந்து வைக்கலாம் அல்லது பின்னர் திரும்பலாம், இறக்குமதி தொடர்ந்து இயங்குகிறது. விலை பைப்லைன் சர்வரில் இயங்குகிறது.", gu: "નવીનતમ સ્ક્રેપ મૂકો. ફાઇલો સર્વર પર સચવાય છે અને પૃષ્ઠભૂમિમાં પ્રોસેસ થાય છે — તમે આ પાનું ખુલ્લું રાખી શકો કે પછી પાછા આવી શકો, આયાત ચાલુ રહે છે. કિંમત પાઇપલાઇન સર્વર પર ચાલે છે.", pa: "ਨਵੀਨਤਮ ਸਕ੍ਰੈਪ ਪਾਓ। ਫਾਈਲਾਂ ਸਰਵਰ 'ਤੇ ਸੰਭਾਲੀਆਂ ਜਾਂਦੀਆਂ ਹਨ ਅਤੇ ਪਿਛੋਕੜ ਵਿੱਚ ਪ੍ਰੋਸੈੱਸ ਹੁੰਦੀਆਂ ਹਨ — ਤੁਸੀਂ ਇਹ ਪੰਨਾ ਖੁੱਲ੍ਹਾ ਛੱਡ ਸਕਦੇ ਹੋ ਜਾਂ ਬਾਅਦ ਵਿੱਚ ਵਾਪਸ ਆ ਸਕਦੇ ਹੋ, ਆਯਾਤ ਚੱਲਦਾ ਰਹਿੰਦਾ ਹੈ। ਮੁੱਲ ਪਾਈਪਲਾਈਨ ਸਰਵਰ 'ਤੇ ਚੱਲਦੀ ਹੈ।", hi: "नवीनतम स्क्रैप डालें। फ़ाइलें सर्वर पर सहेजी जाती हैं और पृष्ठभूमि में संसाधित होती हैं — आप यह पृष्ठ खुला छोड़ सकते हैं या बाद में लौट सकते हैं, आयात चलता रहता है। मूल्य पाइपलाइन सर्वर पर चलती है।" },
  "adm.forSale": { en: "For Sale", zh: "在售", ta: "விற்பனைக்கு", gu: "વેચાણ માટે", pa: "ਵਿਕਰੀ ਲਈ", hi: "बिक्री हेतु" },
  "adm.sold": { en: "Sold", zh: "成交", ta: "விற்றது", gu: "વેચાયું", pa: "ਵਿਕਿਆ", hi: "बिका" },
  "adm.rent": { en: "Rent", zh: "租赁", ta: "வாடகை", gu: "ભાડું", pa: "ਕਿਰਾਇਆ", hi: "किराया" },
  "adm.forSaleHint": { en: "For-sale scrape CSV — runs the pricing pipeline", zh: "在售抓取 CSV——运行定价流程", ta: "விற்பனைக்கு ஸ்க்ரேப் CSV — விலை பைப்லைனை இயக்குகிறது", gu: "વેચાણ-માટે સ્ક્રેપ CSV — કિંમત પાઇપલાઇન ચલાવે છે", pa: "ਵਿਕਰੀ-ਲਈ ਸਕ੍ਰੈਪ CSV — ਮੁੱਲ ਪਾਈਪਲਾਈਨ ਚਲਾਉਂਦਾ ਹੈ", hi: "बिक्री-हेतु स्क्रैप CSV — मूल्य पाइपलाइन चलाता है" },
  "adm.soldHint": { en: "Sold-records CSV — provides recent-sales context", zh: "成交记录 CSV——提供近期成交参考", ta: "விற்பனை-பதிவு CSV — சமீபத்திய விற்பனை சூழலை வழங்குகிறது", gu: "વેચાણ-રેકોર્ડ CSV — તાજેતરની વેચાણ સંદર્ભ આપે છે", pa: "ਵਿਕਰੀ-ਰਿਕਾਰਡ CSV — ਹਾਲੀਆ ਵਿਕਰੀ ਸੰਦਰਭ ਦਿੰਦਾ ਹੈ", hi: "बिक्री-रिकॉर्ड CSV — हाल की बिक्री का संदर्भ देता है" },
  "adm.rentHint": { en: "Rental scrape CSV — drives yield estimates", zh: "租赁抓取 CSV——用于收益率估算", ta: "வாடகை ஸ்க்ரேப் CSV — வருவாய் மதிப்பீட்டை இயக்குகிறது", gu: "ભાડું સ્ક્રેપ CSV — વળતર અંદાજ ચલાવે છે", pa: "ਕਿਰਾਇਆ ਸਕ੍ਰੈਪ CSV — ਪ੍ਰਤੀਫਲ ਅਨੁਮਾਨ ਚਲਾਉਂਦਾ ਹੈ", hi: "किराया स्क्रैप CSV — प्रतिफल अनुमान चलाता है" },
  "adm.uploadFailed": { en: "Upload failed", zh: "上传失败", ta: "பதிவேற்றம் தோல்வி", gu: "અપલોડ નિષ્ફળ", pa: "ਅੱਪਲੋਡ ਅਸਫਲ", hi: "अपलोड विफल" },
  "adm.uploading": { en: "Uploading…", zh: "上传中…", ta: "பதிவேற்றுகிறது…", gu: "અપલોડ થઈ રહ્યું છે…", pa: "ਅੱਪਲੋਡ ਹੋ ਰਿਹਾ ਹੈ…", hi: "अपलोड हो रहा है…" },
  "adm.importToDb": { en: "Import to database", zh: "导入数据库", ta: "தரவுத்தளத்தில் இறக்குமதி செய்", gu: "ડેટાબેઝમાં આયાત કરો", pa: "ਡੇਟਾਬੇਸ ਵਿੱਚ ਆਯਾਤ ਕਰੋ", hi: "डेटाबेस में आयात करें" },
  "adm.activeJobs": { en: "Active jobs", zh: "进行中的任务", ta: "செயலில் பணிகள்", gu: "સક્રિય કાર્યો", pa: "ਸਰਗਰਮ ਕੰਮ", hi: "सक्रिय कार्य" },
  "adm.importHistory": { en: "Import history", zh: "导入历史", ta: "இறக்குமதி வரலாறு", gu: "આયાત ઇતિહાસ", pa: "ਆਯਾਤ ਇਤਿਹਾਸ", hi: "आयात इतिहास" },
  "adm.activeBatchNote": { en: "Active batch is what users see on the Database page.", zh: "活动批次即用户在数据库页面所见内容。", ta: "செயலில் தொகுதி என்பது பயனர்கள் தரவுத்தள பக்கத்தில் பார்ப்பது.", gu: "સક્રિય બેચ એ જ છે જે વપરાશકર્તા ડેટાબેઝ પાના પર જુએ છે.", pa: "ਸਰਗਰਮ ਬੈਚ ਉਹੀ ਹੈ ਜੋ ਵਰਤੋਂਕਾਰ ਡੇਟਾਬੇਸ ਪੰਨੇ 'ਤੇ ਵੇਖਦੇ ਹਨ।", hi: "सक्रिय बैच वही है जो उपयोगकर्ता डेटाबेस पृष्ठ पर देखते हैं।" },
  "adm.batch": { en: "Batch", zh: "批次", ta: "தொகுதி", gu: "બેચ", pa: "ਬੈਚ", hi: "बैच" },
  "adm.type": { en: "Type", zh: "类型", ta: "வகை", gu: "પ્રકાર", pa: "ਕਿਸਮ", hi: "प्रकार" },
  "adm.filename": { en: "Filename", zh: "文件名", ta: "கோப்பு பெயர்", gu: "ફાઇલ નામ", pa: "ਫਾਈਲ ਨਾਮ", hi: "फ़ाइल नाम" },
  "adm.rows": { en: "Rows", zh: "行数", ta: "வரிசைகள்", gu: "પંક્તિઓ", pa: "ਕਤਾਰਾਂ", hi: "पंक्तियाँ" },
  "adm.uploaded": { en: "Uploaded", zh: "上传时间", ta: "பதிவேற்றப்பட்டது", gu: "અપલોડ કર્યું", pa: "ਅੱਪਲੋਡ ਕੀਤਾ", hi: "अपलोड किया गया" },
  "adm.active": { en: "active", zh: "活动", ta: "செயலில்", gu: "સક્રિય", pa: "ਸਰਗਰਮ", hi: "सक्रिय" },
  "adm.archived": { en: "archived", zh: "已归档", ta: "காப்பகப்படுத்தப்பட்டது", gu: "સંગ્રહિત", pa: "ਪੁਰਾਲੇਖਬੱਧ", hi: "संग्रहीत" },
  "adm.dropCsv": { en: "Drop CSV or click to choose", zh: "拖入 CSV 或点击选择", ta: "CSV இடு அல்லது தேர்ந்தெடுக்க கிளிக் செய்", gu: "CSV મૂકો કે પસંદ કરવા ક્લિક કરો", pa: "CSV ਪਾਓ ਜਾਂ ਚੁਣਨ ਲਈ ਕਲਿੱਕ ਕਰੋ", hi: "CSV डालें या चुनने के लिए क्लिक करें" },
  "adm.clickReplace": { en: "{size} MB · click to replace", zh: "{size} MB · 点击替换", ta: "{size} MB · மாற்ற கிளிக் செய்", gu: "{size} MB · બદલવા ક્લિક કરો", pa: "{size} MB · ਬਦਲਣ ਲਈ ਕਲਿੱਕ ਕਰੋ", hi: "{size} MB · बदलने के लिए क्लिक करें" },
  "adm.sectionRatesTitle": { en: "Section $/m² rates (derived from sold data)", zh: "地块 $/m² 单价（源自成交数据）", ta: "மனை $/m² விகிதங்கள் (விற்பனை தரவிலிருந்து பெறப்பட்டது)", gu: "પ્લોટ $/m² દર (વેચાણ ડેટામાંથી મેળવેલ)", pa: "ਪਲਾਟ $/m² ਦਰਾਂ (ਵਿਕਰੀ ਡੇਟਾ ਤੋਂ ਪ੍ਰਾਪਤ)", hi: "प्लॉट $/m² दरें (बिक्री डेटा से व्युत्पन्न)" },
  "adm.sectionRatesUsed": { en: "Used for subdivision profit · default {rate}", zh: "用于分割利润 · 默认 {rate}", ta: "உட்பிரிவு லாபத்திற்கு · இயல்பு {rate}", gu: "ઉપવિભાજન લાભ માટે · ડિફોલ્ટ {rate}", pa: "ਉਪਵੰਡ ਲਾਭ ਲਈ · ਡਿਫ਼ਾਲਟ {rate}", hi: "उपविभाजन लाभ के लिए · डिफ़ॉल्ट {rate}" },
  "adm.sectionRatesSuburbs": { en: " · {n} suburbs", zh: " · {n} 个区域", ta: " · {n} புறநகர்", gu: " · {n} ઉપનગર", pa: " · {n} ਉਪਨਗਰ", hi: " · {n} उपनगर" },
  "adm.sectionRatesNote": { en: "Computed automatically from each sold upload — council land value ÷ land area, median per suburb. No manual table to maintain. Review the numbers below; they refresh whenever you upload fresh sold data.", zh: "每次成交上传后自动计算——政府土地估值 ÷ 土地面积，按区域取中位数。无需手动维护表格。请查看下方数值；每次上传新的成交数据时都会刷新。", ta: "ஒவ்வொரு விற்பனை பதிவேற்றத்திலிருந்தும் தானாகக் கணக்கிடப்படுகிறது — கவுன்சில் நில மதிப்பு ÷ நில பரப்பு, ஒரு புறநகருக்கு இடைநிலை. கைமுறை அட்டவணை பராமரிக்க தேவையில்லை. கீழே எண்களைப் பாருங்கள்; நீங்கள் புதிய விற்பனை தரவைப் பதிவேற்றும் போதெல்லாம் அவை புதுப்பிக்கப்படுகின்றன.", gu: "દરેક વેચાણ અપલોડથી આપોઆપ ગણતરી — કાઉન્સિલ જમીન મૂલ્ય ÷ જમીન ક્ષેત્ર, પ્રતિ ઉપનગર મધ્યક. કોઈ મેન્યુઅલ કોષ્ટક જાળવવાની જરૂર નથી. નીચે આંકડા જુઓ; જ્યારે પણ તમે નવો વેચાણ ડેટા અપલોડ કરો છો તે તાજા થાય છે.", pa: "ਹਰ ਵਿਕਰੀ ਅੱਪਲੋਡ ਤੋਂ ਆਪਣੇ ਆਪ ਗਣਨਾ — ਕੌਂਸਲ ਜ਼ਮੀਨ ਮੁੱਲ ÷ ਜ਼ਮੀਨ ਖੇਤਰ, ਪ੍ਰਤੀ ਉਪਨਗਰ ਮੱਧਮਾਨ। ਕੋਈ ਦਸਤੀ ਸਾਰਣੀ ਬਣਾਈ ਰੱਖਣ ਦੀ ਲੋੜ ਨਹੀਂ। ਹੇਠਾਂ ਅੰਕੜੇ ਵੇਖੋ; ਜਦੋਂ ਵੀ ਤੁਸੀਂ ਨਵਾਂ ਵਿਕਰੀ ਡੇਟਾ ਅੱਪਲੋਡ ਕਰਦੇ ਹੋ ਇਹ ਤਾਜ਼ਾ ਹੋ ਜਾਂਦੇ ਹਨ।", hi: "हर बिक्री अपलोड से स्वतः गणना — काउंसिल भूमि मूल्य ÷ भूमि क्षेत्र, प्रति उपनगर मध्यक। कोई मैनुअल तालिका बनाए रखने की ज़रूरत नहीं। नीचे संख्याएँ देखें; जब भी आप नया बिक्री डेटा अपलोड करते हैं वे ताज़ा हो जाती हैं।" },
  "adm.showRates": { en: "Show all {n} suburb rates", zh: "显示全部 {n} 个区域单价", ta: "அனைத்து {n} புறநகர் விகிதங்களைக் காட்டு", gu: "બધા {n} ઉપનગર દર બતાવો", pa: "ਸਾਰੀਆਂ {n} ਉਪਨਗਰ ਦਰਾਂ ਦਿਖਾਓ", hi: "सभी {n} उपनगर दरें दिखाएँ" },
  "adm.hideRates": { en: "Hide all {n} suburb rates", zh: "隐藏全部 {n} 个区域单价", ta: "அனைத்து {n} புறநகர் விகிதங்களை மறை", gu: "બધા {n} ઉપનગર દર છુપાવો", pa: "ਸਾਰੀਆਂ {n} ਉਪਨਗਰ ਦਰਾਂ ਲੁਕਾਓ", hi: "सभी {n} उपनगर दरें छिपाएँ" },
  "adm.jobId": { en: "job #{id}", zh: "任务 #{id}", ta: "பணி #{id}", gu: "કાર્ય #{id}", pa: "ਕੰਮ #{id}", hi: "कार्य #{id}" },
  "adm.queued": { en: "queued", zh: "排队中", ta: "வரிசையில்", gu: "કતારમાં", pa: "ਕਤਾਰ ਵਿੱਚ", hi: "कतार में" },
  "adm.rowsInserted": { en: "{n} rows inserted", zh: "已插入 {n} 行", ta: "{n} வரிசைகள் சேர்க்கப்பட்டன", gu: "{n} પંક્તિઓ ઉમેરાઈ", pa: "{n} ਕਤਾਰਾਂ ਜੋੜੀਆਂ", hi: "{n} पंक्तियाँ जोड़ी गईं" },
  "adm.rejectedN": { en: " · {n} rejected", zh: " · {n} 行被拒", ta: " · {n} நிராகரிக்கப்பட்டது", gu: " · {n} નકારેલ", pa: " · {n} ਰੱਦ", hi: " · {n} अस्वीकृत" },
  "adm.batchN": { en: " · batch #{id}", zh: " · 批次 #{id}", ta: " · தொகுதி #{id}", gu: " · બેચ #{id}", pa: " · ਬੈਚ #{id}", hi: " · बैच #{id}" },
  "adm.failed": { en: "Failed", zh: "失败", ta: "தோல்வி", gu: "નિષ્ફળ", pa: "ਅਸਫਲ", hi: "विफल" },
  "adm.warningsN": { en: "{n} audit warning detected", zh: "检测到 {n} 条审计警告", ta: "{n} தணிக்கை எச்சரிக்கை கண்டறியப்பட்டது", gu: "{n} ઓડિટ ચેતવણી મળી", pa: "{n} ਆਡਿਟ ਚੇਤਾਵਨੀ ਮਿਲੀ", hi: "{n} ऑडिट चेतावनी मिली" },
  "adm.warningsNPlural": { en: "{n} audit warnings detected", zh: "检测到 {n} 条审计警告", ta: "{n} தணிக்கை எச்சரிக்கைகள் கண்டறியப்பட்டன", gu: "{n} ઓડિટ ચેતવણીઓ મળી", pa: "{n} ਆਡਿਟ ਚੇਤਾਵਨੀਆਂ ਮਿਲੀਆਂ", hi: "{n} ऑडिट चेतावनियाँ मिलीं" },
  "adm.highSeverity": { en: " · {n} high severity", zh: " · {n} 条高严重性", ta: " · {n} உயர் தீவிரம்", gu: " · {n} ઊંચી ગંભીરતા", pa: " · {n} ਉੱਚ ਗੰਭੀਰਤਾ", hi: " · {n} उच्च गंभीरता" },
  "adm.rowWord": { en: "row", zh: "行", ta: "வரிசை", gu: "પંક્તિ", pa: "ਕਤਾਰ", hi: "पंक्ति" },
  "adm.rowsWord": { en: "rows", zh: "行", ta: "வரிசைகள்", gu: "પંક્તિઓ", pa: "ਕਤਾਰਾਂ", hi: "पंक्तियाँ" },
  "adm.samples": { en: "Samples:", zh: "样本：", ta: "மாதிரிகள்:", gu: "નમૂના:", pa: "ਨਮੂਨੇ:", hi: "नमूने:" },

  // --- value-add (property page) ---
  "va.title": { en: "What adds value", zh: "什么能增值", ta: "எது மதிப்பு சேர்க்கிறது", gu: "શું મૂલ્ય ઉમેરે છે", pa: "ਕੀ ਮੁੱਲ ਜੋੜਦਾ ਹੈ", hi: "क्या मूल्य जोड़ता है" },
  "va.sub": { en: "Measured against sold houses of the same floor area in this area — so these are the value of the feature, not of a bigger house.", zh: "以本区同等建筑面积的成交房屋为基准——衡量的是该特征本身的价值，而非更大房屋的价值。", ta: "இந்த பகுதியில் ஒரே தள பரப்பு விற்கப்பட்ட வீடுகளுடன் அளவிடப்பட்டது — எனவே இவை பெரிய வீட்டின் அல்ல, அந்த அம்சத்தின் மதிப்பு.", gu: "આ વિસ્તારમાં સમાન ફ્લોર ક્ષેત્રની વેચાયેલી મિલકતો સાથે તુલના — તેથી આ મોટા ઘરનું નહીં, પણ તે વિશેષતાનું મૂલ્ય છે.", pa: "ਇਸ ਖੇਤਰ ਵਿੱਚ ਸਮਾਨ ਫ਼ਲੋਰ ਖੇਤਰ ਦੀਆਂ ਵਿਕੀਆਂ ਜਾਇਦਾਦਾਂ ਨਾਲ ਤੁਲਨਾ — ਇਸ ਲਈ ਇਹ ਵੱਡੇ ਘਰ ਦਾ ਨਹੀਂ, ਸਗੋਂ ਉਸ ਵਿਸ਼ੇਸ਼ਤਾ ਦਾ ਮੁੱਲ ਹਨ।", hi: "इस क्षेत्र में समान फ़्लोर क्षेत्र की बिकी संपत्तियों से तुलना — तो ये बड़े घर का नहीं, बल्कि उस विशेषता का मूल्य हैं।" },
  "va.observedGap": { en: "OBSERVED GAP · NOT A RENOVATION ESTIMATE", zh: "观察差值 · 非装修估算", ta: "கண்டறிந்த வித்தியாசம் · புதுப்பித்தல் மதிப்பீடு அல்ல", gu: "અવલોકિત તફાવત · નવીનીકરણ અંદાજ નહીં", pa: "ਵੇਖਿਆ ਅੰਤਰ · ਨਵੀਨੀਕਰਨ ਅਨੁਮਾਨ ਨਹੀਂ", hi: "देखा गया अंतर · नवीनीकरण अनुमान नहीं" },
  "va.comparisonN": { en: "{n} comparison · {scope}", zh: "{n} 项对比 · {scope}", ta: "{n} ஒப்பீடு · {scope}", gu: "{n} તુલના · {scope}", pa: "{n} ਤੁਲਨਾ · {scope}", hi: "{n} तुलना · {scope}" },
  "va.comparisonNPlural": { en: "{n} comparisons · {scope}", zh: "{n} 项对比 · {scope}", ta: "{n} ஒப்பீடுகள் · {scope}", gu: "{n} તુલનાઓ · {scope}", pa: "{n} ਤੁਲਨਾਵਾਂ · {scope}", hi: "{n} तुलनाएँ · {scope}" },
  "va.tooFew": { en: " · too few to rely on", zh: " · 数量太少，不足采信", ta: " · நம்புவதற்கு மிகக் குறைவு", gu: " · ભરોસા માટે બહુ ઓછું", pa: " · ਭਰੋਸੇ ਲਈ ਬਹੁਤ ਘੱਟ", hi: " · भरोसे के लिए बहुत कम" },
  "va.noValueAdd": { en: "No value add", zh: "无增值", hi: "कोई मूल्य वृद्धि नहीं", pa: "ਕੋਈ ਮੁੱਲ ਵਾਧਾ ਨਹੀਂ", gu: "કોઈ મૂલ્ય વૃદ્ધિ નહીં", ta: "மதிப்பு கூடுதல் இல்லை" },
  "va.note": { en: "Uplift on resale value only — it does not net off what the work costs. Compare each figure against a builder's quote before committing. Auckland-wide a third bathroom measures at 0%, so more is not automatically better.", zh: "仅为转售增值——未扣除施工成本。决定前请将每项数据与施工报价对比。全奥克兰范围内第三间浴室增值为 0%，故并非越多越好。", ta: "மதிப்பு உயர்வு மறுவிற்பனை மதிப்பு மட்டுமே — இது வேலையின் செலவை கழிக்காது. உறுதி செய்யும் முன் ஒவ்வொரு எண்ணையும் பில்டரின் மேற்கோளுடன் ஒப்பிடுங்கள். ஆக்லாந்து முழுவதும் மூன்றாவது குளியலறை 0% அளவிடப்படுகிறது, எனவே அதிகம் இருப்பது தானாகச் சிறந்ததல்ல.", gu: "મૂલ્ય વધારો માત્ર પુનર્વેચાણ મૂલ્ય પર — તે કામની કિંમત બાદ કરતું નથી. પ્રતિબદ્ધ થતા પહેલા દરેક આંકડાની તુલના બિલ્ડરના ક્વોટેશન સાથે કરો. પૂરા ઓકલેન્ડમાં ત્રીજો બાથરૂમ 0% મપાય છે, તેથી વધુ હોવું આપોઆપ સારું નથી.", pa: "ਮੁੱਲ ਵਾਧਾ ਸਿਰਫ਼ ਮੁੜ-ਵਿਕਰੀ ਮੁੱਲ 'ਤੇ — ਇਹ ਕੰਮ ਦੀ ਲਾਗਤ ਨਹੀਂ ਘਟਾਉਂਦਾ। ਵਚਨਬੱਧ ਹੋਣ ਤੋਂ ਪਹਿਲਾਂ ਹਰ ਅੰਕੜੇ ਦੀ ਤੁਲਨਾ ਬਿਲਡਰ ਦੇ ਕੋਟੇਸ਼ਨ ਨਾਲ ਕਰੋ। ਪੂਰੇ ਆਕਲੈਂਡ ਵਿੱਚ ਤੀਜਾ ਬਾਥਰੂਮ 0% ਮਾਪਿਆ ਜਾਂਦਾ ਹੈ, ਇਸ ਲਈ ਵੱਧ ਹੋਣਾ ਆਪਣੇ ਆਪ ਬਿਹਤਰ ਨਹੀਂ।", hi: "मूल्य वृद्धि केवल पुनर्विक्रय मूल्य पर — यह काम की लागत नहीं घटाती। प्रतिबद्ध होने से पहले हर आँकड़े की तुलना बिल्डर के कोटेशन से करें। पूरे ऑकलैंड में तीसरा बाथरूम 0% मापा जाता है, इसलिए अधिक होना स्वतः बेहतर नहीं।" },
  "va.addBedroom": { en: "Add a {n}th bedroom", zh: "增加第 {n} 间卧室", ta: "{n}வது படுக்கையறை சேர்", gu: "{n}મો બેડરૂમ ઉમેરો", pa: "{n}ਵਾਂ ਬੈੱਡਰੂਮ ਜੋੜੋ", hi: "{n}वाँ बेडरूम जोड़ें" },
  "va.addBathroom": { en: "Add a {n}th bathroom", zh: "增加第 {n} 间浴室", ta: "{n}வது குளியலறை சேர்", gu: "{n}મો બાથરૂમ ઉમેરો", pa: "{n}ਵਾਂ ਬਾਥਰੂਮ ਜੋੜੋ", hi: "{n}वाँ बाथरूम जोड़ें" },
  "va.poolLabel": { en: "Houses here with a pool sell for", zh: "本区带泳池的房屋售价高出", ta: "இங்கே குளம் உள்ள வீடுகள் விற்கின்றன", gu: "અહીં પૂલવાળા ઘર વેચાય છે", pa: "ਇੱਥੇ ਪੂਲ ਵਾਲੇ ਘਰ ਵਿਕਦੇ ਹਨ", hi: "यहाँ पूल वाले घर बिकते हैं" },
  "va.scopeSuburb": { en: "suburb", zh: "本社区", ta: "புறநகர்", gu: "ઉપનગર", pa: "ਉਪਨਗਰ", hi: "उपनगर" },
  "va.scopeDistrict": { en: "district", zh: "本区域", ta: "மாவட்டம்", gu: "જિલ્લો", pa: "ਜ਼ਿਲ੍ਹਾ", hi: "ज़िला" },
  "va.scopeAuckland": { en: "auckland", zh: "全奥克兰", ta: "ஆக்லாந்து", gu: "ઓકલેન્ડ", pa: "ਆਕਲੈਂਡ", hi: "ऑकलैंड" },
  "va.caveatBathroom": { en: "Measured at 0% Auckland-wide — a third bathroom does not pay for itself.", zh: "全奥克兰范围内测得为 0%——第三间浴室无法收回成本。", ta: "ஆக்லாந்து முழுவதும் 0% அளவிடப்பட்டது — மூன்றாவது குளியலறை அதன் செலவை ஈடுகட்டாது.", gu: "પૂરા ઓકલેન્ડમાં 0% મપાયું — ત્રીજો બાથરૂમ પોતાની કિંમત વસૂલ કરતો નથી.", pa: "ਪੂਰੇ ਆਕਲੈਂਡ ਵਿੱਚ 0% ਮਾਪਿਆ — ਤੀਜਾ ਬਾਥਰੂਮ ਆਪਣੀ ਲਾਗਤ ਵਸੂਲ ਨਹੀਂ ਕਰਦਾ।", hi: "पूरे ऑकलैंड में 0% मापा गया — तीसरा बाथरूम अपनी लागत वसूल नहीं करता।" },
  "va.caveatPool": { en: "This is the gap between houses that have a pool and houses that don't — not what building one would return. It survives controls for size, bedrooms and land, so it is measuring the calibre of house that has a pool. Do not read it as a renovation payback.", zh: "这是有泳池与无泳池房屋之间的差值——并非建造泳池的回报。在控制面积、卧室与土地后依然成立，故衡量的是拥有泳池房屋的档次。请勿将其解读为装修回本。", ta: "இது குளம் உள்ள வீடுகளுக்கும் இல்லாத வீடுகளுக்கும் இடையிலான வித்தியாசம் — ஒன்றைக் கட்டினால் என்ன திரும்பும் என்பதல்ல. இது அளவு, படுக்கையறை மற்றும் நிலக் கட்டுப்பாடுகளுக்குப் பிறகும் நிலைக்கிறது, எனவே இது குளம் உள்ள வீட்டின் தரத்தை அளவிடுகிறது. இதை புதுப்பித்தல் ஈடாக கருதாதீர்கள்.", gu: "આ તે ઘરો વચ્ચેનો તફાવત છે જેમની પાસે પૂલ છે અને જેમની પાસે નથી — એ નહીં કે એક બનાવવાથી શું પાછું મળશે. તે કદ, બેડરૂમ અને જમીનના નિયંત્રણ પછી પણ ટકે છે, તેથી તે પૂલવાળા ઘરના સ્તરને માપે છે. તેને નવીનીકરણની વસૂલી ન સમજો.", pa: "ਇਹ ਉਹਨਾਂ ਘਰਾਂ ਵਿਚਕਾਰ ਅੰਤਰ ਹੈ ਜਿਨ੍ਹਾਂ ਕੋਲ ਪੂਲ ਹੈ ਅਤੇ ਜਿਨ੍ਹਾਂ ਕੋਲ ਨਹੀਂ — ਇਹ ਨਹੀਂ ਕਿ ਇੱਕ ਬਣਾਉਣ 'ਤੇ ਕੀ ਵਾਪਸ ਮਿਲੇਗਾ। ਇਹ ਆਕਾਰ, ਬੈੱਡਰੂਮ ਅਤੇ ਜ਼ਮੀਨ ਦੇ ਨਿਯੰਤਰਣ ਬਾਅਦ ਵੀ ਟਿਕਦਾ ਹੈ, ਇਸ ਲਈ ਇਹ ਪੂਲ ਵਾਲੇ ਘਰ ਦੇ ਪੱਧਰ ਨੂੰ ਮਾਪ ਰਿਹਾ ਹੈ। ਇਸ ਨੂੰ ਨਵੀਨੀਕਰਨ ਦੀ ਵਸੂਲੀ ਨਾ ਸਮਝੋ।", hi: "यह उन घरों के बीच का अंतर है जिनमें पूल है और जिनमें नहीं — यह नहीं कि एक बनाने पर क्या लौटेगा। यह आकार, बेडरूम और भूमि के नियंत्रण के बाद भी टिकता है, इसलिए यह पूल वाले घर के स्तर को माप रहा है। इसे नवीनीकरण की वसूली न समझें।" },

  // --- property page (remaining) ---
  "prop.notFound": { en: "Not found", zh: "未找到", ta: "கிடைக்கவில்லை", gu: "મળ્યું નહીં", pa: "ਨਹੀਂ ਮਿਲਿਆ", hi: "नहीं मिला" },
  "prop.confidenceSuffix": { en: "{conf} confidence · {n} comps", zh: "{conf}置信度 · {n} 个可比", ta: "{conf} நம்பிக்கை · {n} ஒப்பீடு", gu: "{conf} વિશ્વાસ · {n} તુલના", pa: "{conf} ਭਰੋਸਾ · {n} ਤੁਲਨਾ", hi: "{conf} विश्वास · {n} तुलना" },
  "prop.confHigh": { en: "high", zh: "高", ta: "உயர்", gu: "ઊંચો", pa: "ਉੱਚ", hi: "उच्च" },
  "prop.confMedium": { en: "medium", zh: "中", ta: "நடுத்தர", gu: "મધ્યમ", pa: "ਮੱਧਮ", hi: "मध्यम" },
  "prop.confLow": { en: "low", zh: "低", ta: "குறைந்த", gu: "નીચો", pa: "ਘੱਟ", hi: "निम्न" },
  "prop.belowValue": { en: "↓ Below our value", zh: "↓ 低于我们的估值", ta: "↓ எங்கள் மதிப்புக்குக் கீழே", gu: "↓ અમારા મૂલ્યથી ઓછું", pa: "↓ ਸਾਡੇ ਮੁੱਲ ਤੋਂ ਘੱਟ", hi: "↓ हमारे मूल्य से कम" },
  "prop.cashflowPositive": { en: "+ Cashflow positive", zh: "+ 现金流为正", ta: "+ பணப்பாய்வு நேர்மறை", gu: "+ કૅશફ્લો હકારાત્મક", pa: "+ ਕੈਸ਼ਫਲੋ ਸਕਾਰਾਤਮਕ", hi: "+ कैशफ़्लो सकारात्मक" },
  "prop.subdivUpside": { en: "↗ Subdivision upside", zh: "↗ 分割潜力", ta: "↗ உட்பிரிவு சாத்தியம்", gu: "↗ ઉપવિભાજન સંભાવના", pa: "↗ ਉਪਵੰਡ ਸੰਭਾਵਨਾ", hi: "↗ उपविभाजन संभावना" },
  "prop.lots": { en: "+{n} lots", zh: "+{n} 块地", ta: "+{n} மனைகள்", gu: "+{n} લોટ", pa: "+{n} ਲਾਟ", hi: "+{n} लॉट" },
  "prop.clickFullSize": { en: "Click to view full size", zh: "点击查看大图", ta: "முழு அளவைப் பார்க்க கிளிக் செய்", gu: "પૂરું કદ જોવા ક્લિક કરો", pa: "ਪੂਰਾ ਆਕਾਰ ਵੇਖਣ ਲਈ ਕਲਿੱਕ ਕਰੋ", hi: "पूर्ण आकार देखने के लिए क्लिक करें" },
  "prop.dShort": { en: "{n} d", zh: "{n} 天", ta: "{n} நா", gu: "{n} દિ", pa: "{n} ਦਿ", hi: "{n} दि" },
  "prop.daysUnit": { en: "{n} days", zh: "{n} 天", ta: "{n} நாட்கள்", gu: "{n} દિવસ", pa: "{n} ਦਿਨ", hi: "{n} दिन" },
  "prop.buyPriceBasedOn": { en: "Buy price based on {basis}", zh: "买入价基于{basis}", ta: "வாங்கும் விலை {basis} அடிப்படையில்", gu: "ખરીદ ભાવ {basis} પર આધારિત", pa: "ਖਰੀਦ ਮੁੱਲ {basis} 'ਤੇ ਆਧਾਰਿਤ", hi: "खरीद मूल्य {basis} पर आधारित" },
  "prop.compsNearby": { en: "{n} recent comparable sale nearby", zh: "附近 {n} 宗近期可比成交", ta: "அருகில் {n} சமீபத்திய ஒப்பீட்டு விற்பனை", gu: "નજીક {n} તાજેતરની તુલનાત્મક વેચાણ", pa: "ਨੇੜੇ {n} ਹਾਲੀਆ ਤੁਲਨਾਤਮਕ ਵਿਕਰੀ", hi: "पास {n} हाल की तुलनात्मक बिक्री" },
  "prop.compsNearbyPlural": { en: "{n} recent comparable sales nearby", zh: "附近 {n} 宗近期可比成交", ta: "அருகில் {n} சமீபத்திய ஒப்பீட்டு விற்பனைகள்", gu: "નજીક {n} તાજેતરની તુલનાત્મક વેચાણ", pa: "ਨੇੜੇ {n} ਹਾਲੀਆ ਤੁਲਨਾਤਮਕ ਵਿਕਰੀਆਂ", hi: "पास {n} हाल की तुलनात्मक बिक्री" },
  "prop.noComps": { en: "our valuation (no close comparable sales found)", zh: "我们的估值（未找到相近可比成交）", ta: "எங்கள் மதிப்பீடு (அருகில் ஒப்பீட்டு விற்பனை எதுவும் கிடைக்கவில்லை)", gu: "અમારું મૂલ્યાંકન (કોઈ નજીકની તુલનાત્મક વેચાણ મળી નથી)", pa: "ਸਾਡਾ ਮੁੱਲਾਂਕਣ (ਕੋਈ ਨੇੜਲੀ ਤੁਲਨਾਤਮਕ ਵਿਕਰੀ ਨਹੀਂ ਮਿਲੀ)", hi: "हमारा मूल्यांकन (कोई निकट तुलनात्मक बिक्री नहीं मिली)" },
  "prop.yes": { en: "Yes", zh: "是", ta: "ஆம்", gu: "હા", pa: "ਹਾਂ", hi: "हाँ" },
  "prop.newConstruction": { en: "New construction", zh: "新建", ta: "புதிய கட்டுமானம்", gu: "નવું બાંધકામ", pa: "ਨਵਾਂ ਨਿਰਮਾਣ", hi: "नया निर्माण" },
  "prop.coastalWaterfront": { en: "Coastal / waterfront", zh: "海岸 / 临水", ta: "கடலோர / நீர்முகப்பு", gu: "દરિયાકાંઠો / જળકાંઠો", pa: "ਤੱਟੀ / ਪਾਣੀ-ਕਿਨਾਰਾ", hi: "तटीय / जलतट" },
  "prop.parcelCaption": { en: "{suburb} · {area} parcel", zh: "{suburb} · {area} 地块", ta: "{suburb} · {area} மனை", gu: "{suburb} · {area} પ્લોટ", pa: "{suburb} · {area} ਪਲਾਟ", hi: "{suburb} · {area} प्लॉट" },
  "prop.colBd": { en: "BD", zh: "卧", ta: "படு", gu: "બેડ", pa: "ਬੈੱਡ", hi: "बेड" },
  "prop.colBa": { en: "BA", zh: "浴", ta: "குளி", gu: "બાથ", pa: "ਬਾਥ", hi: "बाथ" },
  "prop.colCv": { en: "CV", zh: "政府估价", ta: "CV", gu: "CV", pa: "CV", hi: "CV" },
  "prop.askingVsCv": { en: "This listing's asking price vs CV", zh: "本房源标价对比政府估价", ta: "CV உடன் இந்த பட்டியலின் கேட்கும் விலை", gu: "CV સામે આ લિસ્ટિંગની માંગ કિંમત", pa: "CV ਦੇ ਮੁਕਾਬਲੇ ਇਸ ਲਿਸਟਿੰਗ ਦਾ ਮੰਗ ਮੁੱਲ", hi: "CV की तुलना में इस लिस्टिंग का माँगा मूल्य" },
  "prop.daysToSellMedian": { en: "Days to sell — median ({n} sales)", zh: "售出天数——中位数（{n} 宗成交）", ta: "விற்பனை நாட்கள் — இடைநிலை ({n} விற்பனைகள்)", gu: "વેચાણમાં દિવસ — મધ્યક ({n} વેચાણ)", pa: "ਵਿਕਰੀ ਵਿੱਚ ਦਿਨ — ਮੱਧਮਾਨ ({n} ਵਿਕਰੀਆਂ)", hi: "बिक्री में दिन — मध्यक ({n} बिक्री)" },
  "prop.methodSale": { en: "{method} — {n} sale", zh: "{method} — {n} 宗成交", ta: "{method} — {n} விற்பனை", gu: "{method} — {n} વેચાણ", pa: "{method} — {n} ਵਿਕਰੀ", hi: "{method} — {n} बिक्री" },
  "prop.methodSalePlural": { en: "{method} — {n} sales", zh: "{method} — {n} 宗成交", ta: "{method} — {n} விற்பனைகள்", gu: "{method} — {n} વેચાણ", pa: "{method} — {n} ਵਿਕਰੀਆਂ", hi: "{method} — {n} बिक्री" },
  "prop.methodThin": { en: " (too few to rely on)", zh: "（数量太少，不足采信）", ta: " (நம்புவதற்கு மிகக் குறைவு)", gu: " (ભરોસા માટે બહુ ઓછું)", pa: " (ਭਰੋਸੇ ਲਈ ਬਹੁਤ ਘੱਟ)", hi: " (भरोसे के लिए बहुत कम)" },
  "prop.methodAuction": { en: "Auction", zh: "拍卖", ta: "ஏலம்", gu: "હરાજી", pa: "ਨੀਲਾਮੀ", hi: "नीलामी" },
  "prop.methodNegotiation": { en: "Price by Negotiation", zh: "议价", ta: "பேச்சுவார்த்தை விலை", gu: "વાટાઘાટથી ભાવ", pa: "ਗੱਲਬਾਤ ਨਾਲ ਮੁੱਲ", hi: "मोलभाव से मूल्य" },
  "prop.methodTender": { en: "Tender", zh: "招标", ta: "டெண்டர்", gu: "ટેન્ડર", pa: "ਟੈਂਡਰ", hi: "टेंडर" },
  "prop.methodUnknown": { en: "Unknown", zh: "未知", ta: "தெரியவில்லை", gu: "અજ્ઞાત", pa: "ਅਗਿਆਤ", hi: "अज्ञात" },
  "prop.auctionHeavyNote": { en: "An auction-heavy comp set reads high if you intend to negotiate. This listing's own sale method isn't in the listing feed yet.", zh: "若你打算议价，以拍卖为主的可比集会偏高。本房源自身的成交方式尚未在房源数据中。", ta: "நீங்கள் பேச்சுவார்த்தை செய்ய விரும்பினால் ஏல-அதிக ஒப்பீட்டுத் தொகுப்பு உயர்வாகத் தெரியும். இந்த பட்டியலின் சொந்த விற்பனை முறை இன்னும் பட்டியல் ஊட்டத்தில் இல்லை.", gu: "હરાજી-પ્રધાન તુલના સેટ ઊંચો દેખાય છે જો તમે વાટાઘાટ કરવા માંગતા હો. આ લિસ્ટિંગની પોતાની વેચાણ રીત હજુ લિસ્ટિંગ ફીડમાં નથી.", pa: "ਨੀਲਾਮੀ-ਪ੍ਰਧਾਨ ਤੁਲਨਾ ਸੈੱਟ ਉੱਚਾ ਦਿਖਦਾ ਹੈ ਜੇ ਤੁਸੀਂ ਗੱਲਬਾਤ ਕਰਨਾ ਚਾਹੁੰਦੇ ਹੋ। ਇਸ ਲਿਸਟਿੰਗ ਦਾ ਆਪਣਾ ਵਿਕਰੀ ਤਰੀਕਾ ਅਜੇ ਲਿਸਟਿੰਗ ਫੀਡ ਵਿੱਚ ਨਹੀਂ ਹੈ।", hi: "नीलामी-प्रधान तुलना सेट ऊँचा दिखता है यदि आप मोलभाव करना चाहते हैं। इस लिस्टिंग का अपना बिक्री तरीका अभी लिस्टिंग फ़ीड में नहीं है।" },
  "prop.cheapestMethodNote": { en: "Cheapest method first — lower vs CV means the buyer paid less. Auckland-wide, auction clears about 4 points above negotiation and is dearer in 74% of suburbs with enough sales to judge, though the spread runs past 25 points in some. Both figures above are this property's CV scaled by the suburb's own method ratio — the listing feed doesn't say which method applies here, so treat them as the range rather than a prediction.", zh: "最便宜的方式在前——对比政府估价越低表示买家付得越少。全奥克兰范围内，拍卖成交约比议价高 4 个百分点，在 74% 有足够成交的区域更贵，个别区域差距超过 25 个百分点。上方两个数字均为本房源政府估价按该区域各方式比率折算——房源数据未标明此处适用哪种方式，故请视为区间而非预测。", ta: "மலிவான முறை முதலில் — CV உடன் குறைவு என்றால் வாங்குபவர் குறைவாகச் செலுத்தினார். ஆக்லாந்து முழுவதும், ஏலம் பேச்சுவார்த்தையை விட சுமார் 4 புள்ளிகள் அதிகமாக விற்கிறது மற்றும் போதுமான விற்பனை உள்ள 74% புறநகர்களில் விலை அதிகம், சிலவற்றில் வித்தியாசம் 25 புள்ளிகளுக்கு மேல் செல்கிறது. மேலே உள்ள இரு எண்களும் இந்த சொத்தின் CV ஐ புறநகரின் சொந்த முறை விகிதத்தால் அளவிடப்பட்டவை — இங்கே எந்த முறை பொருந்தும் என்பதை பட்டியல் ஊட்டம் சொல்லவில்லை, எனவே இவற்றை கணிப்பாக அல்ல ஒரு வரம்பாகக் கருதுங்கள்.", gu: "સૌથી સસ્તી રીત પહેલા — CV સામે ઓછું એટલે ખરીદદારે ઓછું ચૂકવ્યું. પૂરા ઓકલેન્ડમાં, હરાજી વાટાઘાટથી લગભગ 4 પોઇન્ટ ઉપર વેચાય છે અને પૂરતી વેચાણવાળા 74% ઉપનગરોમાં મોંઘી છે, જોકે કેટલાકમાં તફાવત 25 પોઇન્ટથી આગળ જાય છે. ઉપરના બંને આંકડા આ મિલકતના CV ને ઉપનગરની પોતાની રીત ગુણોત્તરથી માપેલા છે — લિસ્ટિંગ ફીડ કહેતું નથી કે અહીં કઈ રીત લાગુ છે, તેથી આને આગાહી નહીં પણ એક મર્યાદા ગણો.", pa: "ਸਭ ਤੋਂ ਸਸਤਾ ਤਰੀਕਾ ਪਹਿਲਾਂ — CV ਦੇ ਮੁਕਾਬਲੇ ਘੱਟ ਦਾ ਮਤਲਬ ਖਰੀਦਦਾਰ ਨੇ ਘੱਟ ਦਿੱਤਾ। ਪੂਰੇ ਆਕਲੈਂਡ ਵਿੱਚ, ਨੀਲਾਮੀ ਗੱਲਬਾਤ ਤੋਂ ਲਗਭਗ 4 ਅੰਕ ਉੱਪਰ ਵਿਕਦੀ ਹੈ ਅਤੇ ਕਾਫ਼ੀ ਵਿਕਰੀਆਂ ਵਾਲੇ 74% ਉਪਨਗਰਾਂ ਵਿੱਚ ਮਹਿੰਗੀ ਹੈ, ਹਾਲਾਂਕਿ ਕੁਝ ਵਿੱਚ ਅੰਤਰ 25 ਅੰਕ ਤੋਂ ਅੱਗੇ ਜਾਂਦਾ ਹੈ। ਉੱਪਰ ਦੋਵੇਂ ਅੰਕੜੇ ਇਸ ਜਾਇਦਾਦ ਦੇ CV ਨੂੰ ਉਪਨਗਰ ਦੇ ਆਪਣੇ ਤਰੀਕਾ ਅਨੁਪਾਤ ਨਾਲ ਮਾਪੇ ਗਏ ਹਨ — ਲਿਸਟਿੰਗ ਫੀਡ ਇਹ ਨਹੀਂ ਦੱਸਦੀ ਕਿ ਇੱਥੇ ਕਿਹੜਾ ਤਰੀਕਾ ਲਾਗੂ ਹੈ, ਇਸ ਲਈ ਇਹਨਾਂ ਨੂੰ ਭਵਿੱਖਬਾਣੀ ਨਹੀਂ ਸਗੋਂ ਇੱਕ ਹੱਦ ਸਮਝੋ।", hi: "सबसे सस्ता तरीका पहले — CV की तुलना में कम का अर्थ खरीदार ने कम चुकाया। पूरे ऑकलैंड में, नीलामी मोलभाव से लगभग 4 अंक ऊपर बिकती है और पर्याप्त बिक्री वाले 74% उपनगरों में महँगी है, हालाँकि कुछ में अंतर 25 अंक से आगे जाता है। ऊपर दोनों आँकड़े इस संपत्ति के CV को उपनगर के अपने तरीका अनुपात से मापे गए हैं — लिस्टिंग फ़ीड यह नहीं बताता कि यहाँ कौन-सा तरीका लागू है, इसलिए इन्हें भविष्यवाणी नहीं बल्कि एक सीमा मानें।" },
  "prop.mixedTitle": { en: "Too few same-title sales nearby — showing mixed titles. ", zh: "附近同产权成交太少——显示混合产权。", ta: "அருகில் ஒரே-உரிமை விற்பனைகள் மிகக் குறைவு — கலப்பு உரிமைகள் காட்டப்படுகின்றன. ", gu: "નજીકમાં સમાન-ટાઇટલ વેચાણ બહુ ઓછી — મિશ્રિત ટાઇટલ બતાવાય છે. ", pa: "ਨੇੜੇ ਸਮਾਨ-ਟਾਈਟਲ ਵਿਕਰੀਆਂ ਬਹੁਤ ਘੱਟ — ਮਿਸ਼ਰਤ ਟਾਈਟਲ ਦਿਖਾਏ ਜਾ ਰਹੇ ਹਨ। ", hi: "पास में समान-टाइटल बिक्री बहुत कम — मिश्रित टाइटल दिखाए जा रहे हैं। " },
  "prop.velocitySub": { en: "Median days from listing to sale, month by month. A falling line means the market is speeding up.", zh: "逐月统计从上架到成交的天数中位数。曲线下降表示市场在加速。", ta: "பட்டியலிலிருந்து விற்பனை வரை இடைநிலை நாட்கள், மாதம்-மாதம். இறங்கும் கோடு சந்தை வேகமடைவதைக் குறிக்கிறது.", gu: "લિસ્ટિંગથી વેચાણ સુધી મધ્યક દિવસ, મહિને-મહિને. ઘટતી રેખાનો અર્થ બજાર ઝડપી થઈ રહ્યું છે.", pa: "ਲਿਸਟਿੰਗ ਤੋਂ ਵਿਕਰੀ ਤੱਕ ਮੱਧਮਾਨ ਦਿਨ, ਮਹੀਨੇ-ਦਰ-ਮਹੀਨੇ। ਡਿੱਗਦੀ ਰੇਖਾ ਦਾ ਮਤਲਬ ਬਾਜ਼ਾਰ ਤੇਜ਼ ਹੋ ਰਿਹਾ ਹੈ।", hi: "लिस्टिंग से बिक्री तक मध्यक दिन, महीने-दर-महीने। गिरती रेखा का अर्थ है बाज़ार तेज़ हो रहा है।" },
  "prop.onDate": { en: " on {date}", zh: " 于 {date}", ta: " {date} அன்று", gu: " {date} ના રોજ", pa: " {date} ਨੂੰ", hi: " {date} को" },
  "prop.retainHouseStrategy": { en: "Retain house + sell new sections", zh: "保留房屋 + 出售新地块", ta: "வீட்டை வைத்திரு + புதிய மனைகளை விற்", gu: "ઘર રાખો + નવા પ્લોટ વેચો", pa: "ਘਰ ਰੱਖੋ + ਨਵੇਂ ਪਲਾਟ ਵੇਚੋ", hi: "घर रखें + नए प्लॉट बेचें" },
  "prop.subdivideInto": { en: "Subdivide into {n} sections", zh: "分割为 {n} 块地", hi: "{n} भूखंडों में विभाजित करें", pa: "{n} ਪਲਾਟਾਂ ਵਿੱਚ ਵੰਡੋ", gu: "{n} પ્લોટમાં વિભાજિત કરો", ta: "{n} மனைகளாகப் பிரிக்கவும்" },
  "prop.askingChip": { en: "Asking {v}", zh: "标价 {v}", ta: "கேட்பு {v}", gu: "માંગ {v}", pa: "ਮੰਗ {v}", hi: "माँगा {v}" },
  "prop.cvChip": { en: "CV {v}", zh: "政府估价 {v}", ta: "CV {v}", gu: "CV {v}", pa: "CV {v}", hi: "CV {v}" },
  "prop.snapshotActive": { en: " · active", zh: " · 活动", ta: " · செயலில்", gu: " · સક્રિય", pa: " · ਸਰਗਰਮ", hi: " · सक्रिय" },
  "prop.snapshotValue": { en: "{ask} asking · {est} est · score {score}", zh: "标价 {ask} · 估值 {est} · 评分 {score}", ta: "கேட்பு {ask} · மதி. {est} · மதிப்பெண் {score}", gu: "માંગ {ask} · અનુ. {est} · સ્કોર {score}", pa: "ਮੰਗ {ask} · ਅਨੁ. {est} · ਸਕੋਰ {score}", hi: "माँगा {ask} · अनु. {est} · स्कोर {score}" },

  // --- wish lists ---
  "nav.wishlists": { en: "Wish lists", zh: "心愿单", hi: "इच्छा सूची", pa: "ਇੱਛਾ ਸੂਚੀ", gu: "વિશ યાદી", ta: "விருப்பப் பட்டியல்" },
  "wish.title": { en: "Wish lists", zh: "心愿单", hi: "इच्छा सूची", pa: "ਇੱਛਾ ਸੂਚੀ", gu: "વિશ યાદી", ta: "விருப்பப் பட்டியல்" },
  "wish.blurb": { en: "Save the searches you care about — an area, a budget, a type, or development sites under a buy price. Ollie flags new listings and price drops that match, each time the market refreshes.", zh: "保存你关心的搜索条件——区域、预算、类型，或低于某买入价的开发地块。每次市场更新时，Ollie 会标记符合条件的新房源与降价。", hi: "अपनी पसंदीदा खोजें सहेजें — क्षेत्र, बजट, प्रकार, या किसी खरीद मूल्य से कम के विकास स्थल। हर बार बाज़ार ताज़ा होने पर Ollie मेल खाती नई लिस्टिंग और कीमत गिरावट को चिह्नित करता है।", pa: "ਆਪਣੀਆਂ ਪਸੰਦੀਦਾ ਖੋਜਾਂ ਸੰਭਾਲੋ — ਖੇਤਰ, ਬਜਟ, ਕਿਸਮ, ਜਾਂ ਕਿਸੇ ਖਰੀਦ ਮੁੱਲ ਤੋਂ ਘੱਟ ਵਿਕਾਸ ਥਾਂਵਾਂ। ਹਰ ਵਾਰ ਬਾਜ਼ਾਰ ਤਾਜ਼ਾ ਹੋਣ ਤੇ Ollie ਮੇਲ ਖਾਂਦੀਆਂ ਨਵੀਆਂ ਲਿਸਟਿੰਗਾਂ ਅਤੇ ਕੀਮਤ ਗਿਰਾਵਟਾਂ ਨੂੰ ਚਿੰਨ੍ਹਿਤ ਕਰਦਾ ਹੈ।", gu: "તમારી પસંદની શોધ સાચવો — વિસ્તાર, બજેટ, પ્રકાર, અથવા કોઈ ખરીદ ભાવથી ઓછા વિકાસ સ્થળો. દર વખતે બજાર તાજું થાય ત્યારે Ollie મેળ ખાતી નવી લિસ્ટિંગ અને ભાવ ઘટાડા ચિહ્નિત કરે છે.", ta: "உங்களுக்கு முக்கியமான தேடல்களைச் சேமியுங்கள் — பகுதி, பட்ஜெட், வகை, அல்லது ஒரு வாங்கும் விலைக்குக் கீழ் மேம்பாட்டு இடங்கள். சந்தை புதுப்பிக்கப்படும் ஒவ்வொரு முறையும் Ollie பொருந்தும் புதிய பட்டியல்களையும் விலை வீழ்ச்சிகளையும் குறிக்கிறது." },
  "wish.new": { en: "New wish list", zh: "新建心愿单", hi: "नई इच्छा सूची", pa: "ਨਵੀਂ ਇੱਛਾ ਸੂਚੀ", gu: "નવી વિશ યાદી", ta: "புதிய விருப்பப் பட்டியல்" },
  "wish.namePlaceholder": { en: "Name this wish list…", zh: "为此心愿单命名…", hi: "इस इच्छा सूची को नाम दें…", pa: "ਇਸ ਇੱਛਾ ਸੂਚੀ ਨੂੰ ਨਾਮ ਦਿਓ…", gu: "આ વિશ યાદીને નામ આપો…", ta: "இந்த பட்டியலுக்குப் பெயரிடு…" },
  "wish.minPrice": { en: "Min price", zh: "最低价格", hi: "न्यूनतम कीमत", pa: "ਘੱਟੋ-ਘੱਟ ਕੀਮਤ", gu: "ન્યૂનતમ કિંમત", ta: "குறைந்தபட்ச விலை" },
  "wish.maxPrice": { en: "Max price", zh: "最高价格", hi: "अधिकतम कीमत", pa: "ਵੱਧੋ-ਵੱਧ ਕੀਮਤ", gu: "મહત્તમ કિંમત", ta: "அதிகபட்ச விலை" },
  "wish.from": { en: "From", zh: "从", hi: "से", pa: "ਤੋਂ", gu: "થી", ta: "இருந்து" },
  "wish.devBudget": { en: "Dev budget", zh: "开发预算", hi: "विकास बजट", pa: "ਵਿਕਾਸ ਬਜਟ", gu: "વિકાસ બજેટ", ta: "மேம்பாட்டு பட்ஜெட்" },
  "wish.create": { en: "Create wish list", zh: "创建心愿单", hi: "इच्छा सूची बनाएँ", pa: "ਇੱਛਾ ਸੂਚੀ ਬਣਾਓ", gu: "વિશ યાદી બનાવો", ta: "பட்டியலை உருவாக்கு" },
  "wish.empty": { en: "No wish lists yet — create one above to start getting match alerts.", zh: "还没有心愿单——在上方创建一个即可开始接收匹配提醒。", hi: "अभी कोई इच्छा सूची नहीं — मैच अलर्ट पाने के लिए ऊपर एक बनाएँ।", pa: "ਹਾਲੇ ਕੋਈ ਇੱਛਾ ਸੂਚੀ ਨਹੀਂ — ਮੈਚ ਅਲਰਟ ਲੈਣ ਲਈ ਉੱਪਰ ਇੱਕ ਬਣਾਓ।", gu: "હજુ કોઈ વિશ યાદી નથી — મેચ અલર્ટ મેળવવા ઉપર એક બનાવો.", ta: "இன்னும் பட்டியல் இல்லை — பொருத்த எச்சரிக்கைகள் பெற மேலே ஒன்றை உருவாக்கு." },
  "wish.newBadge": { en: "{n} new", zh: "{n} 条新", hi: "{n} नए", pa: "{n} ਨਵੇਂ", gu: "{n} નવા", ta: "{n} புதியது" },
  "wish.matchesLabel": { en: "Matches", zh: "匹配", hi: "मैच", pa: "ਮੈਚ", gu: "મેચ", ta: "பொருத்தங்கள்" },
  "wish.view": { en: "View matches", zh: "查看匹配", hi: "मैच देखें", pa: "ਮੈਚ ਵੇਖੋ", gu: "મેચ જુઓ", ta: "பொருத்தங்களைப் பார்" },
  "wish.hide": { en: "Hide", zh: "隐藏", hi: "छिपाएँ", pa: "ਲੁਕਾਓ", gu: "છુપાવો", ta: "மறை" },
  "wish.delete": { en: "Delete", zh: "删除", hi: "हटाएँ", pa: "ਹਟਾਓ", gu: "કાઢી નાખો", ta: "நீக்கு" },
  "wish.noMatches": { en: "No matches right now.", zh: "目前没有匹配。", hi: "अभी कोई मैच नहीं।", pa: "ਹੁਣੇ ਕੋਈ ਮੈਚ ਨਹੀਂ।", gu: "અત્યારે કોઈ મેચ નથી.", ta: "இப்போது பொருத்தம் இல்லை." },
  "wish.newTag": { en: "NEW", zh: "新", hi: "नया", pa: "ਨਵਾਂ", gu: "નવું", ta: "புதிது" },
  "wish.anyListing": { en: "Any listing", zh: "任何房源", hi: "कोई भी लिस्टिंग", pa: "ਕੋਈ ਵੀ ਲਿਸਟਿੰਗ", gu: "કોઈપણ લિસ્ટિંગ", ta: "எந்த பட்டியலும்" },

  // --- settings ---
  "settings.title": { en: "Settings", zh: "设置", ta: "அமைப்புகள்", gu: "સેટિંગ્સ", pa: "ਸੈਟਿੰਗਜ਼", hi: "सेटिंग्स" },
  "settings.subtitle": { en: "Manage your profile, password and AI assistant.", zh: "管理你的资料、密码与 AI 助手。", ta: "உங்கள் சுயவிவரம், கடவுச்சொல் மற்றும் AI உதவியாளரை நிர்வகிக்கவும்.", gu: "તમારી પ્રોફાઇલ, પાસવર્ડ અને AI સહાયક વ્યવસ્થાપિત કરો.", pa: "ਆਪਣੀ ਪ੍ਰੋਫਾਈਲ, ਪਾਸਵਰਡ ਅਤੇ AI ਸਹਾਇਕ ਪ੍ਰਬੰਧਿਤ ਕਰੋ।", hi: "अपनी प्रोफ़ाइल, पासवर्ड और AI सहायक प्रबंधित करें।" },
  "settings.language": { en: "Language", zh: "语言", ta: "மொழி", gu: "ભાષા", pa: "ਭਾਸ਼ਾ", hi: "भाषा" },
  "settings.languageSub": { en: "Choose the language for the whole site. Your choice is remembered on this device.", zh: "为整个网站选择语言。你的选择会记录在本设备上。", ta: "முழு தளத்திற்கும் மொழியைத் தேர்ந்தெடுக்கவும். உங்கள் தேர்வு இந்த சாதனத்தில் நினைவில் வைக்கப்படுகிறது.", gu: "પૂરી સાઇટ માટે ભાષા પસંદ કરો. તમારી પસંદ આ ડિવાઇસ પર યાદ રખાય છે.", pa: "ਪੂਰੀ ਸਾਈਟ ਲਈ ਭਾਸ਼ਾ ਚੁਣੋ। ਤੁਹਾਡੀ ਪਸੰਦ ਇਸ ਡਿਵਾਈਸ 'ਤੇ ਯਾਦ ਰੱਖੀ ਜਾਂਦੀ ਹੈ।", hi: "पूरी साइट के लिए भाषा चुनें। आपकी पसंद इस डिवाइस पर याद रखी जाती है।" },
  "settings.currentPassword": { en: "Current password", zh: "当前密码", ta: "தற்போதைய கடவுச்சொல்", gu: "વર્તમાન પાસવર્ડ", pa: "ਮੌਜੂਦਾ ਪਾਸਵਰਡ", hi: "वर्तमान पासवर्ड" },
  "settings.newPassword": { en: "New password", zh: "新密码", ta: "புதிய கடவுச்சொல்", gu: "નવો પાસવર્ડ", pa: "ਨਵਾਂ ਪਾਸਵਰਡ", hi: "नया पासवर्ड" },
  "settings.confirmPassword": { en: "Confirm new password", zh: "确认新密码", ta: "புதிய கடவுச்சொல்லை உறுதிப்படுத்து", gu: "નવો પાસવર્ડ પુષ્ટિ કરો", pa: "ਨਵਾਂ ਪਾਸਵਰਡ ਪੁਸ਼ਟੀ ਕਰੋ", hi: "नया पासवर्ड पुष्टि करें" },
  "settings.profile": { en: "Profile", zh: "个人资料", ta: "சுயவிவரம்", gu: "પ્રોફાઇલ", pa: "ਪ੍ਰੋਫਾਈਲ", hi: "प्रोफ़ाइल" },
  "settings.fullName": { en: "Full name", zh: "姓名", ta: "முழு பெயர்", gu: "પૂરું નામ", pa: "ਪੂਰਾ ਨਾਮ", hi: "पूरा नाम" },
  "settings.company": { en: "Company", zh: "公司", ta: "நிறுவனம்", gu: "કંપની", pa: "ਕੰਪਨੀ", hi: "कंपनी" },
  "settings.email": { en: "Email", zh: "邮箱", ta: "மின்னஞ்சல்", gu: "ઈમેલ", pa: "ਈਮੇਲ", hi: "ईमेल" },
  "settings.phone": { en: "Phone", zh: "电话", ta: "தொலைபேசி", gu: "ફોન", pa: "ਫ਼ੋਨ", hi: "फ़ोन" },
  "settings.saveProfile": { en: "Save profile", zh: "保存资料", ta: "சுயவிவரத்தை சேமி", gu: "પ્રોફાઇલ સાચવો", pa: "ਪ੍ਰੋਫਾਈਲ ਸੰਭਾਲੋ", hi: "प्रोफ़ाइल सहेजें" },
  "settings.password": { en: "Password", zh: "密码", ta: "கடவுச்சொல்", gu: "પાસવર્ડ", pa: "ਪਾਸਵਰਡ", hi: "पासवर्ड" },
  "settings.updatePassword": { en: "Update password", zh: "更新密码", ta: "கடவுச்சொல்லைப் புதுப்பி", gu: "પાસવર્ડ અપડેટ કરો", pa: "ਪਾਸਵਰਡ ਅੱਪਡੇਟ ਕਰੋ", hi: "पासवर्ड अपडेट करें" },
  "settings.assistant": { en: "AI assistant", zh: "AI 助手", ta: "AI உதவியாளர்", gu: "AI સહાયક", pa: "AI ਸਹਾਇਕ", hi: "AI सहायक" },
  "settings.assistantManaged": { en: "Enabled by your administrator — ready to use.", zh: "已由管理员启用——可直接使用。", ta: "உங்கள் நிர்வாகியால் இயக்கப்பட்டது — பயன்படுத்தத் தயார்.", gu: "તમારા એડમિન દ્વારા સક્ષમ — વાપરવા તૈયાર.", pa: "ਤੁਹਾਡੇ ਪ੍ਰਬੰਧਕ ਵੱਲੋਂ ਚਾਲੂ — ਵਰਤਣ ਲਈ ਤਿਆਰ।", hi: "आपके व्यवस्थापक द्वारा सक्षम — उपयोग के लिए तैयार।" },
  "settings.assistantSub": {
    en: "Ask questions about any of the data in plain English. Bring your own key — it's stored encrypted and only used for your own questions.",
    zh: "用日常语言询问任何数据。使用你自己的密钥——加密存储，仅用于你自己的提问。", ta: "எளிய மொழியில் எந்த தரவு பற்றியும் கேள்வி கேளுங்கள். உங்கள் சொந்த விசையைக் கொண்டு வாருங்கள் — இது குறியாக்கம் செய்யப்பட்டு சேமிக்கப்பட்டு உங்கள் கேள்விகளுக்கு மட்டுமே பயன்படுத்தப்படுகிறது.", gu: "સરળ ભાષામાં કોઈપણ ડેટા વિશે પ્રશ્ન પૂછો. તમારી પોતાની કી લાવો — તે એન્ક્રિપ્ટેડ સ્વરૂપે સચવાય છે અને માત્ર તમારા પ્રશ્નો માટે વપરાય છે.", pa: "ਸਧਾਰਨ ਭਾਸ਼ਾ ਵਿੱਚ ਕਿਸੇ ਵੀ ਡੇਟਾ ਬਾਰੇ ਸਵਾਲ ਪੁੱਛੋ। ਆਪਣੀ ਖੁਦ ਦੀ ਕੁੰਜੀ ਲਿਆਓ — ਇਹ ਏਨਕ੍ਰਿਪਟਿਡ ਰੂਪ ਵਿੱਚ ਸੰਭਾਲੀ ਜਾਂਦੀ ਹੈ ਅਤੇ ਸਿਰਫ਼ ਤੁਹਾਡੇ ਸਵਾਲਾਂ ਲਈ ਵਰਤੀ ਜਾਂਦੀ ਹੈ।", hi: "सरल भाषा में किसी भी डेटा के बारे में सवाल पूछें। अपनी खुद की कुंजी लाएँ — यह एन्क्रिप्टेड रूप में संग्रहीत होती है और केवल आपके सवालों के लिए उपयोग होती है।",
  },
  "settings.connectedTo": { en: "Connected to {provider}", zh: "已连接 {provider}", ta: "{provider} உடன் இணைக்கப்பட்டது", gu: "{provider} સાથે જોડાયેલ", pa: "{provider} ਨਾਲ ਜੁੜਿਆ", hi: "{provider} से जुड़ा" },
  "settings.keyEnding": { en: "key ending {four}", zh: "密钥尾号 {four}", ta: "விசை முடிவு {four}", gu: "કી અંત {four}", pa: "ਕੁੰਜੀ ਅੰਤ {four}", hi: "कुंजी अंत {four}" },
  "settings.remove": { en: "Remove", zh: "移除", ta: "அகற்று", gu: "દૂર કરો", pa: "ਹਟਾਓ", hi: "हटाएँ" },
  "settings.providerLabel": { en: "PROVIDER", zh: "服务商", ta: "வழங்குநர்", gu: "પ્રોવાઇડર", pa: "ਪ੍ਰੋਵਾਈਡਰ", hi: "प्रोवाइडर" },
  "settings.apiKey": { en: "API KEY", zh: "API 密钥", ta: "API விசை", gu: "API કી", pa: "API ਕੁੰਜੀ", hi: "API कुंजी" },
  "settings.replaceKey": { en: "REPLACE KEY", zh: "更换密钥", ta: "விசையை மாற்று", gu: "કી બદલો", pa: "ਕੁੰਜੀ ਬਦਲੋ", hi: "कुंजी बदलें" },
  "settings.saveKey": { en: "Save key", zh: "保存密钥", ta: "விசையை சேமி", gu: "કી સાચવો", pa: "ਕੁੰਜੀ ਸੰਭਾਲੋ", hi: "कुंजी सहेजें" },
  "settings.checking": { en: "Checking…", zh: "验证中…", ta: "சரிபார்க்கிறது…", gu: "તપાસ થઈ રહી છે…", pa: "ਜਾਂਚ ਹੋ ਰਹੀ ਹੈ…", hi: "जाँच हो रही है…" },
  "settings.keyNote": {
    en: "We test the key with a live call before saving, so a bad paste fails here rather than on your first question. It is encrypted at rest and never sent back to your browser — only the last four characters are shown. Usage is billed to your own provider account.",
    zh: "保存前我们会通过一次实时调用验证密钥，因此粘贴错误会在此处而非首次提问时报错。密钥加密存储，绝不回传浏览器——仅显示末四位。用量计入你的服务商账户。", ta: "சேமிக்கும் முன் விசையை ஒரு நேரடி அழைப்பால் சோதிக்கிறோம், இதனால் தவறான ஒட்டுதல் இங்கேயே தோல்வியடையும், உங்கள் முதல் கேள்வியில் அல்ல. இது ஓய்வில் குறியாக்கம் செய்யப்பட்டு உங்கள் உலாவிக்கு ஒருபோதும் திருப்பி அனுப்பப்படாது — கடைசி நான்கு எழுத்துகள் மட்டுமே காட்டப்படும். பயன்பாடு உங்கள் சொந்த வழங்குநர் கணக்கில் கட்டணமிடப்படுகிறது.", gu: "સાચવતા પહેલા અમે કીને એક લાઇવ કૉલથી ચકાસીએ છીએ, જેથી ખોટું પેસ્ટ અહીં જ નિષ્ફળ થાય, તમારા પહેલા પ્રશ્ન પર નહીં. તે વિશ્રામમાં એન્ક્રિપ્ટેડ રહે છે અને ક્યારેય તમારા બ્રાઉઝરને પાછી મોકલાતી નથી — માત્ર છેલ્લા ચાર અક્ષર બતાવાય છે. વપરાશ તમારા પોતાના પ્રોવાઇડર ખાતામાં બિલ થાય છે.", pa: "ਸੰਭਾਲਣ ਤੋਂ ਪਹਿਲਾਂ ਅਸੀਂ ਕੁੰਜੀ ਨੂੰ ਇੱਕ ਲਾਈਵ ਕਾਲ ਨਾਲ ਜਾਂਚਦੇ ਹਾਂ, ਤਾਂ ਜੋ ਗਲਤ ਪੇਸਟ ਇੱਥੇ ਹੀ ਅਸਫਲ ਹੋਵੇ, ਤੁਹਾਡੇ ਪਹਿਲੇ ਸਵਾਲ 'ਤੇ ਨਹੀਂ। ਇਹ ਵਿਸ਼ਰਾਮ ਵਿੱਚ ਏਨਕ੍ਰਿਪਟਿਡ ਰਹਿੰਦੀ ਹੈ ਅਤੇ ਕਦੇ ਤੁਹਾਡੇ ਬ੍ਰਾਊਜ਼ਰ ਨੂੰ ਵਾਪਸ ਨਹੀਂ ਭੇਜੀ ਜਾਂਦੀ — ਸਿਰਫ਼ ਆਖਰੀ ਚਾਰ ਅੱਖਰ ਦਿਖਾਏ ਜਾਂਦੇ ਹਨ। ਵਰਤੋਂ ਤੁਹਾਡੇ ਆਪਣੇ ਪ੍ਰੋਵਾਈਡਰ ਖਾਤੇ ਵਿੱਚ ਬਿਲ ਹੁੰਦੀ ਹੈ।", hi: "सहेजने से पहले हम कुंजी को एक लाइव कॉल से जाँचते हैं, ताकि गलत पेस्ट यहीं विफल हो, आपके पहले सवाल पर नहीं। यह विश्राम में एन्क्रिप्टेड रहती है और कभी आपके ब्राउज़र को वापस नहीं भेजी जाती — केवल अंतिम चार अक्षर दिखाए जाते हैं। उपयोग आपके अपने प्रोवाइडर खाते में बिल होता है।",
  },
};

interface I18nValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

const STORAGE_KEY = "ollie_lang";

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  // Read the saved choice on mount. Kept out of the initial state so server and
  // first client render agree (no hydration mismatch); the switch to a saved
  // language happens in the effect.
  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (saved && LANGUAGES.some((l) => l.code === saved)) setLangState(saved as Lang);
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, l);
    if (typeof document !== "undefined")
      document.documentElement.lang = l === "zh" ? "zh-CN" : l;
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const entry = STRINGS[key];
      let out = entry ? entry[lang] || entry.en : key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          out = out.replaceAll(`{${k}}`, String(v));
        }
      }
      return out;
    },
    [lang],
  );

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useT(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    // Rendered outside the provider (shouldn't happen) — degrade to English
    // rather than throw and blank the page.
    return {
      lang: "en",
      setLang: () => {},
      t: (key, vars) => {
        const entry = STRINGS[key];
        let out = entry ? entry.en : key;
        if (vars) for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, String(v));
        return out;
      },
    };
  }
  return ctx;
}

// Localise a property type into the active language. property_type is stored in
// Chinese (from the Hougarden scrape), occasionally in English. We key off the RAW
// value directly — every type that appears in the data maps to a translation key —
// so it shows Chinese in zh mode, English in en mode, Hindi in hi mode, etc. Only
// a truly unknown value falls back to the English label, and only then.
const TYPE_KEYS: Record<string, string> = {
  // houses
  "独立屋": "ptable.house", "独立别墅": "ptable.house", "独立式住宅": "ptable.house",
  "SingleFamilyResidence": "ptable.house", "Residential - Dwelling": "ptable.house",
  "House": "ptable.house",
  // townhouses & terraces
  "城市屋": "ptable.townhouse", "Townhouse": "ptable.townhouse",
  "排房": "ptable.terraced", "联排别墅": "ptable.terraced", "Terraced house": "ptable.terraced",
  // apartments & units
  "公寓": "ptable.apartment", "Residential - Apartments": "ptable.apartment", "Apartment": "ptable.apartment",
  "单元房": "ptable.unit", "单元": "ptable.unit", "Unit": "ptable.unit",
  // lifestyle / rural dwellings
  "乡村别墅": "ptable.lifestyle", "乡村住宅": "ptable.lifestyle",
  "Lifestyle property": "ptable.lifestyle", "Rural residence": "ptable.lifestyle",
  // sections / bare land
  "建地": "ptable.section", "土地": "ptable.section", "地皮": "ptable.section",
  "乡村住宅建地": "ptable.section", "Residential - Vacant": "ptable.section",
  "Vacant land": "ptable.section", "Land": "ptable.section", "Section": "ptable.section",
  // commercial
  "零售店": "ptable.commercial", "商铺": "ptable.commercial", "商业": "ptable.commercial",
  "工业": "ptable.commercial", "办公室": "ptable.commercial",
  "Retail": "ptable.commercial", "Commercial": "ptable.commercial",
  "Industrial": "ptable.commercial", "Office": "ptable.commercial",
  // investment label / carpark
  "自住投资": "ptable.investment", "Owner-occupier / investment": "ptable.investment",
  "Carpark": "ptable.carpark",
};
export function useTypeLabel(): (rawType: string | null | undefined) => string {
  const { t } = useT();
  return (rawType: string | null | undefined) => {
    const raw = (rawType ?? "").trim();
    const k = TYPE_KEYS[raw];
    if (k) return t(k);
    // Unknown/rare type: best-effort English (also covers "Unspecified" → "—").
    return translatePropertyType(rawType);
  };
}
