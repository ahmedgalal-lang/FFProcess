import type { Messages } from "./en";
import { governanceAr } from "./governance.ar";

/**
 * Arabic interface strings (spec 031), Modern Standard Arabic for business
 * users. Typed against en.ts, so every key must be present. Digits stay
 * Western throughout, matching process codes.
 */
export const ar: Messages = {
  language: {
    label: "اللغة",
    english: "English",
    arabic: "العربية",
  },
  login: {
    title: "تسجيل الدخول",
    intro: "خرائط العمليات ومصفوفات RACI ومصفوفات الصلاحيات لمشاريع العملاء.",
    email: "البريد الإلكتروني",
    password: "كلمة المرور",
    submit: "تسجيل الدخول",
    submitting: "جارٍ تسجيل الدخول…",
  },
  common: {
    save: "حفظ",
    saving: "جارٍ الحفظ…",
    cancel: "إلغاء",
    close: "إغلاق",
    delete: "حذف",
    keep: "إبقاء",
    edit: "تعديل",
    add: "إضافة",
    remove: "إزالة",
    none: "— لا شيء —",
    unassigned: "غير مُسند",
    archived: "مؤرشف",
    couldNotSave: "تعذّر الحفظ.",
    working: "جارٍ العمل…",
    loading: "جارٍ التحميل…",
  },
  shell: {
    firmSettings: "إعدادات الشركة",
    signOut: "تسجيل الخروج",
  },
  nav: {
    workspace: "مساحة العمل",
    firmOwnerAccess: "★ صلاحية مالك الشركة",
    viewOnly: "عرض فقط",
    allWorkspaces: "→ كل مساحات العمل",
    showSidebar: "إظهار الشريط الجانبي لمساحة العمل",
    hideSidebar: "إخفاء الشريط الجانبي لمساحة العمل",
    showSidebarShort: "إظهار الشريط الجانبي",
    hideSidebarShort: "إخفاء الشريط الجانبي",
    items: {
      dashboard: "لوحة المعلومات",
      org: "الدليل التنظيمي",
      processes: "العمليات",
      helicopter: "النظرة الشاملة",
      valueChain: "سلسلة القيمة",
      governance: "الحوكمة",
      members: "الأعضاء",
      export: "تصدير التقرير",
    },
  },
  governance: governanceAr,
};
