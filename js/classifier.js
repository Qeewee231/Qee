// دسته‌بندی هوشمند کارها: کلیدواژه‌ها + یادگیری از اصلاحات کاربر

export const CATEGORIES = [
  { id: 'work', name: 'کاری', emoji: '💼', color: '#3b6fd8',
    keywords: ['جلسه', 'پروژه', 'گزارش', 'ایمیل', 'مدیر', 'رئیس', 'شرکت', 'مشتری', 'ارائه', 'قرارداد', 'همکار', 'پروپوزال', 'تحویل', 'کار', 'دفتر', 'مصاحبه', 'رزومه', 'فاکتور', 'پیگیری', 'تماس کاری', 'کنفرانس', 'ددلاین', 'اسلاید'] },
  { id: 'finance', name: 'مالی', emoji: '💰', color: '#1f9d6b',
    keywords: ['قسط', 'قبض', 'پرداخت', 'بانک', 'چک', 'اجاره', 'حقوق', 'واریز', 'بیمه', 'مالیات', 'پول', 'وام', 'کارت', 'حساب', 'بدهی', 'طلب', 'شارژ', 'سهام', 'بورس', 'انتقال وجه', 'خرج'] },
  { id: 'health', name: 'سلامت', emoji: '🩺', color: '#d6455d',
    keywords: ['دکتر', 'پزشک', 'دندان', 'دارو', 'قرص', 'ورزش', 'باشگاه', 'آزمایش', 'بیمارستان', 'نوبت', 'پیاده', 'یوگا', 'دویدن', 'شنا', 'رژیم', 'چکاپ', 'واکسن', 'فیزیوتراپی', 'مدیتیشن', 'خواب', 'آب بخور'] },
  { id: 'shopping', name: 'خرید', emoji: '🛒', color: '#e08a1e',
    keywords: ['خرید', 'بخر', 'بخرم', 'فروشگاه', 'سوپر', 'نان', 'میوه', 'شیر', 'سبزی', 'گوشت', 'مرغ', 'برنج', 'هایپر', 'سفارش'] },
  { id: 'family', name: 'خانواده و دوستان', emoji: '👨‍👩‍👧', color: '#9b59b6',
    keywords: ['مادر', 'پدر', 'مامان', 'بابا', 'همسر', 'بچه', 'تولد', 'مهمانی', 'مهمونی', 'خانواده', 'برادر', 'خواهر', 'عروسی', 'سالگرد', 'دوست', 'عمو', 'خاله', 'دایی', 'عمه', 'مادربزرگ', 'پدربزرگ', 'دیدار', 'هدیه', 'کادو', 'پسرم', 'دخترم'] },
  { id: 'home', name: 'خانه و خودرو', emoji: '🏠', color: '#16a2b8',
    keywords: ['تعمیر', 'نظافت', 'تمیز', 'شستن', 'بشور', 'لباس', 'آشپزی', 'غذا', 'ماشین', 'خودرو', 'تعویض روغن', 'لوله', 'برق', 'گاز', 'آشغال', 'زباله', 'گلدان', 'باغچه', 'جارو', 'اتو', 'بنزین', 'کارواش', 'معاینه فنی'] },
  { id: 'study', name: 'آموزش', emoji: '📚', color: '#c0392b',
    keywords: ['کلاس', 'درس', 'مطالعه', 'کتاب', 'امتحان', 'دانشگاه', 'دوره', 'یادگیری', 'زبان', 'مقاله', 'تمرین', 'پایان نامه', 'تکلیف', 'آزمون', 'وبینار', 'استاد', 'بخوانم', 'بخونم'] },
  { id: 'admin', name: 'اداری', emoji: '📄', color: '#7f8c8d',
    keywords: ['گذرنامه', 'پاسپورت', 'ثبت نام', 'مدارک', 'دفترخانه', 'شهرداری', 'تمدید', 'گواهینامه', 'کارت ملی', 'شناسنامه', 'اداره', 'نامه', 'امضا', 'پلیس', 'دادگاه', 'وکیل', 'سند', 'پست', 'مدرک'] },
  { id: 'personal', name: 'شخصی', emoji: '✨', color: '#5d6d7e', keywords: ['تفریح', 'فیلم', 'سفر', 'بلیط', 'رزرو', 'سینما', 'آرایشگاه', 'سلمانی', 'برنامه ریزی'] },
];

export const DEFAULT_CATEGORY = 'personal';
export const categoryById = (id) => CATEGORIES.find((c) => c.id === id) || CATEGORIES.find((c) => c.id === DEFAULT_CATEGORY);

const STOPWORDS = new Set(['از', 'به', 'با', 'در', 'که', 'را', 'و', 'برای', 'این', 'آن', 'یک', 'تا', 'هم', 'رو', 'بره', 'باید', 'برم', 'کنم', 'کن', 'بکنم', 'می', 'های', 'ها']);

export function normalizeText(s) {
  return String(s || '')
    .replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/[‌‏‎]/g, ' ')
    .replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
    .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .toLowerCase();
}

export function tokenize(s) {
  return normalizeText(s).split(/[\s،,.!؟?:;()«»"'\-_/]+/).filter((w) => w && !STOPWORDS.has(w));
}

/** امتیاز هر دسته را برمی‌گرداند؛ learned = {کلمه: {دسته: وزن}} */
export function scoreCategories(title, learned = {}) {
  const text = ' ' + normalizeText(title) + ' ';
  const tokens = tokenize(title);
  const scores = {};
  for (const cat of CATEGORIES) {
    let s = 0;
    for (const kw of cat.keywords) {
      const k = normalizeText(kw);
      if (k.includes(' ')) { if (text.includes(' ' + k)) s += 2; }
      else if (tokens.some((t) => t === k)) s += 2;
      else if (tokens.some((t) => t.startsWith(k) && k.length >= 3)) s += 1;
    }
    scores[cat.id] = s;
  }
  for (const t of tokens) {
    const l = learned[t];
    if (!l) continue;
    for (const [cat, w] of Object.entries(l)) scores[cat] = (scores[cat] || 0) + 3 * w;
  }
  return scores;
}

export function classify(title, learned = {}) {
  const scores = scoreCategories(title, learned);
  let best = DEFAULT_CATEGORY, bestScore = 0;
  for (const [id, s] of Object.entries(scores)) if (s > bestScore) { best = id; bestScore = s; }
  return best;
}

/** وقتی کاربر دسته را اصلاح می‌کند، منشی یاد می‌گیرد */
export function learn(learned, title, categoryId) {
  for (const t of tokenize(title)) {
    if (t.length < 2 || /^\d+$/.test(t)) continue;
    learned[t] = learned[t] || {};
    learned[t][categoryId] = Math.min((learned[t][categoryId] || 0) + 1, 5);
  }
  return learned;
}
