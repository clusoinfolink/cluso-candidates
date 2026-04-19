import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCandidateAuthFromRequest } from "@/lib/auth";
import { SUPPORTED_CURRENCIES, type SupportedCurrency } from "@/lib/currencies";
import { connectMongo } from "@/lib/mongodb";
import Service from "@/lib/models/Service";
import User from "@/lib/models/User";
import VerificationRequest from "@/lib/models/VerificationRequest";

const ALLOWED_UPLOAD_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
]);
const MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024;
const DEFAULT_QUESTION_ICON_KEY = "diary";
const SERVICE_COUNTRY_FIELD_KEY = "system_service_country";
const SERVICE_COUNTRY_FIELD_QUESTION =
  "Country";
const LEGACY_SERVICE_COUNTRY_FIELD_QUESTIONS = new Set([
  "select verification country for this service",
]);
const DEFAULT_SERVICE_COUNTRY_OPTIONS = [
  "Afghanistan",
  "Armenia",
  "Australia",
  "Azerbaijan",
  "Bangladesh",
  "Bhutan",
  "Brunei",
  "Cambodia",
  "China",
  "Fiji",
  "Georgia",
  "Hong Kong",
  "India",
  "Indonesia",
  "Japan",
  "Kazakhstan",
  "Kiribati",
  "Kyrgyzstan",
  "Laos",
  "Macau",
  "Malaysia",
  "Maldives",
  "Marshall Islands",
  "Micronesia",
  "Mongolia",
  "Myanmar",
  "Nauru",
  "Nepal",
  "New Zealand",
  "Pakistan",
  "Palau",
  "Papua New Guinea",
  "Philippines",
  "Samoa",
  "Singapore",
  "Solomon Islands",
  "South Korea",
  "Sri Lanka",
  "Taiwan",
  "Tajikistan",
  "Thailand",
  "Timor-Leste",
  "Tonga",
  "Turkmenistan",
  "Tuvalu",
  "Uzbekistan",
  "Vanuatu",
  "Vietnam",
  "United Arab Emirates",
  "United States",
  "United Kingdom",
];
const DEFAULT_PERSONAL_DETAILS_SERVICE_NAME = "Personal details";
const DEFAULT_PERSONAL_DETAILS_FORM_FIELDS = [
  {
    fieldKey: "personal_full_name",
    question: "Full name (as per government ID)",
    iconKey: "pen",
    fieldType: "text",
    required: true,
    repeatable: false,
    minLength: 2,
    maxLength: 120,
    forceUppercase: false,
    allowNotApplicable: false,
    notApplicableText: "",
    subFields: [],
    dropdownOptions: [],
  },
  {
    fieldKey: "personal_date_of_birth",
    question: "Date of birth",
    iconKey: "calendar",
    fieldType: "date",
    required: true,
    repeatable: false,
    minLength: null,
    maxLength: null,
    forceUppercase: false,
    allowNotApplicable: false,
    notApplicableText: "",
    subFields: [],
    dropdownOptions: [],
  },
  {
    fieldKey: "personal_mobile_number",
    question: "Mobile number",
    iconKey: "phone",
    fieldType: "text",
    required: true,
    repeatable: false,
    minLength: 7,
    maxLength: 20,
    forceUppercase: false,
    allowNotApplicable: false,
    notApplicableText: "",
    subFields: [],
    dropdownOptions: [],
  },
  {
    fieldKey: "personal_email_address",
    question: "Email address",
    iconKey: "email",
    fieldType: "text",
    required: true,
    repeatable: false,
    minLength: 5,
    maxLength: 160,
    forceUppercase: false,
    allowNotApplicable: false,
    notApplicableText: "",
    subFields: [],
    dropdownOptions: [],
  },
  {
    fieldKey: "personal_nationality",
    question: "Nationality",
    iconKey: "global",
    fieldType: "text",
    required: true,
    repeatable: false,
    minLength: 2,
    maxLength: 80,
    forceUppercase: false,
    allowNotApplicable: false,
    notApplicableText: "",
    subFields: [],
    dropdownOptions: [],
  },
  {
    fieldKey: "personal_residential_address",
    question: "Current residential address",
    iconKey: "house",
    fieldType: "long_text",
    required: true,
    repeatable: false,
    minLength: 10,
    maxLength: 400,
    forceUppercase: false,
    allowNotApplicable: false,
    notApplicableText: "",
    subFields: [],
    dropdownOptions: [],
  },
  {
    fieldKey: "personal_gender",
    question: "Gender",
    iconKey: "person",
    fieldType: "dropdown",
    required: true,
    repeatable: false,
    minLength: null,
    maxLength: null,
    forceUppercase: false,
    allowNotApplicable: false,
    notApplicableText: "",
    subFields: [],
    dropdownOptions: ["Male", "Female", "Non-binary", "Prefer not to say"],
  },
  {
    fieldKey: "personal_primary_id_number",
    question: "Primary government ID number",
    iconKey: "id-card",
    fieldType: "text",
    required: true,
    repeatable: false,
    minLength: 4,
    maxLength: 80,
    forceUppercase: true,
    allowNotApplicable: false,
    notApplicableText: "",
    subFields: [],
    dropdownOptions: [],
  },
];
const SUPPORTED_QUESTION_ICON_KEYS = new Set([
  "none",
  "diary",
  "house",
  "pen",
  "calendar",
  "phone",
  "location",
  "id-card",
  "document",
  "work",
  "person",
  "email",
  "company",
  "global",
  "security",
]);

const submitSchema = z.object({
  requestId: z.string().min(1),
  responses: z.array(
    z.object({
      serviceId: z.string().min(1),
      serviceEntryCount: z.number().int().min(1).optional().default(1),
      answers: z.array(
        z.object({
          fieldKey: z.string().optional().default(""),
          question: z.string().min(1),
          value: z.string().optional().default(""),
          repeatable: z.boolean().optional().default(false),
          notApplicable: z.boolean().optional().default(false),
          notApplicableText: z.string().optional().default(""),
          fileName: z.string().optional().default(""),
          fileMimeType: z.string().optional().default(""),
          fileSize: z.number().nullable().optional().default(null),
          fileData: z.string().optional().default(""),
        }),
      ),
    }),
  ),
});

type SubmittedAnswerPayload = {
  value: string;
  repeatable: boolean;
  notApplicable: boolean;
  notApplicableText: string;
  fileName: string;
  fileMimeType: string;
  fileSize: number | null;
  fileData: string;
};

type SubmittedServicePayload = {
  serviceEntryCount: number;
  answers: Map<string, SubmittedAnswerPayload>;
};
type PreviewFieldWidth = "full" | "half" | "third";

type NormalizedServiceFormField = {
  fieldKey: string;
  question: string;
  iconKey: string;
  fieldType: "text" | "long_text" | "number" | "file" | "date" | "dropdown";
  required: boolean;
  repeatable: boolean;
  minLength: number | null;
  maxLength: number | null;
  forceUppercase: boolean;
  allowNotApplicable: boolean;
  notApplicableText: string;
  copyFromPersonalDetailsFieldKey: string;
  previewWidth: PreviewFieldWidth;
  dropdownOptions: string[];
};

type CompanyServiceRateSelection = {
  price: number;
  currency: SupportedCurrency;
  countryRates: Array<{
    country: string;
    price: number;
    currency: SupportedCurrency;
  }>;
};

type CustomerPricingContext = {
  companyCountry: string;
  serviceRatesById: Map<string, CompanyServiceRateSelection>;
};

type RequestSelectedServiceSnapshot = {
  serviceId: string;
  serviceName: string;
  price: number;
  currency: SupportedCurrency;
  yearsOfChecking: string;
};

type CandidateServiceResponseForPricing = {
  serviceId: string;
  serviceEntryCount: number;
  answers: Array<{
    fieldKey?: string;
    question?: string;
    value: string;
    repeatable: boolean;
    notApplicable: boolean;
  }>;
};

type PersonalDetailsServiceTemplate = {
  serviceId: string;
  serviceName: string;
  allowMultipleEntries: boolean;
  multipleEntriesLabel?: string;
  formFields: unknown;
};

function supportsLengthConstraints(fieldType: string) {
  return fieldType === "text" || fieldType === "long_text" || fieldType === "number";
}

function supportsLengthTruncation(fieldType: string) {
  return fieldType === "text" || fieldType === "long_text";
}

function resolveLengthComparableValue(value: string, fieldType: string) {
  if (fieldType === "number") {
    return value.replace(/\D/g, "");
  }

  return value;
}

function resolveLengthUnit(fieldType: string) {
  return fieldType === "number" ? "digits" : "characters";
}

function applyAnswerFormatting(
  rawValue: string,
  field: {
    fieldType:
      | "text"
      | "long_text"
      | "number"
      | "file"
      | "date"
      | "dropdown"
      | "composite";
    forceUppercase?: boolean;
    maxLength?: number | null;
  },
) {
  let nextValue = rawValue;

  if (field.forceUppercase) {
    nextValue = nextValue.toUpperCase();
  }

  if (
    supportsLengthTruncation(field.fieldType) &&
    typeof field.maxLength === "number" &&
    field.maxLength > 0
  ) {
    nextValue = nextValue.slice(0, field.maxLength);
  }

  return nextValue;
}

function normalizePreviewWidth(
  rawPreviewWidth: unknown,
  fieldType: unknown,
): PreviewFieldWidth {
  if (
    rawPreviewWidth === "full" ||
    rawPreviewWidth === "half" ||
    rawPreviewWidth === "third"
  ) {
    return rawPreviewWidth;
  }

  if (fieldType === "file" || fieldType === "long_text") {
    return "full";
  }

  return "half";
}

function parseRepeatableValues(rawValue: string) {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item ?? ""));
    }
  } catch {
    // Keep backward compatibility for old non-JSON values.
  }

  return [rawValue];
}

function isDefaultDropdownOptionValue(rawValue: string, allowedOptions?: string[]) {
  const normalizedValue = rawValue.trim();
  if (!normalizedValue) {
    return true;
  }

  const normalized = normalizedValue.toLowerCase();
  if (normalized !== "select" && normalized !== "select an option") {
    return false;
  }

  if (!Array.isArray(allowedOptions) || allowedOptions.length === 0) {
    return true;
  }

  return !allowedOptions.some((option) => option.trim().toLowerCase() === normalized);
}

function normalizeServiceEntryCount(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 1;
  }

  return Math.max(1, Math.floor(parsed));
}

function normalizeServiceId(serviceId: unknown) {
  return String(serviceId);
}

function isHiddenService(service: {
  hiddenFromCustomerPortal?: unknown;
  isDefaultPersonalDetails?: unknown;
}) {
  return Boolean(service.hiddenFromCustomerPortal || service.isDefaultPersonalDetails);
}

function mergePersonalDetailsFormFields(existingFormFields: unknown) {
  if (!Array.isArray(existingFormFields) || existingFormFields.length === 0) {
    return DEFAULT_PERSONAL_DETAILS_FORM_FIELDS;
  }

  const existingFieldKeys = new Set(
    existingFormFields
      .filter(
        (field): field is { fieldKey?: unknown } =>
          Boolean(field) && typeof field === "object",
      )
      .map((field) => String(field.fieldKey ?? "").trim())
      .filter(Boolean),
  );

  const missingDefaultFields = DEFAULT_PERSONAL_DETAILS_FORM_FIELDS.filter(
    (field) => !existingFieldKeys.has(field.fieldKey),
  );

  if (missingDefaultFields.length === 0) {
    return existingFormFields;
  }

  return [...existingFormFields, ...missingDefaultFields];
}

function toPersonalDetailsServiceTemplate(service: {
  _id: unknown;
  name?: unknown;
  allowMultipleEntries?: unknown;
  multipleEntriesLabel?: unknown;
  formFields?: unknown;
}): PersonalDetailsServiceTemplate {
  return {
    serviceId: String(service._id),
    serviceName:
      typeof service.name === "string" && service.name.trim()
        ? service.name.trim()
        : DEFAULT_PERSONAL_DETAILS_SERVICE_NAME,
    allowMultipleEntries: Boolean(service.allowMultipleEntries),
    multipleEntriesLabel:
      typeof service.multipleEntriesLabel === "string" && service.multipleEntriesLabel.trim()
        ? service.multipleEntriesLabel.trim()
        : undefined,
    formFields: service.formFields ?? DEFAULT_PERSONAL_DETAILS_FORM_FIELDS,
  };
}

async function ensureDefaultPersonalDetailsService(): Promise<PersonalDetailsServiceTemplate> {
  const existingDefault = await Service.findOne({ isDefaultPersonalDetails: true })
    .select(
      "_id name allowMultipleEntries multipleEntriesLabel formFields hiddenFromCustomerPortal isPackage defaultPrice includedServiceIds",
    )
    .lean();

  if (existingDefault) {
    const mergedFormFields = mergePersonalDetailsFormFields(existingDefault.formFields);
    const shouldSeedDefaultFields =
      !Array.isArray(existingDefault.formFields) || existingDefault.formFields.length === 0;
    const shouldBackfillDefaultFields =
      Array.isArray(existingDefault.formFields) &&
      mergedFormFields.length !== existingDefault.formFields.length;

    if (
      !isHiddenService(existingDefault) ||
      Boolean(existingDefault.isPackage) ||
      Number(existingDefault.defaultPrice ?? 0) !== 0 ||
      (existingDefault.includedServiceIds ?? []).length > 0 ||
      shouldSeedDefaultFields ||
      shouldBackfillDefaultFields
    ) {
      await Service.findByIdAndUpdate(existingDefault._id, {
        hiddenFromCustomerPortal: true,
        isDefaultPersonalDetails: true,
        isPackage: false,
        includedServiceIds: [],
        defaultPrice: 0,
        ...(shouldSeedDefaultFields || shouldBackfillDefaultFields
          ? {
              formFields: mergedFormFields,
            }
          : {}),
      });
    }

    return toPersonalDetailsServiceTemplate({
      ...existingDefault,
      formFields: mergedFormFields,
    });
  }

  const existingByName = await Service.findOne({
    name: { $regex: /^personal\s+details$/i },
  })
    .select("_id name allowMultipleEntries multipleEntriesLabel formFields")
    .lean();

  if (existingByName) {
    const mergedFormFields = mergePersonalDetailsFormFields(existingByName.formFields);
    const shouldSeedDefaultFields =
      !Array.isArray(existingByName.formFields) || existingByName.formFields.length === 0;
    const shouldBackfillDefaultFields =
      Array.isArray(existingByName.formFields) &&
      mergedFormFields.length !== existingByName.formFields.length;

    await Service.findByIdAndUpdate(existingByName._id, {
      hiddenFromCustomerPortal: true,
      isDefaultPersonalDetails: true,
      isPackage: false,
      includedServiceIds: [],
      defaultPrice: 0,
      ...(shouldSeedDefaultFields || shouldBackfillDefaultFields
        ? {
            formFields: mergedFormFields,
          }
        : {}),
    });

    return toPersonalDetailsServiceTemplate({
      ...existingByName,
      formFields: mergedFormFields,
    });
  }

  const createdService = await Service.create({
    name: DEFAULT_PERSONAL_DETAILS_SERVICE_NAME,
    description: "System service that captures candidate personal details.",
    defaultPrice: 0,
    defaultCurrency: "INR",
    isPackage: false,
    includedServiceIds: [],
    hiddenFromCustomerPortal: true,
    isDefaultPersonalDetails: true,
    formFields: DEFAULT_PERSONAL_DETAILS_FORM_FIELDS,
  });

  return toPersonalDetailsServiceTemplate(createdService);
}

function normalizeCountryName(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function normalizeCurrency(value: unknown, fallback: SupportedCurrency = "INR") {
  const candidate = String(value ?? "") as SupportedCurrency;
  if (SUPPORTED_CURRENCIES.includes(candidate)) {
    return candidate;
  }

  return fallback;
}

function normalizeCountryRates(
  rawValue: unknown,
  fallbackCurrency: SupportedCurrency,
) {
  if (!Array.isArray(rawValue)) {
    return [] as CompanyServiceRateSelection["countryRates"];
  }

  const dedupedRates = new Map<string, CompanyServiceRateSelection["countryRates"][number]>();

  for (const rawEntry of rawValue) {
    if (!rawEntry || typeof rawEntry !== "object") {
      continue;
    }

    const entry = rawEntry as Record<string, unknown>;
    const country = normalizeCountryName(entry.country);
    const price = Number(entry.price);
    const currency = normalizeCurrency(entry.currency, fallbackCurrency);

    if (!country || !Number.isFinite(price) || price < 0) {
      continue;
    }

    dedupedRates.set(country.toLowerCase(), {
      country,
      price,
      currency,
    });
  }

  return [...dedupedRates.values()];
}

function buildCustomerPricingContext(customer: {
  selectedServices?: Array<{
    serviceId?: unknown;
    price?: unknown;
    currency?: unknown;
    countryRates?: unknown;
  }>;
  partnerProfile?: unknown;
} | null): CustomerPricingContext {
  const partnerProfile = (customer?.partnerProfile ?? null) as {
    companyInformation?: {
      address?: {
        country?: unknown;
      };
    };
    invoicingInformation?: {
      address?: {
        country?: unknown;
      };
    };
  } | null;

  const companyCountry = normalizeCountryName(
    partnerProfile?.companyInformation?.address?.country ||
      partnerProfile?.invoicingInformation?.address?.country ||
      "",
  );

  const serviceRatesById = new Map<string, CompanyServiceRateSelection>();
  for (const selectedService of customer?.selectedServices ?? []) {
    const serviceId = normalizeServiceId(selectedService.serviceId);
    if (!serviceId) {
      continue;
    }

    const currency = normalizeCurrency(selectedService.currency, "INR");
    const price = Number(selectedService.price);

    serviceRatesById.set(serviceId, {
      price: Number.isFinite(price) && price >= 0 ? price : 0,
      currency,
      countryRates: normalizeCountryRates(selectedService.countryRates, currency),
    });
  }

  return {
    companyCountry,
    serviceRatesById,
  };
}

function resolveCountryRateForService(
  serviceRate: CompanyServiceRateSelection,
  selectedCountry: string,
  companyCountry: string,
) {
  const normalizedSelectedCountry = normalizeCountryName(selectedCountry).toLowerCase();
  const normalizedCompanyCountry = normalizeCountryName(companyCountry).toLowerCase();

  if (normalizedSelectedCountry) {
    const directMatch = serviceRate.countryRates.find(
      (rate) => normalizeCountryName(rate.country).toLowerCase() === normalizedSelectedCountry,
    );

    if (directMatch) {
      return {
        price: directMatch.price,
        currency: directMatch.currency,
      };
    }
  }

  if (normalizedCompanyCountry) {
    const companyCountryMatch = serviceRate.countryRates.find(
      (rate) => normalizeCountryName(rate.country).toLowerCase() === normalizedCompanyCountry,
    );

    if (companyCountryMatch) {
      return {
        price: companyCountryMatch.price,
        currency: companyCountryMatch.currency,
      };
    }
  }

  return {
    price: serviceRate.price,
    currency: serviceRate.currency,
  };
}

function resolveServiceCountryOptions(
  serviceRate: CompanyServiceRateSelection | undefined,
  requestVerificationCountry: unknown,
  companyCountry: unknown,
) {
  const orderedCountries = new Map<string, string>();

  for (const defaultCountry of DEFAULT_SERVICE_COUNTRY_OPTIONS) {
    orderedCountries.set(defaultCountry.toLowerCase(), defaultCountry);
  }

  for (const countryRate of serviceRate?.countryRates ?? []) {
    const normalizedCountry = normalizeCountryName(countryRate.country);
    if (normalizedCountry) {
      orderedCountries.set(normalizedCountry.toLowerCase(), normalizedCountry);
    }
  }

  const requestCountry = normalizeCountryName(requestVerificationCountry);
  if (requestCountry) {
    orderedCountries.set(requestCountry.toLowerCase(), requestCountry);
  }

  const fallbackCompanyCountry = normalizeCountryName(companyCountry);
  if (fallbackCompanyCountry) {
    orderedCountries.set(fallbackCompanyCountry.toLowerCase(), fallbackCompanyCountry);
  }

  return [...orderedCountries.values()];
}

function createServiceCountrySystemField(
  dropdownOptions: string[],
): NormalizedServiceFormField {
  return {
    fieldKey: SERVICE_COUNTRY_FIELD_KEY,
    question: SERVICE_COUNTRY_FIELD_QUESTION,
    iconKey: "global",
    fieldType: "dropdown",
    required: true,
    repeatable: false,
    minLength: null,
    maxLength: null,
    forceUppercase: false,
    allowNotApplicable: false,
    notApplicableText: "Not Applicable",
    copyFromPersonalDetailsFieldKey: "",
    previewWidth: "half",
    dropdownOptions: dropdownOptions.length > 0 ? dropdownOptions : [...DEFAULT_SERVICE_COUNTRY_OPTIONS],
  };
}

function ensureServiceCountrySystemField(
  fields: NormalizedServiceFormField[],
  dropdownOptions: string[],
  includeSystemField: boolean,
) {
  const resolvedDropdownOptions =
    dropdownOptions.length > 0
      ? dropdownOptions
      : [...DEFAULT_SERVICE_COUNTRY_OPTIONS];

  const nextFields: NormalizedServiceFormField[] = [];
  let hasSystemField = false;

  for (const field of fields) {
    const isSystemField =
      String(field.fieldKey ?? "").trim() === SERVICE_COUNTRY_FIELD_KEY;

    if (!isSystemField) {
      nextFields.push(field);
      continue;
    }

    if (!includeSystemField || hasSystemField) {
      continue;
    }

    nextFields.push({
      ...field,
      fieldKey: SERVICE_COUNTRY_FIELD_KEY,
      question: SERVICE_COUNTRY_FIELD_QUESTION,
      iconKey: "global",
      fieldType: "dropdown",
      required: true,
      repeatable: false,
      minLength: null,
      maxLength: null,
      forceUppercase: false,
      allowNotApplicable: false,
      notApplicableText: "Not Applicable",
      copyFromPersonalDetailsFieldKey: "",
      previewWidth: normalizePreviewWidth(field.previewWidth, "dropdown"),
      dropdownOptions: resolvedDropdownOptions,
    });

    hasSystemField = true;
  }

  if (includeSystemField && !hasSystemField) {
    nextFields.push(createServiceCountrySystemField(resolvedDropdownOptions));
  }

  return nextFields;
}

function extractCountrySelectionsFromAnswers(
  answers: CandidateServiceResponseForPricing["answers"],
) {
  const countryAnswer = answers.find((answer) => {
    const normalizedFieldKey = normalizeCountryName(answer.fieldKey);
    if (normalizedFieldKey === SERVICE_COUNTRY_FIELD_KEY) {
      return true;
    }

    // Fallback for older stored answers that may not include the system field key.
    const normalizedQuestion = normalizeCountryName(answer.question).toLowerCase();
    return LEGACY_SERVICE_COUNTRY_FIELD_QUESTIONS.has(normalizedQuestion);
  });

  if (!countryAnswer || countryAnswer.notApplicable) {
    return [] as string[];
  }

  const rawSelections = countryAnswer.repeatable
    ? parseRepeatableValues(countryAnswer.value)
    : [countryAnswer.value];

  return rawSelections.map((entry) => normalizeCountryName(entry)).filter(Boolean);
}

function repriceSelectedServicesByCountry(
  selectedServices: RequestSelectedServiceSnapshot[],
  candidateFormResponses: CandidateServiceResponseForPricing[],
  customerPricingContext: CustomerPricingContext,
  requestVerificationCountry: unknown,
) {
  const responsesByServiceId = new Map(
    candidateFormResponses.map((response) => [normalizeServiceId(response.serviceId), response]),
  );
  const fallbackRequestCountry = normalizeCountryName(requestVerificationCountry);

  return selectedServices.map((selectedService) => {
    const configuredServiceRate = customerPricingContext.serviceRatesById.get(
      selectedService.serviceId,
    );
    if (!configuredServiceRate) {
      return selectedService;
    }

    const submittedResponse = responsesByServiceId.get(selectedService.serviceId);
    const selectedCountries = submittedResponse
      ? extractCountrySelectionsFromAnswers(submittedResponse.answers)
      : [];
    const entryCount = submittedResponse
      ? normalizeServiceEntryCount(submittedResponse.serviceEntryCount)
      : 1;

    const resolvedRates = Array.from({ length: entryCount }, (_unused, index) => {
      const selectedCountryForEntry =
        selectedCountries[index] ||
        selectedCountries[0] ||
        fallbackRequestCountry ||
        customerPricingContext.companyCountry;

      return resolveCountryRateForService(
        configuredServiceRate,
        selectedCountryForEntry,
        customerPricingContext.companyCountry,
      );
    });

    const resolvedCurrencies = [...new Set(resolvedRates.map((rate) => rate.currency))];
    if (resolvedCurrencies.length > 1) {
      const fallbackRate = resolveCountryRateForService(
        configuredServiceRate,
        selectedCountries[0] || fallbackRequestCountry,
        customerPricingContext.companyCountry,
      );

      return {
        ...selectedService,
        price: roundMoney(fallbackRate.price),
        currency: fallbackRate.currency,
      };
    }

    const totalPrice = resolvedRates.reduce((sum, rate) => sum + rate.price, 0);
    return {
      ...selectedService,
      price: roundMoney(totalPrice / Math.max(1, entryCount)),
      currency: resolvedCurrencies[0] ?? selectedService.currency,
    };
  });
}

function resolveFieldKey(rawFieldKey: unknown, question: string, index: number) {
  const normalizedFieldKey = String(rawFieldKey ?? "").trim();
  if (normalizedFieldKey) {
    return normalizedFieldKey;
  }

  const normalizedQuestion = question
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);

  return `legacy_${normalizedQuestion || "field"}_${index + 1}`;
}

function normalizeQuestionIconKey(rawIconKey: unknown) {
  if (typeof rawIconKey !== "string") {
    return DEFAULT_QUESTION_ICON_KEY;
  }

  const normalized = rawIconKey.trim().toLowerCase();
  return SUPPORTED_QUESTION_ICON_KEYS.has(normalized)
    ? normalized
    : DEFAULT_QUESTION_ICON_KEY;
}

function normalizeDropdownOptions(rawOptions: unknown) {
  if (!Array.isArray(rawOptions)) {
    return [] as string[];
  }

  return [...new Set(rawOptions.map((option) => String(option ?? "").trim()).filter(Boolean))];
}

function normalizePersonalDetailsSourceFieldKey(rawFieldKey: unknown) {
  return String(rawFieldKey ?? "").trim().slice(0, 120);
}

function normalizeSubFieldType(rawFieldType: unknown): "text" | "number" | "date" | "dropdown" {
  if (rawFieldType === "text" || rawFieldType === "number" || rawFieldType === "date" || rawFieldType === "dropdown") {
    return rawFieldType;
  }

  return "text";
}

function expandServiceFormFields(
  rawFields: unknown,
  dropdownOptions: string[] = DEFAULT_SERVICE_COUNTRY_OPTIONS,
  includeSystemField = true,
): NormalizedServiceFormField[] {
  if (!Array.isArray(rawFields)) {
    return ensureServiceCountrySystemField([], dropdownOptions, includeSystemField);
  }

  const expandedFields: NormalizedServiceFormField[] = [];

  rawFields.forEach((rawField, index) => {
    if (!rawField || typeof rawField !== "object") {
      return;
    }

    const field = rawField as {
      fieldKey?: unknown;
      question?: unknown;
      iconKey?: unknown;
      fieldType?: unknown;
      subFields?: unknown;
      dropdownOptions?: unknown;
      required?: unknown;
      repeatable?: unknown;
      minLength?: unknown;
      maxLength?: unknown;
      forceUppercase?: unknown;
      allowNotApplicable?: unknown;
      notApplicableText?: unknown;
      copyFromPersonalDetailsFieldKey?: unknown;
      previewWidth?: unknown;
    };

    const baseQuestion = String(field.question ?? "").trim();
    const baseFieldKey = resolveFieldKey(field.fieldKey, baseQuestion, index);
    const iconKey = normalizeQuestionIconKey(field.iconKey);
    const required = Boolean(field.required);
    const minLength = typeof field.minLength === "number" ? field.minLength : null;
    const maxLength = typeof field.maxLength === "number" ? field.maxLength : null;
    const forceUppercase = Boolean(field.forceUppercase);
    const allowNotApplicable = Boolean(field.allowNotApplicable);
    const notApplicableText =
      typeof field.notApplicableText === "string" && field.notApplicableText.trim()
        ? field.notApplicableText.trim()
        : "Not Applicable";
    const previewWidth = normalizePreviewWidth(field.previewWidth, field.fieldType);
    const fieldTypeRaw = String(field.fieldType ?? "").trim().toLowerCase();

    if (fieldTypeRaw === "composite" && Array.isArray(field.subFields) && field.subFields.length > 0) {
      field.subFields.forEach((rawSubField, subIndex) => {
        if (!rawSubField || typeof rawSubField !== "object") {
          return;
        }

        const subField = rawSubField as {
          fieldKey?: unknown;
          question?: unknown;
          fieldType?: unknown;
          dropdownOptions?: unknown;
          required?: unknown;
        };

        const subQuestion = String(subField.question ?? "").trim();
        if (!subQuestion) {
          return;
        }

        const subFieldType = normalizeSubFieldType(subField.fieldType);
        const subFieldKey = String(subField.fieldKey ?? "").trim() || `${baseFieldKey}__sub_${subIndex + 1}`;

        expandedFields.push({
          fieldKey: subFieldKey,
          question: baseQuestion ? `${baseQuestion} - ${subQuestion}` : subQuestion,
          iconKey,
          fieldType: subFieldType,
          required: Boolean(subField.required) || required,
          repeatable: false,
          minLength: supportsLengthConstraints(subFieldType) ? minLength : null,
          maxLength: supportsLengthConstraints(subFieldType) ? maxLength : null,
          forceUppercase: subFieldType === "text" ? forceUppercase : false,
          allowNotApplicable,
          notApplicableText,
          copyFromPersonalDetailsFieldKey: "",
          previewWidth,
          dropdownOptions:
            subFieldType === "dropdown"
              ? normalizeDropdownOptions(subField.dropdownOptions)
              : [],
        });
      });

      return;
    }

    const fieldType: NormalizedServiceFormField["fieldType"] =
      fieldTypeRaw === "long_text" ||
      fieldTypeRaw === "number" ||
      fieldTypeRaw === "file" ||
      fieldTypeRaw === "date" ||
      fieldTypeRaw === "dropdown"
        ? fieldTypeRaw
        : "text";

    expandedFields.push({
      fieldKey: baseFieldKey,
      question: baseQuestion,
      iconKey,
      fieldType,
      required,
      repeatable: fieldType === "file" ? false : Boolean(field.repeatable),
      minLength: supportsLengthConstraints(fieldType) ? minLength : null,
      maxLength: supportsLengthConstraints(fieldType) ? maxLength : null,
      forceUppercase:
        (fieldType === "text" || fieldType === "long_text") && forceUppercase,
      allowNotApplicable,
      notApplicableText,
      copyFromPersonalDetailsFieldKey:
        fieldType === "file"
          ? ""
          : normalizePersonalDetailsSourceFieldKey(
              field.copyFromPersonalDetailsFieldKey,
            ),
      previewWidth: normalizePreviewWidth(field.previewWidth, fieldType),
      dropdownOptions:
        fieldType === "dropdown" ? normalizeDropdownOptions(field.dropdownOptions) : [],
    });
  });

  return ensureServiceCountrySystemField(
    expandedFields,
    dropdownOptions,
    includeSystemField,
  );
}

function resolveServiceLayoutSourceFields(service: {
  formFields?: unknown;
  candidateLayoutSnapshot?: unknown;
}) {
  if (
    Array.isArray(service.candidateLayoutSnapshot) &&
    service.candidateLayoutSnapshot.length > 0
  ) {
    return service.candidateLayoutSnapshot;
  }

  return service.formFields ?? [];
}

function candidateOwnershipFilter(candidateEmail: string, candidateUserId: string) {
  return {
    candidateEmail,
    $or: [
      { candidateUser: candidateUserId },
      { candidateUser: null },
      { candidateUser: { $exists: false } },
    ],
  };
}

export async function GET(req: NextRequest) {
  const auth = await getCandidateAuthFromRequest(req);
  if (!auth || auth.role !== "candidate") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectMongo();

  const candidate = await User.findById(auth.userId).select("email role").lean();
  if (!candidate || candidate.role !== "candidate") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const candidateEmail = candidate.email.trim().toLowerCase();

  const items = await VerificationRequest.find(
    candidateOwnershipFilter(candidateEmail, auth.userId),
  )
    .sort({ createdAt: -1 })
    .lean();
  const personalDetailsService = await ensureDefaultPersonalDetailsService();

  const customerIds = [...new Set(items.map((item) => String(item.customer)))];
  const customers =
    customerIds.length > 0
      ? await User.find({ _id: { $in: customerIds } })
          .select("name email selectedServices partnerProfile")
          .lean()
      : [];
  const customerMap = new Map(
    customers.map((customer) => [String(customer._id), customer]),
  );
  const customerPricingContextMap = new Map(
    customers.map((customer) => [
      String(customer._id),
      buildCustomerPricingContext({
        selectedServices: customer.selectedServices,
        partnerProfile: (customer as { partnerProfile?: unknown }).partnerProfile,
      }),
    ]),
  );

  const selectedServiceIds = [
    ...new Set(
      items.flatMap((item) =>
        (item.selectedServices ?? []).map((service) => normalizeServiceId(service.serviceId)),
      ),
    ),
  ];

  const services =
    selectedServiceIds.length > 0
      ? await Service.find({ _id: { $in: selectedServiceIds } })
          .select(
            "name allowMultipleEntries multipleEntriesLabel formFields candidateLayoutSnapshot isPackage hiddenFromCustomerPortal isDefaultPersonalDetails",
          )
          .lean()
      : [];

  const serviceMap = new Map(
    services.map((service) => [
      String(service._id),
      {
        name: service.name,
        allowMultipleEntries: Boolean(service.allowMultipleEntries),
        multipleEntriesLabel: service.multipleEntriesLabel ?? undefined,
        hiddenFromCustomerPortal: isHiddenService(service),
        includeSystemCountryField: !Boolean(
          service.isPackage ||
            service.hiddenFromCustomerPortal ||
            service.isDefaultPersonalDetails,
        ),
        formFields: expandServiceFormFields(
          resolveServiceLayoutSourceFields(service),
          DEFAULT_SERVICE_COUNTRY_OPTIONS,
          !Boolean(
            service.isPackage ||
              service.hiddenFromCustomerPortal ||
              service.isDefaultPersonalDetails,
          ),
        ),
      },
    ]),
  );

  const enriched = items.map((item) => {
    const customer = customerMap.get(String(item.customer));
    const customerPricingContext = customerPricingContextMap.get(String(item.customer));
    const selectedServices = (item.selectedServices ?? []).map((service) => ({
      serviceId: normalizeServiceId(service.serviceId),
      serviceName: service.serviceName,
      price: service.price,
      currency: service.currency,
      yearsOfChecking:
        typeof service.yearsOfChecking === "string" ? service.yearsOfChecking : "default",
    })).filter(
      (service) => !serviceMap.get(service.serviceId)?.hiddenFromCustomerPortal,
    );

    const selectedServiceForms = selectedServices.map((selectedService) => {
      const serviceDefinition = serviceMap.get(selectedService.serviceId);
      const serviceRate = customerPricingContext?.serviceRatesById.get(
        selectedService.serviceId,
      );
      const countryOptions = resolveServiceCountryOptions(
        serviceRate,
        item.verificationCountry,
        customerPricingContext?.companyCountry ?? "",
      );

      return {
        serviceId: selectedService.serviceId,
        serviceName: selectedService.serviceName,
        allowMultipleEntries: Boolean(serviceDefinition?.allowMultipleEntries),
        multipleEntriesLabel: serviceDefinition?.multipleEntriesLabel,
        fields: ensureServiceCountrySystemField(
          serviceDefinition?.formFields ?? [],
          countryOptions,
          Boolean(serviceDefinition?.includeSystemCountryField),
        ),
      };
    });

    const personalDetailsForm =
      selectedServiceForms.find(
        (serviceForm) => serviceForm.serviceId === personalDetailsService.serviceId,
      ) ?? {
        serviceId: personalDetailsService.serviceId,
        serviceName: personalDetailsService.serviceName,
        allowMultipleEntries: personalDetailsService.allowMultipleEntries,
        multipleEntriesLabel: personalDetailsService.multipleEntriesLabel,
        fields: expandServiceFormFields(
          personalDetailsService.formFields,
          DEFAULT_SERVICE_COUNTRY_OPTIONS,
          false,
        ),
      };

    const serviceForms = [
      personalDetailsForm,
      ...selectedServiceForms.filter(
        (serviceForm) => serviceForm.serviceId !== personalDetailsService.serviceId,
      ),
    ];

    return {
      _id: String(item._id),
      candidateName: item.candidateName,
      candidateEmail: item.candidateEmail,
      candidatePhone: item.candidatePhone,
      customerName: customer?.name ?? "Unknown",
      customerEmail: customer?.email ?? "Unknown",
      status: item.status,
      candidateFormStatus: item.candidateFormStatus ?? "pending",
      candidateSubmittedAt: item.candidateSubmittedAt ?? null,
      rejectionNote: item.rejectionNote ?? "",
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      selectedServices,
      serviceForms,
      candidateFormResponses: (item.candidateFormResponses ?? []).map((serviceResponse) => ({
        serviceId: normalizeServiceId(serviceResponse.serviceId),
        serviceName: serviceResponse.serviceName,
        serviceEntryCount: normalizeServiceEntryCount(serviceResponse.serviceEntryCount),
        answers: (serviceResponse.answers ?? []).map((answer, answerIndex) => ({
          fieldKey: resolveFieldKey(answer.fieldKey, answer.question, answerIndex),
          question: answer.question,
          fieldType: answer.fieldType,
          required: Boolean(answer.required),
          repeatable: Boolean(answer.repeatable),
          notApplicable: Boolean(answer.notApplicable),
          notApplicableText: answer.notApplicableText ?? "",
          value: answer.value,
          fileName: answer.fileName ?? "",
          fileMimeType: answer.fileMimeType ?? "",
          fileSize: answer.fileSize ?? null,
          fileData: answer.fileData ?? "",
        })),
      })),
      customerRejectedFields: (item.customerRejectedFields ?? []).map((field, fieldIndex) => ({
        serviceId: normalizeServiceId(field.serviceId),
        serviceName: field.serviceName,
        fieldKey: resolveFieldKey(field.fieldKey, field.question, fieldIndex),
        question: field.question,
        fieldType: field.fieldType,
      })),
    };
  });

  return NextResponse.json({ items: enriched });
}

export async function PATCH(req: NextRequest) {
  const auth = await getCandidateAuthFromRequest(req);
  if (!auth || auth.role !== "candidate") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = submitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid form input." }, { status: 400 });
  }

  await connectMongo();

  const candidate = await User.findById(auth.userId).select("email role").lean();
  if (!candidate || candidate.role !== "candidate") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const candidateEmail = candidate.email.trim().toLowerCase();

  const requestDoc = await VerificationRequest.findOne({
    _id: parsed.data.requestId,
    ...candidateOwnershipFilter(candidateEmail, auth.userId),
  }).lean();

  if (!requestDoc) {
    return NextResponse.json({ error: "Request not found." }, { status: 404 });
  }

  if (requestDoc.status === "approved" || requestDoc.status === "verified") {
    return NextResponse.json(
      { error: "Approved or verified requests cannot be edited." },
      { status: 400 },
    );
  }

  const selectedServices = (requestDoc.selectedServices ?? []).map((service) => ({
    serviceId: normalizeServiceId(service.serviceId),
    serviceName: service.serviceName,
    price:
      typeof service.price === "number" && Number.isFinite(service.price)
        ? service.price
        : 0,
    currency: normalizeCurrency(service.currency, "INR"),
    yearsOfChecking:
      typeof service.yearsOfChecking === "string" ? service.yearsOfChecking : "default",
  }));

  const customerForPricing = await User.findById(requestDoc.customer)
    .select("selectedServices partnerProfile")
    .lean();
  const customerPricingContext = buildCustomerPricingContext(
    customerForPricing
      ? {
          selectedServices: customerForPricing.selectedServices,
          partnerProfile: (customerForPricing as { partnerProfile?: unknown }).partnerProfile,
        }
      : null,
  );

  const personalDetailsService = await ensureDefaultPersonalDetailsService();

  const selectedServiceIds = selectedServices.map((service) => service.serviceId);
  const services = await Service.find({ _id: { $in: selectedServiceIds } })
    .select(
      "name allowMultipleEntries multipleEntriesLabel formFields candidateLayoutSnapshot isPackage hiddenFromCustomerPortal isDefaultPersonalDetails",
    )
    .lean();

  const serviceMap = new Map(
    services.map((service) => [
      String(service._id),
      {
        name: service.name,
        allowMultipleEntries: Boolean(service.allowMultipleEntries),
        multipleEntriesLabel: service.multipleEntriesLabel ?? undefined,
        hiddenFromCustomerPortal: isHiddenService(service),
        includeSystemCountryField: !Boolean(
          service.isPackage ||
            service.hiddenFromCustomerPortal ||
            service.isDefaultPersonalDetails,
        ),
        formFields: expandServiceFormFields(
          resolveServiceLayoutSourceFields(service),
          DEFAULT_SERVICE_COUNTRY_OPTIONS,
          !Boolean(
            service.isPackage ||
              service.hiddenFromCustomerPortal ||
              service.isDefaultPersonalDetails,
          ),
        ),
      },
    ]),
  );

  const billableSelectedServices = selectedServices.filter(
    (selectedService) => !serviceMap.get(selectedService.serviceId)?.hiddenFromCustomerPortal,
  );

  const requiredServiceForms = billableSelectedServices.map((selectedService) => {
    const serviceDefinition = serviceMap.get(selectedService.serviceId);
    const serviceRate = customerPricingContext.serviceRatesById.get(selectedService.serviceId);
    const countryOptions = resolveServiceCountryOptions(
      serviceRate,
      requestDoc.verificationCountry,
      customerPricingContext.companyCountry,
    );

    return {
      serviceId: selectedService.serviceId,
      serviceName: selectedService.serviceName,
      allowMultipleEntries: Boolean(serviceDefinition?.allowMultipleEntries),
      formFields: ensureServiceCountrySystemField(
        serviceDefinition?.formFields ?? [],
        countryOptions,
        Boolean(serviceDefinition?.includeSystemCountryField),
      ),
    };
  });

  if (
    !requiredServiceForms.some(
      (serviceForm) => serviceForm.serviceId === personalDetailsService.serviceId,
    )
  ) {
    requiredServiceForms.push({
      serviceId: personalDetailsService.serviceId,
      serviceName: personalDetailsService.serviceName,
      allowMultipleEntries: personalDetailsService.allowMultipleEntries,
      formFields: expandServiceFormFields(
        personalDetailsService.formFields,
        DEFAULT_SERVICE_COUNTRY_OPTIONS,
        false,
      ),
    });
  }

  const responseMap = new Map<string, SubmittedServicePayload>(
    parsed.data.responses.map((serviceResponse) => [
      normalizeServiceId(serviceResponse.serviceId),
      (() => {
        const serviceAnswerMap = new Map<string, SubmittedAnswerPayload>();

        for (const answer of serviceResponse.answers) {
          const normalizedQuestion = answer.question.trim();
          const normalizedFieldKey = answer.fieldKey?.trim() ?? "";
          const payload = {
            value: answer.value?.trim() ?? "",
            repeatable: Boolean(answer.repeatable),
            notApplicable: Boolean(answer.notApplicable),
            notApplicableText: answer.notApplicableText?.trim() ?? "",
            fileName: answer.fileName?.trim() ?? "",
            fileMimeType: answer.fileMimeType?.trim().toLowerCase() ?? "",
            fileSize: answer.fileSize ?? null,
            fileData: answer.fileData?.trim() ?? "",
          };

          if (normalizedFieldKey) {
            serviceAnswerMap.set(`key:${normalizedFieldKey}`, payload);
          }

          serviceAnswerMap.set(`question:${normalizedQuestion}`, payload);
        }

        return {
          serviceEntryCount: normalizeServiceEntryCount(serviceResponse.serviceEntryCount),
          answers: serviceAnswerMap,
        };
      })(),
    ]),
  );

  let validationError = "";

  const candidateFormResponses = requiredServiceForms.map((serviceForm) => {
    const serviceAllowsMultipleEntries = serviceForm.allowMultipleEntries;
    const formFields = serviceForm.formFields;
    const submittedServicePayload = responseMap.get(serviceForm.serviceId);
    const submittedAnswers = submittedServicePayload?.answers ?? new Map<string, SubmittedAnswerPayload>();
    const serviceEntryCount = serviceAllowsMultipleEntries
      ? normalizeServiceEntryCount(submittedServicePayload?.serviceEntryCount)
      : 1;

    const answers = formFields.map((field) => {
      const incomingAnswer =
        (field.fieldKey ? submittedAnswers.get(`key:${field.fieldKey}`) : undefined) ??
        submittedAnswers.get(`question:${field.question.trim()}`) ?? {
        value: "",
        repeatable: false,
        notApplicable: false,
        notApplicableText: "",
        fileName: "",
        fileMimeType: "",
        fileSize: null,
        fileData: "",
      };
      const value = incomingAnswer.value ?? "";
      const fileName = incomingAnswer.fileName ?? "";
      const fileMimeType = incomingAnswer.fileMimeType ?? "";
      const fileSize = incomingAnswer.fileSize;
      const fileData = incomingAnswer.fileData ?? "";
      const isRequired = Boolean(field.required);
      const isRepeatable =
        field.fieldType !== "file" &&
        (Boolean(field.repeatable) || serviceAllowsMultipleEntries);
      const allowNotApplicable = Boolean(field.allowNotApplicable);
      const notApplicableText = field.notApplicableText?.trim() || "Not Applicable";
      const isNotApplicable =
        !serviceAllowsMultipleEntries &&
        allowNotApplicable &&
        Boolean(incomingAnswer.notApplicable);
      const hasLengthConstraints = supportsLengthConstraints(field.fieldType);

      const normalizedValue = applyAnswerFormatting(value, field);

      const trimmedValue = normalizedValue.trim();
      const isDropdownWithDefaultSelection =
        field.fieldType === "dropdown" &&
        isDefaultDropdownOptionValue(trimmedValue, field.dropdownOptions);
      const normalizedTrimmedValue = isDropdownWithDefaultSelection ? "" : trimmedValue;
      const persistedValue = isDropdownWithDefaultSelection ? "" : normalizedValue;

      if (isNotApplicable) {
        return {
          fieldKey: field.fieldKey,
          question: field.question,
          fieldType: field.fieldType,
          required: isRequired,
          repeatable: false,
          notApplicable: true,
          notApplicableText,
          value: notApplicableText,
          fileName: "",
          fileMimeType: "",
          fileSize: null,
          fileData: "",
        };
      }

      if (field.fieldType === "file") {
        if (isRequired && !fileData && !validationError) {
          validationError = `${field.question} is required.`;
        }

        if (fileData) {
          if (!ALLOWED_UPLOAD_MIME_TYPES.has(fileMimeType) && !validationError) {
            validationError = `${field.question}: only PDF, JPG, and PNG are allowed.`;
          }

          if (
            (typeof fileSize !== "number" ||
              !Number.isFinite(fileSize) ||
              fileSize <= 0 ||
              fileSize > MAX_UPLOAD_SIZE_BYTES) &&
            !validationError
          ) {
            validationError = `${field.question}: file size must be 5MB or less.`;
          }
        }

        return {
          fieldKey: field.fieldKey,
          question: field.question,
          fieldType: field.fieldType,
          required: isRequired,
          repeatable: false,
          notApplicable: false,
          notApplicableText: "",
          value: fileName || value,
          fileName,
          fileMimeType,
          fileSize,
          fileData,
        };
      }

      if (isRepeatable) {
        const parsedValues = parseRepeatableValues(value);
        const normalizedValues = parsedValues
          .map((entry) => applyAnswerFormatting(entry, field).trim())
          .map((entry) =>
            field.fieldType === "dropdown" && isDefaultDropdownOptionValue(entry, field.dropdownOptions)
              ? ""
              : entry,
          )
          .filter(Boolean);
        const isNotApplicableRepeatableEntry = (entry: string) =>
          allowNotApplicable && entry === notApplicableText;

        if (isRequired && normalizedValues.length === 0 && !validationError) {
          validationError = `${field.question} is required.`;
        }

        if (field.fieldType === "number") {
          for (const entry of normalizedValues) {
            if (isNotApplicableRepeatableEntry(entry)) {
              continue;
            }

            const parsedNumber = Number(entry);
            if (Number.isNaN(parsedNumber) && !validationError) {
              validationError = `${field.question} must contain valid numbers.`;
            }
          }
        }

        if (field.fieldType === "date") {
          for (const entry of normalizedValues) {
            if (isNotApplicableRepeatableEntry(entry)) {
              continue;
            }

            const isIsoDate = /^\d{4}-\d{2}-\d{2}$/.test(entry);
            const dateValue = new Date(`${entry}T00:00:00.000Z`);
            if ((!isIsoDate || Number.isNaN(dateValue.getTime())) && !validationError) {
              validationError = `${field.question} must contain valid dates.`;
            }
          }
        }

        if (field.fieldType === "dropdown") {
          for (const entry of normalizedValues) {
            if (isNotApplicableRepeatableEntry(entry)) {
              continue;
            }

            if (!field.dropdownOptions.includes(entry) && !validationError) {
              validationError = `${field.question} must match one of the configured options.`;
            }
          }
        }

        if (hasLengthConstraints) {
          for (const entry of normalizedValues) {
            if (isNotApplicableRepeatableEntry(entry)) {
              continue;
            }

            const comparableLengthValue = resolveLengthComparableValue(entry, field.fieldType);
            const lengthUnit = resolveLengthUnit(field.fieldType);

            if (
              typeof field.minLength === "number" &&
              comparableLengthValue.length < field.minLength &&
              !validationError
            ) {
              validationError = `${field.question} entries must be at least ${field.minLength} ${lengthUnit}.`;
            }

            if (
              typeof field.maxLength === "number" &&
              comparableLengthValue.length > field.maxLength &&
              !validationError
            ) {
              validationError = `${field.question} entries must be ${field.maxLength} ${lengthUnit} or fewer.`;
            }
          }
        }

        const hasNotApplicableEntries = normalizedValues.some((entry) =>
          isNotApplicableRepeatableEntry(entry),
        );
        const allNotApplicable =
          hasNotApplicableEntries &&
          normalizedValues.every((entry) => isNotApplicableRepeatableEntry(entry));

        return {
          fieldKey: field.fieldKey,
          question: field.question,
          fieldType: field.fieldType,
          required: isRequired,
          repeatable: true,
          notApplicable: allNotApplicable,
          notApplicableText: hasNotApplicableEntries ? notApplicableText : "",
          value: JSON.stringify(normalizedValues),
          fileName: "",
          fileMimeType: "",
          fileSize: null,
          fileData: "",
        };
      }

      if (isRequired && !normalizedTrimmedValue && !validationError) {
        validationError = `${field.question} is required.`;
      }

      if (field.fieldType === "number" && normalizedTrimmedValue) {
        const parsedNumber = Number(normalizedTrimmedValue);
        if (Number.isNaN(parsedNumber) && !validationError) {
          validationError = `${field.question} must be a valid number.`;
        }
      }

      if (field.fieldType === "date" && normalizedTrimmedValue) {
        const isIsoDate = /^\d{4}-\d{2}-\d{2}$/.test(normalizedTrimmedValue);
        const dateValue = new Date(`${normalizedTrimmedValue}T00:00:00.000Z`);
        if ((!isIsoDate || Number.isNaN(dateValue.getTime())) && !validationError) {
          validationError = `${field.question} must be a valid date.`;
        }
      }

      if (
        field.fieldType === "dropdown" &&
        normalizedTrimmedValue &&
        !field.dropdownOptions.includes(normalizedTrimmedValue) &&
        !validationError
      ) {
        validationError = `${field.question} must match one of the configured options.`;
      }

      if (hasLengthConstraints && normalizedTrimmedValue) {
        const comparableLengthValue = resolveLengthComparableValue(
          normalizedTrimmedValue,
          field.fieldType,
        );
        const lengthUnit = resolveLengthUnit(field.fieldType);

        if (
          typeof field.minLength === "number" &&
          comparableLengthValue.length < field.minLength &&
          !validationError
        ) {
          validationError = `${field.question} must be at least ${field.minLength} ${lengthUnit}.`;
        }

        if (
          typeof field.maxLength === "number" &&
          comparableLengthValue.length > field.maxLength &&
          !validationError
        ) {
          validationError = `${field.question} must be ${field.maxLength} ${lengthUnit} or fewer.`;
        }
      }

      return {
        fieldKey: field.fieldKey,
        question: field.question,
        fieldType: field.fieldType,
        required: isRequired,
        repeatable: false,
        notApplicable: false,
        notApplicableText: "",
        value: persistedValue,
        fileName: "",
        fileMimeType: "",
        fileSize: null,
        fileData: "",
      };
    });

    return {
      serviceId: serviceForm.serviceId,
      serviceName: serviceForm.serviceName,
      serviceEntryCount,
      answers,
    };
  });

  if (validationError) {
    return NextResponse.json(
      { error: validationError },
      { status: 400 },
    );
  }

  const repricedSelectedServices = repriceSelectedServicesByCountry(
    billableSelectedServices,
    candidateFormResponses,
    customerPricingContext,
    requestDoc.verificationCountry,
  );

  await VerificationRequest.findByIdAndUpdate(parsed.data.requestId, {
    candidateUser: auth.userId,
    candidateEmail,
    selectedServices: repricedSelectedServices,
    candidateFormResponses,
    customerRejectedFields: [],
    candidateFormStatus: "submitted",
    candidateSubmittedAt: new Date(),
    status: "pending",
    rejectionNote: "",
  });

  return NextResponse.json({ message: "Form submitted. Your request is now in admin review queue." });
}
