export type PrescriptionLanguageCode = "en" | "hi" | "ta" | "bn";

export type PrescriptionTimingSlot =
  | "MORNING_BEFORE_FOOD"
  | "MORNING_AFTER_FOOD"
  | "AFTERNOON_BEFORE_FOOD"
  | "AFTERNOON_AFTER_FOOD"
  | "NIGHT_BEFORE_FOOD"
  | "NIGHT_AFTER_FOOD"
  | "BEDTIME"
  | "AS_NEEDED"
  | "UNSPECIFIED";

export type SimplifiedPrescriptionMedicine = {
  medicineName: string;
  dosage: string;
  duration: string;
  timingSlots: PrescriptionTimingSlot[];
  instructions: string[];
};

export type SimplifiedPrescriptionSummary = {
  languageCode: PrescriptionLanguageCode;
  languageLabel: string;
  doctorExplanation: string;
  medicines: SimplifiedPrescriptionMedicine[];
  warnings: string[];
  hydrationTips: string[];
  generalAdvice: string[];
};

export const prescriptionLanguageOptions: Array<{
  code: PrescriptionLanguageCode;
  label: string;
}> = [
  { code: "en", label: "English" },
  { code: "hi", label: "Hindi" },
  { code: "ta", label: "Tamil" },
  { code: "bn", label: "Bengali" },
];

const timingSlotIcons: Record<PrescriptionTimingSlot, string> = {
  MORNING_BEFORE_FOOD: "☀️🍽❌",
  MORNING_AFTER_FOOD: "☀️🍽✔",
  AFTERNOON_BEFORE_FOOD: "🌤️🍽❌",
  AFTERNOON_AFTER_FOOD: "🌤️🍽✔",
  NIGHT_BEFORE_FOOD: "🌙🍽❌",
  NIGHT_AFTER_FOOD: "🌙🍽✔",
  BEDTIME: "🛌",
  AS_NEEDED: "🕒",
  UNSPECIFIED: "📌",
};

const timingSlotLabels: Record<PrescriptionLanguageCode, Record<PrescriptionTimingSlot, string>> = {
  en: {
    MORNING_BEFORE_FOOD: "Morning — before food",
    MORNING_AFTER_FOOD: "Morning — after food",
    AFTERNOON_BEFORE_FOOD: "Afternoon — before food",
    AFTERNOON_AFTER_FOOD: "Afternoon — after food",
    NIGHT_BEFORE_FOOD: "Night — before food",
    NIGHT_AFTER_FOOD: "Night — after food",
    BEDTIME: "Before bed",
    AS_NEEDED: "As needed",
    UNSPECIFIED: "As directed by doctor",
  },
  hi: {
    MORNING_BEFORE_FOOD: "सुबह — खाने से पहले",
    MORNING_AFTER_FOOD: "सुबह — खाने के बाद",
    AFTERNOON_BEFORE_FOOD: "दोपहर — खाने से पहले",
    AFTERNOON_AFTER_FOOD: "दोपहर — खाने के बाद",
    NIGHT_BEFORE_FOOD: "रात — खाने से पहले",
    NIGHT_AFTER_FOOD: "रात — खाने के बाद",
    BEDTIME: "सोने से पहले",
    AS_NEEDED: "जरूरत पड़ने पर",
    UNSPECIFIED: "डॉक्टर के निर्देशानुसार",
  },
  ta: {
    MORNING_BEFORE_FOOD: "காலை — உணவுக்கு முன்",
    MORNING_AFTER_FOOD: "காலை — உணவுக்குப் பிறகு",
    AFTERNOON_BEFORE_FOOD: "மதியம் — உணவுக்கு முன்",
    AFTERNOON_AFTER_FOOD: "மதியம் — உணவுக்குப் பிறகு",
    NIGHT_BEFORE_FOOD: "இரவு — உணவுக்கு முன்",
    NIGHT_AFTER_FOOD: "இரவு — உணவுக்குப் பிறகு",
    BEDTIME: "தூங்குவதற்கு முன்",
    AS_NEEDED: "தேவைப்பட்டால்",
    UNSPECIFIED: "மருத்துவர் கூறியபடி",
  },
  bn: {
    MORNING_BEFORE_FOOD: "সকাল — খাবারের আগে",
    MORNING_AFTER_FOOD: "সকাল — খাবারের পরে",
    AFTERNOON_BEFORE_FOOD: "দুপুর — খাবারের আগে",
    AFTERNOON_AFTER_FOOD: "দুপুর — খাবারের পরে",
    NIGHT_BEFORE_FOOD: "রাত — খাবারের আগে",
    NIGHT_AFTER_FOOD: "রাত — খাবারের পরে",
    BEDTIME: "ঘুমানোর আগে",
    AS_NEEDED: "প্রয়োজন হলে",
    UNSPECIFIED: "ডাক্তারের নির্দেশ অনুযায়ী",
  },
};

export function timingSlotDisplay(
  slot: PrescriptionTimingSlot,
  language: PrescriptionLanguageCode = "en",
) {
  const labels = timingSlotLabels[language] ?? timingSlotLabels.en;
  return {
    icon: timingSlotIcons[slot] ?? timingSlotIcons.UNSPECIFIED,
    label: labels[slot] ?? labels.UNSPECIFIED,
  };
}
