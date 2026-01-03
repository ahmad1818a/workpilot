"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type Lang = "en" | "ar";
type Dict = Record<string, string>;

/* ================== TRANSLATIONS ================== */

const dict: Record<Lang, Dict> = {
  en: {
    dashboard: "Dashboard",
    home: "Home",
    jobs: "Jobs",
    workers: "Workers",
    schedule: "Schedule",
    lang: "Language",
    english: "English",
    arabic: "Arabic",

    jobs_title: "Jobs",
    jobs_subtitle:
      "Add Job + due date + hours + steps (with worker per step).",
    job_name: "Job name",
    job_name_placeholder: "Example: Kitchen Cabinets - Job #102",
    due_date: "Due date",
    total_hours: "Total hours (estimate)",
    add_job: "+ Add Job",

    job_number: "Job number (optional)",
    job_number_placeholder: "Example: 102",
    job_address: "Job address (optional)",
    job_address_placeholder: "Example: 123 Main St, Paterson, NJ",

    steps: "Steps",
    add_step: "+ Add Step",
    step_name: "Step name",
    step_name_placeholder: "ex: cutting",
    step_hours: "Hours",
    step_worker: "Worker name",

    remove: "Remove",
    start: "Start",
    finish: "Finish",
    delete: "Delete",

    empty_jobs: "No jobs yet.",
    days_needed: "Days needed",
    estimated_finish: "Estimated finish",

    workers_title: "Workers",
    add_worker: "Add Worker",

    mon: "Mon",
    tue: "Tue",
    wed: "Wed",
    thu: "Thu",
    fri: "Fri",
    sat: "Sat",
    sun: "Sun",
  },

  ar: {
    dashboard: "لوحة التحكم",
    home: "الرئيسية",
    jobs: "الوظائف",
    workers: "العمال",
    schedule: "الجدول",
    lang: "اللغة",
    english: "English",
    arabic: "العربية",

    jobs_title: "الوظائف",
    jobs_subtitle:
      "أضف وظيفة + تاريخ التسليم + ساعات + خطوات (مع عامل لكل خطوة).",
    job_name: "اسم الوظيفة",
    job_name_placeholder: "مثال: مطبخ - Job #102",
    due_date: "تاريخ التسليم",
    total_hours: "إجمالي الساعات",
    add_job: "+ إضافة وظيفة",

    job_number: "رقم العمل (اختياري)",
    job_number_placeholder: "مثال: 102",
    job_address: "عنوان العمل (اختياري)",
    job_address_placeholder: "Paterson, NJ",

    steps: "الخطوات",
    add_step: "+ إضافة خطوة",
    step_name: "اسم الخطوة",
    step_name_placeholder: "مثال: cutting",
    step_hours: "الساعات",
    step_worker: "اسم العامل",

    remove: "إزالة",
    start: "بدء",
    finish: "إنهاء",
    delete: "حذف",

    empty_jobs: "لا توجد وظائف.",
    days_needed: "عدد الأيام",
    estimated_finish: "تاريخ الانتهاء",

    workers_title: "العمال",
    add_worker: "إضافة عامل",

    mon: "الإثنين",
    tue: "الثلاثاء",
    wed: "الأربعاء",
    thu: "الخميس",
    fri: "الجمعة",
    sat: "السبت",
    sun: "الأحد",
  },
};

/* ================== CONTEXT ================== */

type LangCtx = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string) => string;
};

const LangContext = createContext<LangCtx | null>(null);

/* ================== PROVIDER ================== */

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<Lang>("en");

  // Load saved language (client only)
  useEffect(() => {
    const saved = localStorage.getItem("lang");
    if (saved === "ar" || saved === "en") {
      setLang(saved);
    }
  }, []);

  // Sync html attributes
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    localStorage.setItem("lang", lang);
  }, [lang]);

  const value = useMemo<LangCtx>(() => {
    return {
      lang,
      setLang,
      t: (key: string) => dict[lang][key] ?? key,
    };
  }, [lang]);

  return (
    <LangContext.Provider value={value}>
      {children}
    </LangContext.Provider>
  );
}

/* ================== HOOK ================== */

/**
 * Safe hook:
 * - No crash
 * - Fallback to English if Provider is missing
 */
export function useLang(): LangCtx {
  const ctx = useContext(LangContext);

  if (!ctx) {
    return {
      lang: "en",
      setLang: () => {},
      t: (key: string) => dict.en[key] ?? key,
    };
  }

  return ctx;
}
