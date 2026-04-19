export const SERVICE_COUNTRY_FIELD_KEY = "system_service_country";

export const LEGACY_SERVICE_COUNTRY_FIELD_QUESTIONS = new Set([
  "country",
  "verification country",
  "service country",
]);

export const DEFAULT_MOBILE_COUNTRY_CODE = "+91";

const COUNTRY_DIAL_CODE_BY_NAME: Record<string, string> = {
  afghanistan: "+93",
  armenia: "+374",
  australia: "+61",
  azerbaijan: "+994",
  bangladesh: "+880",
  bhutan: "+975",
  brunei: "+673",
  cambodia: "+855",
  china: "+86",
  fiji: "+679",
  georgia: "+995",
  "hong kong": "+852",
  india: "+91",
  indonesia: "+62",
  japan: "+81",
  kazakhstan: "+7",
  kiribati: "+686",
  kyrgyzstan: "+996",
  laos: "+856",
  macau: "+853",
  malaysia: "+60",
  maldives: "+960",
  "marshall islands": "+692",
  micronesia: "+691",
  mongolia: "+976",
  myanmar: "+95",
  nauru: "+674",
  nepal: "+977",
  "new zealand": "+64",
  pakistan: "+92",
  palau: "+680",
  "papua new guinea": "+675",
  philippines: "+63",
  samoa: "+685",
  singapore: "+65",
  "solomon islands": "+677",
  "south korea": "+82",
  "sri lanka": "+94",
  taiwan: "+886",
  tajikistan: "+992",
  thailand: "+66",
  "timor-leste": "+670",
  tonga: "+676",
  turkmenistan: "+993",
  tuvalu: "+688",
  uzbekistan: "+998",
  vanuatu: "+678",
  vietnam: "+84",
  "united arab emirates": "+971",
  "united states": "+1",
  "united kingdom": "+44",
};

function normalizeCountryNameKey(rawCountryName: unknown) {
  return String(rawCountryName ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function normalizeCountryDialCode(
  rawCountryCode: unknown,
  fallbackCode = DEFAULT_MOBILE_COUNTRY_CODE,
) {
  const raw = String(rawCountryCode ?? "").trim();
  if (!raw) {
    return fallbackCode;
  }

  const withPlus = raw.match(/\+\d{1,4}/)?.[0];
  if (withPlus) {
    return withPlus;
  }

  const digitsOnly = raw.replace(/\D/g, "");
  if (digitsOnly) {
    return `+${digitsOnly.slice(0, 4)}`;
  }

  return fallbackCode;
}

export function resolveDefaultCountryDialCode(
  countryName: unknown,
  fallbackCode = DEFAULT_MOBILE_COUNTRY_CODE,
) {
  const normalizedCountryName = normalizeCountryNameKey(countryName);
  if (!normalizedCountryName) {
    return fallbackCode;
  }

  return COUNTRY_DIAL_CODE_BY_NAME[normalizedCountryName] ?? fallbackCode;
}

export function parseMobileAnswerValue(rawValue: unknown, fallbackCountryCode: string) {
  const fallbackCode = normalizeCountryDialCode(fallbackCountryCode, DEFAULT_MOBILE_COUNTRY_CODE);
  const trimmed = String(rawValue ?? "").trim();

  if (!trimmed) {
    return {
      countryCode: fallbackCode,
      number: "",
    };
  }

  const matchedCountryCode = trimmed.match(/\+\d{1,4}/)?.[0];
  if (!matchedCountryCode) {
    return {
      countryCode: fallbackCode,
      number: trimmed,
    };
  }

  const normalizedCode = normalizeCountryDialCode(matchedCountryCode, fallbackCode);
  const number = trimmed
    .replace(/^.*?\+\d{1,4}\)?\s*/, "")
    .replace(/^[-()\s]+/, "")
    .trim();

  return {
    countryCode: normalizedCode,
    number,
  };
}

export function serializeMobileAnswerValue(value: {
  countryCode: unknown;
  number: unknown;
}) {
  const countryCode = normalizeCountryDialCode(value.countryCode, DEFAULT_MOBILE_COUNTRY_CODE);
  const number = String(value.number ?? "").trim();

  if (!number) {
    return countryCode;
  }

  return `${countryCode} ${number}`.trim();
}

export function hasMobileNumberDigits(numberValue: unknown) {
  const digits = String(numberValue ?? "").replace(/\D/g, "");
  return digits.length > 0;
}

export function isMobileNumberFormatValid(numberValue: unknown) {
  const number = String(numberValue ?? "").trim();
  if (!number) {
    return false;
  }

  const digits = number.replace(/\D/g, "");
  if (digits.length < 5 || digits.length > 20) {
    return false;
  }

  return /^[0-9()\-\s]+$/.test(number);
}

const codeOptions = Array.from(new Set(Object.values(COUNTRY_DIAL_CODE_BY_NAME)));

codeOptions.sort((left, right) => {
  const leftNumber = Number.parseInt(left.replace(/\D/g, ""), 10);
  const rightNumber = Number.parseInt(right.replace(/\D/g, ""), 10);

  if (!Number.isFinite(leftNumber) && !Number.isFinite(rightNumber)) {
    return left.localeCompare(right);
  }

  if (!Number.isFinite(leftNumber)) {
    return 1;
  }

  if (!Number.isFinite(rightNumber)) {
    return -1;
  }

  return leftNumber - rightNumber;
});

if (!codeOptions.includes(DEFAULT_MOBILE_COUNTRY_CODE)) {
  codeOptions.unshift(DEFAULT_MOBILE_COUNTRY_CODE);
}

export const MOBILE_COUNTRY_CODE_OPTIONS = codeOptions;
