"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ChevronDown,
  Sparkles,
  NotebookPen,
  House,
  PenLine,
  Calendar,
  Phone,
  MapPin,
  IdCard,
  FileText,
  Briefcase,
  User,
  Mail,
  Building2,
  Globe,
  ShieldCheck,
} from "lucide-react";
import { PortalFrame } from "@/components/dashboard/PortalFrame";
import { BlockCard, BlockTitle } from "@/components/ui/blocks";
import { getAlertTone } from "@/lib/alerts";
import { formatRequestedHistoryWindow } from "@/lib/history";
import { usePortalSession } from "@/lib/hooks/usePortalSession";
import { useRequestsData } from "@/lib/hooks/useRequestsData";
import {
  DEFAULT_MOBILE_COUNTRY_CODE,
  hasMobileNumberDigits,
  LEGACY_SERVICE_COUNTRY_FIELD_QUESTIONS,
  MOBILE_COUNTRY_CODE_OPTIONS,
  parseMobileAnswerValue,
  resolveDefaultCountryDialCode,
  serializeMobileAnswerValue,
} from "@/lib/mobilePhone";
import {
  getCityOptionsByCountryAndState,
  getStateOptionsByCountry,
  resolveSystemLocationFieldType,
  SERVICE_COUNTRY_FIELD_QUESTION,
  type SystemLocationFieldType,
} from "@/lib/locationHierarchy";
import { RequestItem, ServiceFormField } from "@/lib/types";

type DraftEntryFile = {
  entryIndex: number;
  fileName: string;
  fileMimeType: string;
  fileSize: number | null;
  fileData: string;
};

type DraftAnswer = {
  value: string;
  notApplicable: boolean;
  notApplicableText: string;
  fileName: string;
  fileMimeType: string;
  fileSize: number | null;
  fileData: string;
  entryFiles: DraftEntryFile[];
};

type RequestServiceForm = RequestItem["serviceForms"][number];

type PersonalDetailsSourceField = {
  question: string;
  value: string;
};

const ALLOWED_UPLOAD_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
]);
const MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024;
const DROPDOWN_DEFAULT_OPTION_LABEL = "Select";
const DROPDOWN_DEFAULT_OPTION_VALUES = new Set(["", "select", "select an option"]);

function isDefaultDropdownOptionValue(rawValue: string, allowedOptions?: string[]) {
  const normalizedValue = rawValue.trim();
  if (!normalizedValue) {
    return true;
  }

  const normalizedLower = normalizedValue.toLowerCase();
  if (!DROPDOWN_DEFAULT_OPTION_VALUES.has(normalizedLower)) {
    return false;
  }

  if (!Array.isArray(allowedOptions) || allowedOptions.length === 0) {
    return true;
  }

  return !allowedOptions.some(
    (option) => option.trim().toLowerCase() === normalizedLower,
  );
}

function resolveServiceLocationType(field: ServiceFormField): SystemLocationFieldType | null {
  const byFieldKey = resolveSystemLocationFieldType(field.fieldKey);
  if (byFieldKey) {
    return byFieldKey;
  }

  const normalizedQuestion = field.question.trim().toLowerCase();
  if (
    normalizedQuestion === SERVICE_COUNTRY_FIELD_QUESTION.toLowerCase() ||
    LEGACY_SERVICE_COUNTRY_FIELD_QUESTIONS.has(normalizedQuestion)
  ) {
    return "country";
  }

  return null;
}

function isServiceCountryField(field: ServiceFormField) {
  return resolveServiceLocationType(field) === "country";
}

function isServiceStateField(field: ServiceFormField) {
  return resolveServiceLocationType(field) === "state";
}

function isServiceCityField(field: ServiceFormField) {
  return resolveServiceLocationType(field) === "city";
}

function renderQuestionIcon(iconKey?: string) {
  const normalized = iconKey?.trim().toLowerCase() ?? "";

  if (normalized === "none") {
    return null;
  }

  if (normalized === "house") {
    return <House size={13} />;
  }

  if (normalized === "pen") {
    return <PenLine size={13} />;
  }

  if (normalized === "calendar") {
    return <Calendar size={13} />;
  }

  if (normalized === "phone") {
    return <Phone size={13} />;
  }

  if (normalized === "location") {
    return <MapPin size={13} />;
  }

  if (normalized === "id-card") {
    return <IdCard size={13} />;
  }

  if (normalized === "document") {
    return <FileText size={13} />;
  }

  if (normalized === "work") {
    return <Briefcase size={13} />;
  }

  if (normalized === "person") {
    return <User size={13} />;
  }

  if (normalized === "email") {
    return <Mail size={13} />;
  }

  if (normalized === "company") {
    return <Building2 size={13} />;
  }

  if (normalized === "global") {
    return <Globe size={13} />;
  }

  if (normalized === "security") {
    return <ShieldCheck size={13} />;
  }

  return <NotebookPen size={13} />;
}

function QuestionPrompt({
  iconKey,
  labelText,
  isRejectedField,
}: {
  iconKey?: string;
  labelText: string;
  isRejectedField: boolean;
}) {
  const iconElement = renderQuestionIcon(iconKey);

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem", flexWrap: "wrap" }}>
      {iconElement ? (
        <span
          style={{
            width: "1.3rem",
            height: "1.3rem",
            borderRadius: "999px",
            border: "1px solid #D5DEEE",
            background: "#EEF2FF",
            color: "#334155",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {iconElement}
        </span>
      ) : null}
      <span>{labelText}</span>
      {isRejectedField ? (
        <span style={{ color: "#B02A37", fontSize: "0.78rem" }}>
          Needs correction
        </span>
      ) : null}
    </span>
  );
}

function createEmptyDraftAnswer(): DraftAnswer {
  return {
    value: "",
    notApplicable: false,
    notApplicableText: "",
    fileName: "",
    fileMimeType: "",
    fileSize: null,
    fileData: "",
    entryFiles: [],
  };
}

function normalizeDraftEntryFiles(
  rawEntryFiles: Array<{
    entryIndex?: number;
    fileName?: string;
    fileMimeType?: string;
    fileSize?: number | null;
    fileData?: string;
  }> | null | undefined,
) {
  if (!Array.isArray(rawEntryFiles) || rawEntryFiles.length === 0) {
    return [] as DraftEntryFile[];
  }

  const byIndex = new Map<number, DraftEntryFile>();
  for (const rawFile of rawEntryFiles) {
    const normalizedIndex = Math.max(1, Math.floor(Number(rawFile.entryIndex ?? 0)));
    if (!Number.isFinite(normalizedIndex)) {
      continue;
    }

    const fileData = (rawFile.fileData ?? "").trim();
    if (!fileData) {
      continue;
    }

    const fileSize =
      typeof rawFile.fileSize === "number" && Number.isFinite(rawFile.fileSize) && rawFile.fileSize > 0
        ? rawFile.fileSize
        : null;

    byIndex.set(normalizedIndex, {
      entryIndex: normalizedIndex,
      fileName: (rawFile.fileName ?? "").trim(),
      fileMimeType: (rawFile.fileMimeType ?? "").trim().toLowerCase(),
      fileSize,
      fileData,
    });
  }

  return Array.from(byIndex.values()).sort((first, second) => first.entryIndex - second.entryIndex);
}

function resolveEntryFileForServiceEntry(answer: DraftAnswer, serviceEntryNumber: number) {
  if (!Number.isFinite(serviceEntryNumber) || serviceEntryNumber <= 0) {
    return null;
  }

  return (
    normalizeDraftEntryFiles(answer.entryFiles).find(
      (entryFile) => entryFile.entryIndex === Math.floor(serviceEntryNumber),
    ) ?? null
  );
}

function withUpdatedEntryFile(
  answer: DraftAnswer,
  serviceEntryNumber: number,
  entryFile: Omit<DraftEntryFile, "entryIndex"> | null,
) {
  const normalizedEntryIndex = Math.floor(serviceEntryNumber);
  if (!Number.isFinite(normalizedEntryIndex) || normalizedEntryIndex <= 0) {
    return answer;
  }

  const existingEntryFiles = normalizeDraftEntryFiles(answer.entryFiles).filter(
    (candidateEntryFile) => candidateEntryFile.entryIndex !== normalizedEntryIndex,
  );

  if (entryFile?.fileData) {
    existingEntryFiles.push({
      entryIndex: normalizedEntryIndex,
      fileName: entryFile.fileName,
      fileMimeType: entryFile.fileMimeType,
      fileSize: entryFile.fileSize,
      fileData: entryFile.fileData,
    });
  }

  return {
    ...answer,
    entryFiles: normalizeDraftEntryFiles(existingEntryFiles),
  };
}

function formatFileSize(bytes: number | null | undefined) {
  if (!bytes || bytes <= 0) {
    return "";
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Could not read file."));
    reader.readAsDataURL(file);
  });
}

function buildRejectedFieldKey(serviceId: string, fieldKey: string, question: string) {
  const normalizedFieldKey = fieldKey.trim();
  if (normalizedFieldKey) {
    return `${serviceId}::${normalizedFieldKey}`;
  }

  return `${serviceId}::question::${question.trim()}`;
}

function supportsLengthConstraints(field: ServiceFormField) {
  return (
    field.fieldType === "text" ||
    field.fieldType === "long_text" ||
    field.fieldType === "email" ||
    field.fieldType === "number"
  );
}

function supportsUppercaseConstraint(field: ServiceFormField) {
  return field.fieldType === "text" || field.fieldType === "long_text";
}

function normalizeAnswerValue(field: ServiceFormField, rawValue: string) {
  let nextValue = rawValue;

  if (supportsUppercaseConstraint(field) && field.forceUppercase) {
    nextValue = nextValue.toUpperCase();
  }

  if (
    supportsUppercaseConstraint(field) &&
    typeof field.maxLength === "number" &&
    field.maxLength > 0
  ) {
    nextValue = nextValue.slice(0, field.maxLength);
  }

  return nextValue;
}

function getConstraintHint(field: ServiceFormField) {
  if (!supportsLengthConstraints(field)) {
    return "";
  }

  const hints: string[] = [];
  const lengthUnit = field.fieldType === "number" ? "digits" : "chars";
  if (typeof field.minLength === "number") {
    hints.push(`Min ${field.minLength} ${lengthUnit}`);
  }
  if (typeof field.maxLength === "number") {
    hints.push(`Max ${field.maxLength} ${lengthUnit}`);
  }
  if (supportsUppercaseConstraint(field) && field.forceUppercase) {
    hints.push("ALL CAPS");
  }

  return hints.join(" | ");
}

function supportsRepeatable(field: ServiceFormField, allowMultipleEntries = false) {
  return field.fieldType !== "file" && (Boolean(field.repeatable) || allowMultipleEntries);
}

type PreviewFieldWidth = "full" | "half" | "third";

function resolveFieldPreviewWidth(field: ServiceFormField): PreviewFieldWidth {
  if (
    field.previewWidth === "full" ||
    field.previewWidth === "half" ||
    field.previewWidth === "third"
  ) {
    return field.previewWidth;
  }

  if (field.fieldType === "file" || field.fieldType === "long_text") {
    return "full";
  }

  return "half";
}

function getFieldGridColumn(field: ServiceFormField) {
  const width = resolveFieldPreviewWidth(field);
  if (width === "third") {
    return "span 4";
  }

  if (width === "half") {
    return "span 6";
  }

  return "span 12";
}

function getFieldRowTemplate(field: ServiceFormField) {
  return resolveFieldPreviewWidth(field) === "third"
    ? "minmax(0, 1fr)"
    : "minmax(210px, 1fr) minmax(260px, 2fr)";
}

function parseRepeatableAnswerValues(rawValue: string) {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return [""];
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      const values = parsed.map((entry) => String(entry ?? ""));
      return values.length > 0 ? values : [""];
    }
  } catch {
    // Backward compatibility: fallback to treating value as single entry.
  }

  return [rawValue];
}

const KNOWN_PERSONAL_DETAILS_FIELD_KEYS = new Set([
  "personal_full_name",
  "personal_date_of_birth",
  "personal_mobile_number",
  "personal_email_address",
  "personal_nationality",
  "personal_residential_address",
  "personal_gender",
  "personal_primary_id_number",
]);

function isPersonalDetailsServiceForm(serviceForm: RequestServiceForm) {
  if (serviceForm.serviceName.trim().toLowerCase() === "personal details") {
    return true;
  }

  return serviceForm.fields.some((field) =>
    KNOWN_PERSONAL_DETAILS_FIELD_KEYS.has(field.fieldKey?.trim() || ""),
  );
}

function serializeRepeatableAnswerValues(values: string[]) {
  return JSON.stringify(values);
}

function formatServiceSummaryWithHistory(item: RequestItem) {
  return item.selectedServices
    .map((service) => {
      const historyWindow = formatRequestedHistoryWindow(service.yearsOfChecking);
      if (!historyWindow) {
        return service.serviceName;
      }

      return `${service.serviceName} (${historyWindow})`;
    })
    .join(", ");
}

function OrdersPageContent() {
  const { me, loading, logout } = usePortalSession();
  const searchParams = useSearchParams();
  const { items, loading: requestsLoading, refreshRequests } = useRequestsData();
  const [requestsReady, setRequestsReady] = useState(false);
  const [formDrafts, setFormDrafts] = useState<Record<string, Record<string, Record<string, DraftAnswer>>>>({});
  const [personalDetailsCopyToggles, setPersonalDetailsCopyToggles] = useState<Record<string, boolean>>({});
  const [submittingRequestId, setSubmittingRequestId] = useState("");
  const [expandedRequestId, setExpandedRequestId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const focusRequestId = searchParams.get("requestId")?.trim() ?? "";

  useEffect(() => {
    if (!me) {
      return;
    }

    let active = true;

    (async () => {
      await refreshRequests(false);
      if (active) {
        setRequestsReady(true);
      }
    })();

    return () => {
      active = false;
    };
  }, [me, refreshRequests]);

  const pendingItems = useMemo(
    () => items.filter((item) => item.candidateFormStatus === "pending"),
    [items],
  );

  const resolvedExpandedRequestId = useMemo(() => {
    if (pendingItems.length === 0) {
      return null;
    }

    if (expandedRequestId && pendingItems.some((item) => item._id === expandedRequestId)) {
      return expandedRequestId;
    }

    return pendingItems[0]._id;
  }, [expandedRequestId, pendingItems]);

  useEffect(() => {
    if (!focusRequestId || pendingItems.length === 0) {
      return;
    }

    if (!pendingItems.some((item) => item._id === focusRequestId)) {
      return;
    }

    const stateUpdateTimer = window.setTimeout(() => {
      setExpandedRequestId(focusRequestId);
    }, 0);

    const scrollTimer = window.setTimeout(() => {
      document.getElementById(`request-${focusRequestId}`)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 80);

    return () => {
      window.clearTimeout(stateUpdateTimer);
      window.clearTimeout(scrollTimer);
    };
  }, [focusRequestId, pendingItems]);

  const getDraftAnswer = useCallback((item: RequestItem, serviceId: string, field: ServiceFormField) => {
    const fieldStorageKey = field.fieldKey?.trim() || field.question.trim();
    const draftValue = formDrafts[item._id]?.[serviceId]?.[fieldStorageKey];
    if (draftValue) {
      return draftValue;
    }

    const existingResponse = item.candidateFormResponses.find(
      (response) => response.serviceId === serviceId,
    );
    const existingAnswer = existingResponse?.answers.find((answer) => {
      if (field.fieldKey?.trim()) {
        return answer.fieldKey?.trim() === field.fieldKey.trim();
      }

      return answer.question === field.question;
    });

    return {
      value: existingAnswer?.value ?? "",
      notApplicable: Boolean(existingAnswer?.notApplicable),
      notApplicableText: existingAnswer?.notApplicableText ?? "",
      fileName: existingAnswer?.fileName ?? "",
      fileMimeType: existingAnswer?.fileMimeType ?? "",
      fileSize: existingAnswer?.fileSize ?? null,
      fileData: existingAnswer?.fileData ?? "",
      entryFiles: normalizeDraftEntryFiles(
        Array.isArray(existingAnswer?.entryFiles)
          ? existingAnswer.entryFiles.map((entryFile) => ({
              entryIndex: Number(entryFile.entryIndex ?? 0),
              fileName: entryFile.fileName ?? "",
              fileMimeType: entryFile.fileMimeType ?? "",
              fileSize: entryFile.fileSize ?? null,
              fileData: entryFile.fileData ?? "",
            }))
          : [],
      ),
    };
  }, [formDrafts]);

  function onAnswerChange(
    requestId: string,
    serviceId: string,
    fieldKey: string,
    next: DraftAnswer,
  ) {
    setFormDrafts((prev) => ({
      ...prev,
      [requestId]: {
        ...(prev[requestId] ?? {}),
        [serviceId]: {
          ...(prev[requestId]?.[serviceId] ?? {}),
            [fieldKey]: {
              ...next,
              entryFiles: normalizeDraftEntryFiles(next.entryFiles),
            },
        },
      },
    }));
  }

  const personalDetailsSourcesByRequestId = useMemo(() => {
    const result = new Map<string, Map<string, PersonalDetailsSourceField>>();

    for (const item of pendingItems) {
      const personalDetailsForm = item.serviceForms.find((serviceForm) =>
        isPersonalDetailsServiceForm(serviceForm),
      );

      if (!personalDetailsForm) {
        continue;
      }

      const fieldMap = new Map<string, PersonalDetailsSourceField>();

      for (const field of personalDetailsForm.fields) {
        if (field.fieldType === "file" || field.fieldType === "composite") {
          continue;
        }

        const sourceFieldKey = field.fieldKey?.trim() || "";
        if (!sourceFieldKey) {
          continue;
        }

        const answer = getDraftAnswer(item, personalDetailsForm.serviceId, field);
        const resolvedNotApplicableText =
          field.notApplicableText?.trim() ||
          answer.notApplicableText?.trim() ||
          "Not Applicable";
        const resolvedValue =
          Boolean(field.allowNotApplicable) && Boolean(answer.notApplicable)
            ? resolvedNotApplicableText
            : supportsRepeatable(field, Boolean(personalDetailsForm.allowMultipleEntries))
              ? parseRepeatableAnswerValues(answer.value)
                  .map((entry) => normalizeAnswerValue(field, entry).trim())
                  .find(Boolean) || ""
              : normalizeAnswerValue(field, answer.value).trim();

        fieldMap.set(sourceFieldKey, {
          question: field.question,
          value: resolvedValue,
        });
      }

      if (fieldMap.size > 0) {
        result.set(item._id, fieldMap);
      }
    }

    return result;
  }, [pendingItems, getDraftAnswer]);

  function buildPersonalDetailsCopyToggleKey(
    requestId: string,
    serviceId: string,
    fieldStorageKey: string,
    entryIndex?: number,
  ) {
    return `${requestId}::${serviceId}::${fieldStorageKey}::${
      typeof entryIndex === "number" ? entryIndex : "single"
    }`;
  }

  function findServiceLocationField(
    serviceForm: RequestServiceForm,
    locationType: SystemLocationFieldType,
  ) {
    return serviceForm.fields.find(
      (candidateField) => resolveServiceLocationType(candidateField) === locationType,
    );
  }

  function resolveServiceLocationValue(
    item: RequestItem,
    serviceForm: RequestServiceForm,
    locationType: SystemLocationFieldType,
    entryIndex?: number,
  ) {
    const locationField = findServiceLocationField(serviceForm, locationType);
    if (!locationField) {
      return "";
    }

    const answer = getDraftAnswer(item, serviceForm.serviceId, locationField);
    const values = parseRepeatableAnswerValues(answer.value)
      .map((entry) => entry.trim())
      .filter(Boolean);

    if (typeof entryIndex === "number") {
      return values[entryIndex] || values[0] || "";
    }

    return values[0] || "";
  }

  function resolveMinDateConstraint(
    item: RequestItem,
    serviceForm: RequestServiceForm,
    field: ServiceFormField,
    entryIndex?: number,
  ) {
    if (field.fieldType !== "date") {
      return undefined;
    }

    const lowerQ = field.question.trim().toLowerCase();
    const isToField = lowerQ.includes(" to") || lowerQ.endsWith("to") || lowerQ.includes("- to") || lowerQ === "to";
    if (!isToField) {
      return undefined;
    }

    const currentIndex = serviceForm.fields.findIndex(
      (f) => (f.fieldKey || f.question) === (field.fieldKey || field.question),
    );
    if (currentIndex <= 0) {
      return undefined;
    }

    for (let i = currentIndex - 1; i >= 0; i--) {
      const prevField = serviceForm.fields[i];
      if (prevField.fieldType === "date" && prevField.question.toLowerCase().includes("from")) {
        const answer = getDraftAnswer(item, serviceForm.serviceId, prevField);
        const values = parseRepeatableAnswerValues(answer.value).map((entry) => entry.trim());
        const dateStr = typeof entryIndex === "number" ? values[entryIndex] : values[0];
        return dateStr || undefined;
      }
    }

    return undefined;
  }

  function resolveDropdownOptionsForField(
    item: RequestItem,
    serviceForm: RequestServiceForm,
    field: ServiceFormField,
    entryIndex?: number,
  ) {
    if (field.fieldType !== "dropdown") {
      return field.dropdownOptions ?? [];
    }

    if (isServiceStateField(field)) {
      const selectedCountry = resolveServiceLocationValue(
        item,
        serviceForm,
        "country",
        entryIndex,
      );

      if (!selectedCountry) {
        return [] as string[];
      }

      return getStateOptionsByCountry(selectedCountry);
    }

    if (isServiceCityField(field)) {
      const selectedCountry = resolveServiceLocationValue(
        item,
        serviceForm,
        "country",
        entryIndex,
      );
      const selectedState = resolveServiceLocationValue(
        item,
        serviceForm,
        "state",
        entryIndex,
      );

      if (!selectedCountry || !selectedState) {
        return [] as string[];
      }

      return getCityOptionsByCountryAndState(selectedCountry, selectedState);
    }

    return field.dropdownOptions ?? [];
  }

  function isLocationFieldSelectionBlocked(
    item: RequestItem,
    serviceForm: RequestServiceForm,
    field: ServiceFormField,
    entryIndex?: number,
  ) {
    if (field.fieldType !== "dropdown") {
      return false;
    }

    if (isServiceStateField(field)) {
      return !resolveServiceLocationValue(item, serviceForm, "country", entryIndex);
    }

    if (isServiceCityField(field)) {
      return (
        !resolveServiceLocationValue(item, serviceForm, "country", entryIndex) ||
        !resolveServiceLocationValue(item, serviceForm, "state", entryIndex)
      );
    }

    return false;
  }

  function resolveServiceCountryDialCode(
    item: RequestItem,
    serviceForm: RequestServiceForm,
    entryIndex?: number,
  ) {
    const selectedCountry = resolveServiceLocationValue(
      item,
      serviceForm,
      "country",
      entryIndex,
    );

    return resolveDefaultCountryDialCode(
      selectedCountry || item.verificationCountry,
      DEFAULT_MOBILE_COUNTRY_CODE,
    );
  }

  function clearSingleLocationFieldValue(
    item: RequestItem,
    serviceForm: RequestServiceForm,
    locationType: SystemLocationFieldType,
  ) {
    const fieldToClear = findServiceLocationField(serviceForm, locationType);
    if (!fieldToClear) {
      return;
    }

    const fieldStorageKey = fieldToClear.fieldKey?.trim() || fieldToClear.question.trim();
    const answer = getDraftAnswer(item, serviceForm.serviceId, fieldToClear);

    onAnswerChange(item._id, serviceForm.serviceId, fieldStorageKey, {
      ...answer,
      notApplicable: false,
      value: "",
    });
  }

  function setSingleFieldValueWithLocationCascade(
    item: RequestItem,
    serviceForm: RequestServiceForm,
    field: ServiceFormField,
    answer: DraftAnswer,
    fieldStorageKey: string,
    rawValue: string,
  ) {
    onAnswerChange(item._id, serviceForm.serviceId, fieldStorageKey, {
      ...answer,
      notApplicable: false,
      value: rawValue,
    });

    if (isServiceCountryField(field)) {
      clearSingleLocationFieldValue(item, serviceForm, "state");
      clearSingleLocationFieldValue(item, serviceForm, "city");
      return;
    }

    if (isServiceStateField(field)) {
      clearSingleLocationFieldValue(item, serviceForm, "city");
    }
  }

  function resolvePersonalDetailsCopyValue(field: ServiceFormField, sourceValue: string) {
    const normalizedSourceValue = sourceValue.trim();
    if (!normalizedSourceValue) {
      return null;
    }

    if (field.fieldType === "dropdown") {
      const matchingOption = (field.dropdownOptions ?? []).find(
        (option) => option.trim().toLowerCase() === normalizedSourceValue.toLowerCase(),
      );
      return matchingOption ?? null;
    }

    if (field.fieldType === "mobile") {
      const parsedMobileValue = parseMobileAnswerValue(
        normalizedSourceValue,
        DEFAULT_MOBILE_COUNTRY_CODE,
      );
      if (!hasMobileNumberDigits(parsedMobileValue.number)) {
        return null;
      }

      return serializeMobileAnswerValue(parsedMobileValue);
    }

    return normalizeAnswerValue(field, normalizedSourceValue);
  }

  function applyPersonalDetailsCopyToField(
    item: RequestItem,
    serviceForm: RequestServiceForm,
    field: ServiceFormField,
    fieldStorageKey: string,
    answer: DraftAnswer,
    copiedValue: string,
    entryIndex?: number,
  ) {
    if (typeof entryIndex === "number") {
      const nextValues = parseRepeatableAnswerValues(answer.value);
      while (nextValues.length <= entryIndex) {
        nextValues.push("");
      }

      nextValues[entryIndex] = copiedValue;

      onAnswerChange(item._id, serviceForm.serviceId, fieldStorageKey, {
        ...answer,
        notApplicable: false,
        value: serializeRepeatableAnswerValues(nextValues),
      });
      return;
    }

    onAnswerChange(item._id, serviceForm.serviceId, fieldStorageKey, {
      ...answer,
      notApplicable: false,
      value: copiedValue,
    });
  }

  function clearPersonalDetailsCopiedFieldValue(
    item: RequestItem,
    serviceForm: RequestServiceForm,
    fieldStorageKey: string,
    answer: DraftAnswer,
    entryIndex?: number,
  ) {
    if (typeof entryIndex === "number") {
      const nextValues = parseRepeatableAnswerValues(answer.value);
      while (nextValues.length <= entryIndex) {
        nextValues.push("");
      }

      nextValues[entryIndex] = "";

      onAnswerChange(item._id, serviceForm.serviceId, fieldStorageKey, {
        ...answer,
        notApplicable: false,
        value: serializeRepeatableAnswerValues(nextValues),
      });
      return;
    }

    onAnswerChange(item._id, serviceForm.serviceId, fieldStorageKey, {
      ...answer,
      notApplicable: false,
      value: "",
    });
  }

  function renderPersonalDetailsCopyCheckbox(params: {
    item: RequestItem;
    serviceForm: RequestServiceForm;
    field: ServiceFormField;
    fieldStorageKey: string;
    answer: DraftAnswer;
    entryIndex?: number;
  }) {
    const { item, serviceForm, field, fieldStorageKey, answer, entryIndex } = params;
    const sourceFieldKey = field.copyFromPersonalDetailsFieldKey?.trim() || "";

    if (!sourceFieldKey || field.fieldType === "file" || field.fieldType === "composite") {
      return null;
    }

    const sourceField = personalDetailsSourcesByRequestId
      .get(item._id)
      ?.get(sourceFieldKey);
    const copyToggleKey = buildPersonalDetailsCopyToggleKey(
      item._id,
      serviceForm.serviceId,
      fieldStorageKey,
      entryIndex,
    );
    const checked = Boolean(personalDetailsCopyToggles[copyToggleKey]);
    const copyValue = sourceField
      ? resolvePersonalDetailsCopyValue(field, sourceField.value)
      : null;
    const canCopy = Boolean(copyValue && copyValue.trim());

    let helperText = "";
    if (!sourceField) {
      helperText = "Source field is not available in Personal Details.";
    } else if (!sourceField.value.trim()) {
      helperText = `Fill \"${sourceField.question}\" in Personal Details to use this copy option.`;
    } else if (!canCopy) {
      helperText = "Source value cannot be copied because it does not match this field format.";
    }

    return (
      <div style={{ display: "grid", gap: "0.25rem" }}>
        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.4rem",
            color: "#334155",
            fontSize: "0.8rem",
            fontWeight: 600,
          }}
        >
          <input
            type="checkbox"
            checked={checked}
            disabled={!canCopy}
            onChange={(e) => {
              const nextChecked = e.target.checked;
              setPersonalDetailsCopyToggles((prev) => ({
                ...prev,
                [copyToggleKey]: nextChecked,
              }));

              if (nextChecked && copyValue) {
                applyPersonalDetailsCopyToField(
                  item,
                  serviceForm,
                  field,
                  fieldStorageKey,
                  answer,
                  copyValue,
                  entryIndex,
                );
                return;
              }

              clearPersonalDetailsCopiedFieldValue(
                item,
                serviceForm,
                fieldStorageKey,
                answer,
                entryIndex,
              );
            }}
          />
          Use value from Personal Details: {sourceField?.question || sourceFieldKey}
        </label>
        {helperText ? (
          <p style={{ margin: 0, color: "#64748B", fontSize: "0.78rem" }}>{helperText}</p>
        ) : null}
      </div>
    );
  }

  function getServiceLevelEntryCount(item: RequestItem, serviceForm: RequestServiceForm) {
    if (!serviceForm.allowMultipleEntries) {
      return 1;
    }

    let maxEntries = 1;

    for (const field of serviceForm.fields) {
      if (field.fieldType === "file") {
        const answer = getDraftAnswer(item, serviceForm.serviceId, field);
        const maxFileEntryIndex = answer.entryFiles.reduce((maxIndex, entryFile) => {
          if (!entryFile.fileData) {
            return maxIndex;
          }

          return Math.max(maxIndex, entryFile.entryIndex);
        }, 0);

        if (maxFileEntryIndex > maxEntries) {
          maxEntries = maxFileEntryIndex;
        }

        continue;
      }

      const answer = getDraftAnswer(item, serviceForm.serviceId, field);
      const entryCount = parseRepeatableAnswerValues(answer.value).length;
      if (entryCount > maxEntries) {
        maxEntries = entryCount;
      }
    }

    return maxEntries;
  }

  function addServiceLevelEntry(item: RequestItem, serviceForm: RequestServiceForm) {
    if (!serviceForm.allowMultipleEntries) {
      return;
    }

    for (const field of serviceForm.fields) {
      if (field.fieldType === "file") {
        continue;
      }

      const fieldStorageKey = field.fieldKey?.trim() || field.question.trim();
      const answer = getDraftAnswer(item, serviceForm.serviceId, field);
      const nextValues = [...parseRepeatableAnswerValues(answer.value), ""];

      onAnswerChange(item._id, serviceForm.serviceId, fieldStorageKey, {
        ...answer,
        notApplicable: false,
        value: serializeRepeatableAnswerValues(nextValues),
      });
    }
  }

  function removeServiceLevelEntry(item: RequestItem, serviceForm: RequestServiceForm) {
    if (!serviceForm.allowMultipleEntries) {
      return;
    }

    const currentCount = getServiceLevelEntryCount(item, serviceForm);
    if (currentCount <= 1) {
      return;
    }
    const nextCount = currentCount - 1;

    for (const field of serviceForm.fields) {
      const fieldStorageKey = field.fieldKey?.trim() || field.question.trim();
      const answer = getDraftAnswer(item, serviceForm.serviceId, field);

      if (field.fieldType === "file") {
        const nextEntryFiles = answer.entryFiles.filter(
          (entryFile) => entryFile.entryIndex <= nextCount,
        );

        onAnswerChange(item._id, serviceForm.serviceId, fieldStorageKey, {
          ...answer,
          entryFiles: nextEntryFiles,
        });
        continue;
      }

      const nextValues = parseRepeatableAnswerValues(answer.value);
      if (nextValues.length > 1) {
        nextValues.pop();
      }

      onAnswerChange(item._id, serviceForm.serviceId, fieldStorageKey, {
        ...answer,
        notApplicable: false,
        value: serializeRepeatableAnswerValues(nextValues),
      });
    }
  }

  function setServiceLevelEntryFieldValue(
    item: RequestItem,
    serviceForm: RequestServiceForm,
    field: ServiceFormField,
    entryIndex: number,
    rawValue: string,
  ) {
    if (!serviceForm.allowMultipleEntries || field.fieldType === "file") {
      return;
    }

    const fieldStorageKey = field.fieldKey?.trim() || field.question.trim();
    const answer = getDraftAnswer(item, serviceForm.serviceId, field);
    const nextValues = parseRepeatableAnswerValues(answer.value);

    while (nextValues.length <= entryIndex) {
      nextValues.push("");
    }

    nextValues[entryIndex] = normalizeAnswerValue(field, rawValue);

    onAnswerChange(item._id, serviceForm.serviceId, fieldStorageKey, {
      ...answer,
      notApplicable: false,
      value: serializeRepeatableAnswerValues(nextValues),
    });

    if (isServiceCountryField(field)) {
      clearServiceLevelEntryLocationFieldValue(item, serviceForm, "state", entryIndex);
      clearServiceLevelEntryLocationFieldValue(item, serviceForm, "city", entryIndex);
      return;
    }

    if (isServiceStateField(field)) {
      clearServiceLevelEntryLocationFieldValue(item, serviceForm, "city", entryIndex);
    }
  }

  function clearServiceLevelEntryLocationFieldValue(
    item: RequestItem,
    serviceForm: RequestServiceForm,
    locationType: SystemLocationFieldType,
    entryIndex: number,
  ) {
    const fieldToClear = findServiceLocationField(serviceForm, locationType);
    if (!fieldToClear || fieldToClear.fieldType === "file") {
      return;
    }

    const fieldStorageKey = fieldToClear.fieldKey?.trim() || fieldToClear.question.trim();
    const answer = getDraftAnswer(item, serviceForm.serviceId, fieldToClear);
    const nextValues = parseRepeatableAnswerValues(answer.value);

    while (nextValues.length <= entryIndex) {
      nextValues.push("");
    }

    nextValues[entryIndex] = "";

    onAnswerChange(item._id, serviceForm.serviceId, fieldStorageKey, {
      ...answer,
      notApplicable: false,
      value: serializeRepeatableAnswerValues(nextValues),
    });
  }

  function setServiceLevelEntryNotApplicable(
    item: RequestItem,
    serviceForm: RequestServiceForm,
    field: ServiceFormField,
    entryIndex: number,
    checked: boolean,
    notApplicableText: string,
  ) {
    if (!serviceForm.allowMultipleEntries || field.fieldType === "file") {
      return;
    }

    const fieldStorageKey = field.fieldKey?.trim() || field.question.trim();
    const answer = getDraftAnswer(item, serviceForm.serviceId, field);
    const nextValues = parseRepeatableAnswerValues(answer.value);

    while (nextValues.length <= entryIndex) {
      nextValues.push("");
    }

    nextValues[entryIndex] = checked ? notApplicableText : "";

    onAnswerChange(item._id, serviceForm.serviceId, fieldStorageKey, {
      ...answer,
      notApplicable: false,
      notApplicableText: notApplicableText,
      value: serializeRepeatableAnswerValues(nextValues),
    });
  }

  async function onFileChange(
    requestId: string,
    serviceId: string,
    fieldKey: string,
    file: File | null,
    answer: DraftAnswer,
    serviceEntryNumber?: number,
  ) {
    if (!file) {
      if (typeof serviceEntryNumber === "number") {
        onAnswerChange(
          requestId,
          serviceId,
          fieldKey,
          withUpdatedEntryFile(answer, serviceEntryNumber, null),
        );
      } else {
        onAnswerChange(requestId, serviceId, fieldKey, {
          ...answer,
          value: "",
          fileName: "",
          fileMimeType: "",
          fileSize: null,
          fileData: "",
        });
      }
      return;
    }

    const mimeType = file.type.toLowerCase();
    if (!ALLOWED_UPLOAD_MIME_TYPES.has(mimeType)) {
      setMessage("Only PDF, JPG, and PNG files are allowed.");
      return;
    }

    if (file.size > MAX_UPLOAD_SIZE_BYTES) {
      setMessage("File size must be 5MB or less.");
      return;
    }

    try {
      const fileData = await readFileAsDataUrl(file);
      if (typeof serviceEntryNumber === "number") {
        onAnswerChange(
          requestId,
          serviceId,
          fieldKey,
          withUpdatedEntryFile(answer, serviceEntryNumber, {
            fileName: file.name,
            fileMimeType: mimeType,
            fileSize: file.size,
            fileData,
          }),
        );
      } else {
        onAnswerChange(requestId, serviceId, fieldKey, {
          ...answer,
          value: file.name,
          notApplicable: false,
          notApplicableText: "",
          fileName: file.name,
          fileMimeType: mimeType,
          fileSize: file.size,
          fileData,
        });
      }
    } catch {
      setMessage("Could not read selected file. Please try again.");
    }
  }

  async function submitForm(item: RequestItem) {
    setMessage("");
    setSubmittingRequestId(item._id);

    let dropdownValidationError = "";

    const responses = item.serviceForms.map((serviceForm) => ({
      serviceId: serviceForm.serviceId,
      serviceEntryCount: serviceForm.allowMultipleEntries
        ? Math.max(1, getServiceLevelEntryCount(item, serviceForm))
        : 1,
      answers: serviceForm.fields.map((field) => {
        const serviceAllowsMultipleEntries = Boolean(serviceForm.allowMultipleEntries);
        const fieldStorageKey = field.fieldKey?.trim() || field.question.trim();
        const answer = getDraftAnswer(item, serviceForm.serviceId, field);
        const isNotApplicable =
          !serviceAllowsMultipleEntries &&
          Boolean(field.allowNotApplicable) &&
          Boolean(answer.notApplicable);
        const resolvedNotApplicableText =
          field.notApplicableText?.trim() ||
          answer.notApplicableText?.trim() ||
          "Not Applicable";
        const usesRepeatableMode = supportsRepeatable(field, serviceAllowsMultipleEntries);
        const defaultMobileCountryCode = resolveServiceCountryDialCode(
          item,
          serviceForm,
        );
        const parsedSingleMobileValue =
          field.fieldType === "mobile"
            ? parseMobileAnswerValue(answer.value, defaultMobileCountryCode)
            : null;
        const normalizedSingleValue =
          field.fieldType === "mobile" && parsedSingleMobileValue
            ? hasMobileNumberDigits(parsedSingleMobileValue.number)
              ? serializeMobileAnswerValue(parsedSingleMobileValue)
              : ""
            : normalizeAnswerValue(field, answer.value);
        const dropdownOptionsForSingleValue =
          field.fieldType === "dropdown"
            ? resolveDropdownOptionsForField(item, serviceForm, field)
            : field.dropdownOptions;
        const isDropdownWithDefaultSelection =
          field.fieldType === "dropdown" &&
          isDefaultDropdownOptionValue(normalizedSingleValue, dropdownOptionsForSingleValue);
        const normalizedRepeatableValues = parseRepeatableAnswerValues(answer.value)
          .map((entry, entryIndex) => {
            const trimmedEntry = entry.trim();
            if (
              Boolean(field.allowNotApplicable) &&
              trimmedEntry &&
              trimmedEntry === resolvedNotApplicableText
            ) {
              return resolvedNotApplicableText;
            }

            if (field.fieldType === "mobile") {
              const parsedMobileEntry = parseMobileAnswerValue(
                entry,
                resolveServiceCountryDialCode(item, serviceForm, entryIndex),
              );

              if (!hasMobileNumberDigits(parsedMobileEntry.number)) {
                return "";
              }

              return serializeMobileAnswerValue(parsedMobileEntry);
            }

            const normalizedEntry = normalizeAnswerValue(field, entry).trim();
            if (
              field.fieldType === "dropdown" &&
              isDefaultDropdownOptionValue(
                normalizedEntry,
                resolveDropdownOptionsForField(item, serviceForm, field, entryIndex),
              )
            ) {
              return "";
            }

            return normalizedEntry;
          })
          .filter(Boolean);

        if (!dropdownValidationError && field.fieldType === "dropdown" && field.required) {
          if (usesRepeatableMode) {
            if (normalizedRepeatableValues.length === 0) {
              dropdownValidationError = `${field.question} is required. Please select an option.`;
            }
          } else if (!isNotApplicable && isDropdownWithDefaultSelection) {
            dropdownValidationError = `${field.question} is required. Please select an option.`;
          }
        }

        const hasRepeatableNotApplicableEntry =
          usesRepeatableMode &&
          Boolean(field.allowNotApplicable) &&
          normalizedRepeatableValues.some((entry) => entry === resolvedNotApplicableText);
        const normalizedEntryFiles = normalizeDraftEntryFiles(answer.entryFiles);
        const normalizedValue = usesRepeatableMode
          ? serializeRepeatableAnswerValues(normalizedRepeatableValues)
          : isDropdownWithDefaultSelection
            ? ""
            : normalizedSingleValue;

        return {
          fieldKey: fieldStorageKey,
          question: field.question,
          repeatable: usesRepeatableMode,
          notApplicable: isNotApplicable || hasRepeatableNotApplicableEntry,
          notApplicableText:
            isNotApplicable || hasRepeatableNotApplicableEntry
              ? resolvedNotApplicableText
              : "",
          value: isNotApplicable ? resolvedNotApplicableText : normalizedValue,
          fileName: answer.fileName,
          fileMimeType: answer.fileMimeType,
          fileSize: answer.fileSize,
          fileData: isNotApplicable ? "" : answer.fileData,
          entryFiles: isNotApplicable ? [] : normalizedEntryFiles,
        };
      }),
    }));

    if (dropdownValidationError) {
      setSubmittingRequestId("");
      setMessage(dropdownValidationError);
      return;
    }

    const res = await fetch("/api/requests", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId: item._id, responses }),
    });

    const data = (await res.json()) as { message?: string; error?: string };
    setSubmittingRequestId("");

    if (!res.ok) {
      setMessage(data.error ?? "Could not submit form.");
      return;
    }

    setMessage(data.message ?? "Form submitted.");
    await refreshRequests();
  }

  if (loading || requestsLoading || !me || !requestsReady) {
    return (
      <main className="portal-shell">
        <BlockCard tone="muted">
          <p className="block-subtitle">Loading candidate forms...</p>
        </BlockCard>
      </main>
    );
  }

  return (
    <PortalFrame
      me={me}
      onLogout={logout}
      title="Candidate Forms"
      subtitle="Fill and submit assigned forms like Google Forms. Required questions are marked with *."
    >
      <div className="candidate-forms-quiet">
        {message ? <p className={`inline-alert ${getAlertTone(message)}`}>{message}</p> : null}

        {pendingItems.length === 0 ? (
          <BlockCard as="article" tone="muted">
            <BlockTitle
              icon={<Sparkles size={14} />}
              title="All Forms Submitted"
              subtitle="No pending forms at the moment. Check History for approval updates."
            />
          </BlockCard>
        ) : null}

        <section className="request-accordion-list">
          {pendingItems.map((item) => {
            const isExpanded = resolvedExpandedRequestId === item._id;
            const rejectedFieldSet = new Set(
              (item.customerRejectedFields ?? []).map((field) =>
                buildRejectedFieldKey(field.serviceId, field.fieldKey ?? "", field.question),
              ),
            );
            const hasRejectedFields = rejectedFieldSet.size > 0;

            return (
              <BlockCard as="article" key={item._id}>
                <button
                  className="request-accordion-toggle"
                  type="button"
                  aria-expanded={isExpanded}
                  onClick={() =>
                    setExpandedRequestId((prev) =>
                      prev === item._id ? null : item._id,
                    )
                  }
                >
                  <span className="request-accordion-main" style={{ alignItems: "start" }}>
                    <span>
                      <span className="request-accordion-candidate" style={{ display: "block" }}>
                        {item.customerName}
                      </span>
                      <span className="request-accordion-status" style={{ display: "block", marginTop: "0.15rem" }}>
                        Request created {new Date(item.createdAt).toLocaleDateString()} | {" "}
                        {formatServiceSummaryWithHistory(item)}
                      </span>
                    </span>
                  </span>
                  <span className={`request-accordion-arrow${isExpanded ? " expanded" : ""}`}>
                    <ChevronDown size={18} />
                  </span>
                </button>

                {isExpanded ? (
                  <div className="request-accordion-details" style={{ marginTop: "0.2rem" }}>
                    {hasRejectedFields ? (
                      <div
                        style={{
                          marginBottom: "0.9rem",
                          border: "1px solid #F5C2C7",
                          borderRadius: "12px",
                          background: "#FFF4F5",
                          padding: "0.75rem 0.85rem",
                          display: "grid",
                          gap: "0.45rem",
                        }}
                      >
                        <strong style={{ color: "#9F1239" }}>Correction requested</strong>
                        <p style={{ margin: 0, color: "#6B1E31", fontSize: "0.88rem" }}>
                          Update the highlighted fields below and submit again to move this request back to admin review.
                        </p>
                        {item.rejectionNote ? (
                          <p style={{ margin: 0, color: "#7A2036", fontSize: "0.84rem" }}>
                            <strong>Enterprise note:</strong> {item.rejectionNote}
                          </p>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="form-grid">
                      {item.serviceForms.map((serviceForm) => (
                        <div
                          key={`${item._id}-${serviceForm.serviceId}`}
                          style={{
                            border: "1px solid #E2E8F0",
                            borderRadius: "16px",
                            padding: "1.5rem",
                            background: "#FFFFFF",
                            boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)",
                            display: "grid",
                            gap: "1.25rem",
                          }}
                        >
                          <strong>{serviceForm.serviceName}</strong>

                          {(() => {
                            const serviceHistoryWindow = formatRequestedHistoryWindow(
                              item.selectedServices.find(
                                (service) => service.serviceId === serviceForm.serviceId,
                              )?.yearsOfChecking,
                            );

                            if (!serviceHistoryWindow) {
                              return null;
                            }

                            return (
                              <div
                                style={{
                                  marginTop: "-0.55rem",
                                  border: "1px solid #FDE68A",
                                  borderRadius: "10px",
                                  background: "#FFFBEB",
                                  padding: "0.48rem 0.62rem",
                                }}
                              >
                                <p style={{ margin: 0, color: "#92400E", fontSize: "0.84rem", fontWeight: 600 }}>
                                  Requested history:{" "}
                                  <span style={{ color: "#78350F", fontSize: "0.88rem", fontWeight: 800 }}>
                                    {serviceHistoryWindow}
                                  </span>
                                </p>
                              </div>
                            );
                          })()}

                          {Boolean(serviceForm.allowMultipleEntries) ? (
                            <div
                              style={{
                                border: "1px solid #E2E8F0",
                                borderRadius: "12px",
                                padding: "1rem",
                                background: "#F8FAFC",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: "1rem",
                                flexWrap: "wrap",
                              }}
                            >
                              <span style={{ color: "#334155", fontSize: "0.95rem", fontWeight: 600 }}>
                                {serviceForm?.multipleEntriesLabel || "Whole-service entries"}: {getServiceLevelEntryCount(item, serviceForm)}
                              </span>
                              <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                                <span
                                  style={{
                                    padding: "0.45rem 0.75rem",
                                    borderRadius: "999px",
                                    background: "#E0F2FE",
                                    border: "1px solid #BAE6FD",
                                    color: "#0C4A6E",
                                    fontSize: "0.8rem",
                                    fontWeight: 700,
                                  }}
                                >
                                  {serviceForm?.multipleEntriesLabel?.trim() || "Whole-service entries"}
                                </span>
                                <button
                                  className="btn btn-secondary"
                                  type="button"
                                  style={{ padding: "0.5rem 1rem", fontSize: "0.875rem", borderRadius: "8px", background: "#EFF6FF", color: "#2563EB", border: "1px solid #BFDBFE", fontWeight: 600, cursor: "pointer", transition: "all 0.2s" }}
                                  onClick={() => addServiceLevelEntry(item, serviceForm)}
                                >
                                  + Add another {serviceForm?.multipleEntriesLabel?.trim() || "entry"}
                                </button>
                                <button
                                  className="btn btn-secondary"
                                  type="button"
                                  style={{ padding: "0.5rem 1rem", fontSize: "0.875rem", borderRadius: "8px", background: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA", fontWeight: 600, cursor: "pointer", transition: "all 0.2s" }}
                                  disabled={getServiceLevelEntryCount(item, serviceForm) <= 1}
                                  onClick={() => removeServiceLevelEntry(item, serviceForm)}
                                >
                                  Remove last entry
                                </button>
                              </div>
                            </div>
                          ) : null}

                          {serviceForm.fields.length === 0 ? (
                            <p className="block-subtitle">No custom form fields for this service.</p>
                          ) : Boolean(serviceForm.allowMultipleEntries) ? (
                            <div style={{ display: "grid", gap: "0.75rem" }}>
                              {Array.from({ length: getServiceLevelEntryCount(item, serviceForm) }).map((_, serviceEntryIndex) => (
                                <div
                                  key={`${item._id}-${serviceForm.serviceId}-entry-${serviceEntryIndex}`}
                                  style={{
                                    border: "1px solid #E2E8F0",
                                    borderRadius: "12px",
                                    background: "#F8FAFC",
                                    padding: "1.25rem",
                                    display: "grid",
                                    gap: "1.25rem",
                                    boxShadow: "inset 0 2px 4px 0 rgba(0, 0, 0, 0.02)",
                                  }}
                                >
                                  <div
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "space-between",
                                      gap: "0.5rem",
                                      borderBottom: "2px solid #E2E8F0",       
                                      paddingBottom: "0.75rem",
                                    }}
                                  >
                                    <strong style={{ fontSize: "1rem", color: "#1E293B", fontWeight: 700 }}>
                                      Entry {serviceEntryIndex + 1}
                                    </strong>
                                  </div>

                                  <div
                                    style={{
                                      display: "grid",
                                      gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
                                      gap: "0.75rem",
                                    }}
                                  >
                                    {serviceForm.fields.map((field) => {
                                      const fieldStorageKey = field.fieldKey?.trim() || field.question.trim();
                                      const answer = getDraftAnswer(item, serviceForm.serviceId, field);
                                      const labelText = `${field.question}${field.required ? " *" : ""}`;
                                      const fieldGridColumn = getFieldGridColumn(field);
                                      const fieldRowTemplate = getFieldRowTemplate(field);
                                      const fieldRowAlignItems =
                                        resolveFieldPreviewWidth(field) === "third" ? "start" : "center";
                                      const isRejectedField = rejectedFieldSet.has(
                                        buildRejectedFieldKey(
                                          serviceForm.serviceId,
                                          field.fieldKey ?? "",
                                          field.question,
                                        ),
                                      );
                                      const correctionStyle = isRejectedField
                                        ? {
                                            border: "1px solid #F5C2C7",
                                            borderRadius: "10px",
                                            background: "#FFF7F7",
                                            padding: "0.55rem 0.6rem",
                                          }
                                        : {};
                                      const constraintHint = getConstraintHint(field);

                                      if (field.fieldType === "file") {
                                        const serviceEntryNumber = serviceEntryIndex + 1;
                                        const entryFile = resolveEntryFileForServiceEntry(
                                          answer,
                                          serviceEntryNumber,
                                        );
                                        const showSharedUploader = serviceEntryIndex === 0;

                                        return (
                                          <div
                                            key={`${item._id}-${serviceForm.serviceId}-${fieldStorageKey}-${serviceEntryNumber}`}
                                            style={{ ...correctionStyle, gridColumn: fieldGridColumn }}
                                          >
                                            <label className="label">
                                              <QuestionPrompt
                                                iconKey={field.iconKey}
                                                labelText={labelText}
                                                isRejectedField={isRejectedField}
                                              />
                                            </label>
                                            <div style={{ display: "grid", gap: "0.7rem" }}>
                                              {showSharedUploader ? (
                                                <div
                                                  style={{
                                                    border: "1px solid #DBEAFE",
                                                    borderRadius: "10px",
                                                    background: "#EFF6FF",
                                                    padding: "0.6rem",
                                                    display: "grid",
                                                    gap: "0.45rem",
                                                  }}
                                                >
                                                  <p style={{ margin: 0, color: "#1D4ED8", fontSize: "0.82rem", fontWeight: 700 }}>
                                                    Shared attachment for all entries
                                                  </p>
                                                  <input
                                                    className="input"
                                                    type="file"
                                                    accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                                                    onChange={(e) =>
                                                      onFileChange(
                                                        item._id,
                                                        serviceForm.serviceId,
                                                        fieldStorageKey,
                                                        e.target.files?.[0] ?? null,
                                                        answer,
                                                      )
                                                    }
                                                  />
                                                  <p style={{ margin: 0, color: "#6C757D", fontSize: "0.82rem" }}>
                                                    PDF, JPG, PNG only. Maximum size 5MB.
                                                  </p>
                                                  {answer.fileData ? (
                                                    <div style={{ marginTop: "0.15rem", fontSize: "0.86rem" }}>
                                                      <a href={answer.fileData} target="_blank" rel="noreferrer" style={{ color: "#2563EB", fontWeight: 700 }}>
                                                        {answer.fileName || "View shared file"}
                                                      </a>
                                                      {answer.fileSize ? ` (${formatFileSize(answer.fileSize)})` : ""}
                                                    </div>
                                                  ) : null}
                                                </div>
                                              ) : null}

                                              <div
                                                style={{
                                                  border: "1px solid #E2E8F0",
                                                  borderRadius: "10px",
                                                  background: "#FFFFFF",
                                                  padding: "0.6rem",
                                                  display: "grid",
                                                  gap: "0.45rem",
                                                }}
                                              >
                                                <p style={{ margin: 0, color: "#334155", fontSize: "0.82rem", fontWeight: 700 }}>
                                                  Entry {serviceEntryNumber} attachment
                                                </p>
                                                <input
                                                  className="input"
                                                  type="file"
                                                  accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                                                  onChange={(e) =>
                                                    onFileChange(
                                                      item._id,
                                                      serviceForm.serviceId,
                                                      fieldStorageKey,
                                                      e.target.files?.[0] ?? null,
                                                      answer,
                                                      serviceEntryNumber,
                                                    )
                                                  }
                                                />
                                                <p style={{ margin: 0, color: "#6C757D", fontSize: "0.82rem" }}>
                                                  Upload only for this entry. If empty, shared file is used.
                                                </p>
                                                {entryFile?.fileData ? (
                                                  <div style={{ marginTop: "0.15rem", fontSize: "0.86rem" }}>
                                                    <a href={entryFile.fileData} target="_blank" rel="noreferrer" style={{ color: "#2563EB", fontWeight: 700 }}>
                                                      {entryFile.fileName || `Entry ${serviceEntryNumber} file`}
                                                    </a>
                                                    {entryFile.fileSize ? ` (${formatFileSize(entryFile.fileSize)})` : ""}
                                                  </div>
                                                ) : answer.fileData ? (
                                                  <p style={{ margin: "0.15rem 0 0", color: "#1E40AF", fontSize: "0.8rem", fontWeight: 600 }}>
                                                    Using shared file fallback for this entry.
                                                  </p>
                                                ) : null}
                                              </div>
                                            </div>
                                          </div>
                                        );
                                      }

                                      const repeatableValues = parseRepeatableAnswerValues(answer.value);
                                      const entryValue = repeatableValues[serviceEntryIndex] ?? "";
                                      const parsedEntryMobileValue =
                                        field.fieldType === "mobile"
                                          ? parseMobileAnswerValue(
                                              entryValue,
                                              resolveServiceCountryDialCode(
                                                item,
                                                serviceForm,
                                                serviceEntryIndex,
                                              ),
                                            )
                                          : null;
                                      const resolvedNotApplicableText =
                                        field.notApplicableText?.trim() ||
                                        answer.notApplicableText?.trim() ||
                                        "Not Applicable";
                                      const supportsEntryNotApplicable =
                                        Boolean(field.allowNotApplicable);
                                      const isEntryNotApplicable =
                                        supportsEntryNotApplicable &&
                                        entryValue.trim() === resolvedNotApplicableText;
                                      const entryNotApplicableToggle = supportsEntryNotApplicable ? (
                                        <label
                                          style={{
                                            display: "inline-flex",
                                            alignItems: "center",
                                            gap: "0.4rem",
                                            color: "#4A5E79",
                                            fontSize: "0.82rem",
                                            fontWeight: 600,
                                          }}
                                        >
                                          <input
                                            type="checkbox"
                                            checked={isEntryNotApplicable}
                                            onChange={(e) =>
                                              setServiceLevelEntryNotApplicable(
                                                item,
                                                serviceForm,
                                                field,
                                                serviceEntryIndex,
                                                e.target.checked,
                                                resolvedNotApplicableText,
                                              )
                                            }
                                          />
                                          {resolvedNotApplicableText}
                                        </label>
                                      ) : null;
                                      const personalDetailsCopyToggle = renderPersonalDetailsCopyCheckbox({
                                        item,
                                        serviceForm,
                                        field,
                                        fieldStorageKey,
                                        answer,
                                        entryIndex: serviceEntryIndex,
                                      });
                                      const questionRepeatableHint = Boolean(field.repeatable) ? (
                                        <p style={{ margin: 0, color: "#15803D", fontSize: "0.8rem", fontWeight: 600 }}>
                                          Specific-question multiple entries is enabled in Service Builder.
                                        </p>
                                      ) : null;

                                      if (field.fieldType === "long_text") {
                                        return (
                                          <div
                                            key={`${item._id}-${serviceForm.serviceId}-${fieldStorageKey}-${serviceEntryIndex}`}
                                            style={{ ...correctionStyle, gridColumn: fieldGridColumn }}
                                          >
                                            <label className="label">
                                              <QuestionPrompt
                                                iconKey={field.iconKey}
                                                labelText={labelText}
                                                isRejectedField={isRejectedField}
                                              />
                                            </label>
                                            {questionRepeatableHint}
                                            {entryNotApplicableToggle}
                                            {personalDetailsCopyToggle}
                                            <textarea
                                              className="input"
                                              rows={5}
                                              value={entryValue}
                                              onChange={(e) =>
                                                setServiceLevelEntryFieldValue(
                                                  item,
                                                  serviceForm,
                                                  field,
                                                  serviceEntryIndex,
                                                  e.target.value,
                                                )
                                              }
                                              minLength={typeof field.minLength === "number" ? field.minLength : undefined}
                                              maxLength={typeof field.maxLength === "number" ? field.maxLength : undefined}
                                              style={{ minHeight: "120px", resize: "vertical" }}
                                              required={field.required && !isEntryNotApplicable}
                                              disabled={isEntryNotApplicable}
                                            />
                                            {isEntryNotApplicable ? (
                                              <p style={{ margin: "0.2rem 0 0", color: "#6C757D", fontSize: "0.82rem" }}>
                                                Saved as: {resolvedNotApplicableText}
                                              </p>
                                            ) : null}
                                            {constraintHint ? (
                                              <p style={{ margin: "0.3rem 0 0", color: "#6C757D", fontSize: "0.82rem" }}>
                                                {constraintHint}
                                              </p>
                                            ) : null}
                                          </div>
                                        );
                                      }

                                      const inputType =
                                        field.fieldType === "number"
                                          ? "number"
                                          : field.fieldType === "date"
                                            ? "date"
                                            : field.fieldType === "email"
                                              ? "email"
                                            : "text";
                                      const isDropdownField = field.fieldType === "dropdown";
                                      const dropdownOptions = isDropdownField
                                        ? resolveDropdownOptionsForField(
                                            item,
                                            serviceForm,
                                            field,
                                            serviceEntryIndex,
                                          )
                                        : [];
                                      const isLocationSelectionBlocked =
                                        isDropdownField &&
                                        isLocationFieldSelectionBlocked(
                                          item,
                                          serviceForm,
                                          field,
                                          serviceEntryIndex,
                                        );
                                      const isMobileField = field.fieldType === "mobile";

                                      return (
                                        <div
                                          key={`${item._id}-${serviceForm.serviceId}-${fieldStorageKey}-${serviceEntryIndex}`}
                                          style={
                                            isRejectedField
                                              ? {
                                                  display: "grid",
                                                  gridTemplateColumns: fieldRowTemplate,
                                                  gap: "0.7rem",
                                                  alignItems: fieldRowAlignItems,
                                                  gridColumn: fieldGridColumn,
                                                  border: "1px solid #F5C2C7",
                                                  borderRadius: "10px",
                                                  background: "#FFF7F7",
                                                  padding: "0.55rem 0.6rem",
                                                }
                                              : {
                                                  display: "grid",
                                                  gridTemplateColumns: fieldRowTemplate,
                                                  gap: "0.7rem",
                                                  alignItems: fieldRowAlignItems,
                                                  gridColumn: fieldGridColumn,
                                                }
                                          }
                                        >
                                          <label className="label" style={{ marginBottom: 0 }}>
                                            <QuestionPrompt
                                              iconKey={field.iconKey}
                                              labelText={labelText}
                                              isRejectedField={isRejectedField}
                                            />
                                          </label>
                                          <div style={{ display: "grid", gap: "0.3rem" }}>
                                            {questionRepeatableHint}
                                            {entryNotApplicableToggle}
                                            {personalDetailsCopyToggle}
                                            {isDropdownField ? (
                                              <select
                                                className="input"
                                                value={entryValue}
                                                onChange={(e) =>
                                                  setServiceLevelEntryFieldValue(
                                                    item,
                                                    serviceForm,
                                                    field,
                                                    serviceEntryIndex,
                                                    e.target.value,
                                                  )
                                                }
                                                required={field.required && !isEntryNotApplicable}
                                                disabled={isEntryNotApplicable || isLocationSelectionBlocked}
                                              >
                                                <option value="">{DROPDOWN_DEFAULT_OPTION_LABEL}</option>
                                                {dropdownOptions.map((option, optionIndex) => (
                                                  <option key={`${fieldStorageKey}-${serviceEntryIndex}-${optionIndex}`} value={option}>
                                                    {option}
                                                  </option>
                                                ))}
                                              </select>
                                            ) : isMobileField && parsedEntryMobileValue ? (
                                              <div
                                                style={{
                                                  display: "grid",
                                                  gridTemplateColumns: "minmax(120px, 0.9fr) minmax(0, 1fr)",
                                                  gap: "0.45rem",
                                                }}
                                              >
                                                <select
                                                  className="input"
                                                  value={parsedEntryMobileValue.countryCode}
                                                  onChange={(e) =>
                                                    setServiceLevelEntryFieldValue(
                                                      item,
                                                      serviceForm,
                                                      field,
                                                      serviceEntryIndex,
                                                      serializeMobileAnswerValue({
                                                        countryCode: e.target.value,
                                                        number: parsedEntryMobileValue.number,
                                                      }),
                                                    )
                                                  }
                                                  disabled={isEntryNotApplicable}
                                                >
                                                  {MOBILE_COUNTRY_CODE_OPTIONS.map((countryCodeOption) => (
                                                    <option
                                                      key={`${fieldStorageKey}-${serviceEntryIndex}-${countryCodeOption}`}
                                                      value={countryCodeOption}
                                                    >
                                                      {countryCodeOption}
                                                    </option>
                                                  ))}
                                                </select>
                                                <input
                                                  className="input"
                                                  type="tel"
                                                  value={parsedEntryMobileValue.number}
                                                  onChange={(e) =>
                                                    setServiceLevelEntryFieldValue(
                                                      item,
                                                      serviceForm,
                                                      field,
                                                      serviceEntryIndex,
                                                      serializeMobileAnswerValue({
                                                        countryCode: parsedEntryMobileValue.countryCode,
                                                        number: e.target.value,
                                                      }),
                                                    )
                                                  }
                                                  required={field.required && !isEntryNotApplicable}
                                                  disabled={isEntryNotApplicable}
                                                />
                                              </div>
                                            ) : (
                                              <input
                                                className="input"
                                                type={inputType}
                                                value={entryValue}
                                                onChange={(e) =>
                                                  setServiceLevelEntryFieldValue(
                                                    item,
                                                    serviceForm,
                                                    field,
                                                    serviceEntryIndex,
                                                    e.target.value,
                                                  )
                                                }
                                                min={field.fieldType === "date" ? resolveMinDateConstraint(item, serviceForm, field, serviceEntryIndex) : undefined}
                                                minLength={typeof field.minLength === "number" ? field.minLength : undefined}
                                                maxLength={typeof field.maxLength === "number" ? field.maxLength : undefined}
                                                required={field.required && !isEntryNotApplicable}
                                                disabled={isEntryNotApplicable}
                                              />
                                            )}
                                            {isEntryNotApplicable ? (
                                              <p style={{ margin: 0, color: "#6C757D", fontSize: "0.82rem" }}>
                                                Saved as: {resolvedNotApplicableText}
                                              </p>
                                            ) : null}
                                            {field.fieldType === "date" ? (
                                              <p style={{ margin: 0, color: "#6C757D", fontSize: "0.82rem" }}>
                                                Pick a date from the calendar.
                                              </p>
                                            ) : null}
                                            {constraintHint ? (
                                              <p style={{ margin: 0, color: "#6C757D", fontSize: "0.82rem" }}>
                                                {constraintHint}
                                              </p>
                                            ) : null}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
                                gap: "0.75rem",
                              }}
                            >
                              {serviceForm.fields.map((field) => {
                              const serviceAllowsMultipleEntries = Boolean(serviceForm.allowMultipleEntries);
                              const fieldStorageKey = field.fieldKey?.trim() || field.question.trim();
                              const answer = getDraftAnswer(item, serviceForm.serviceId, field);
                              const labelText = `${field.question}${field.required ? " *" : ""}`;
                              const fieldGridColumn = getFieldGridColumn(field);
                              const fieldRowTemplate = getFieldRowTemplate(field);
                              const fieldRowAlignItems =
                                resolveFieldPreviewWidth(field) === "third" ? "start" : "center";
                              const isNotApplicable =
                                !serviceAllowsMultipleEntries &&
                                Boolean(field.allowNotApplicable) &&
                                Boolean(answer.notApplicable);
                              const resolvedNotApplicableText =
                                field.notApplicableText?.trim() ||
                                answer.notApplicableText?.trim() ||
                                "Not Applicable";
                              const isRejectedField = rejectedFieldSet.has(
                                buildRejectedFieldKey(
                                  serviceForm.serviceId,
                                  field.fieldKey ?? "",
                                  field.question,
                                ),
                              );
                              const correctionStyle = isRejectedField
                                ? {
                                    border: "1px solid #F5C2C7",
                                    borderRadius: "10px",
                                    background: "#FFF7F7",
                                    padding: "0.55rem 0.6rem",
                                  }
                                : {};
                              const constraintHint = getConstraintHint(field);
                              const notApplicableToggle =
                                field.allowNotApplicable && !serviceAllowsMultipleEntries ? (
                                <label
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "0.4rem",
                                    color: "#4A5E79",
                                    fontSize: "0.82rem",
                                    fontWeight: 600,
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isNotApplicable}
                                    onChange={(e) => {
                                      const checked = e.target.checked;
                                      onAnswerChange(item._id, serviceForm.serviceId, fieldStorageKey, {
                                        ...answer,
                                        notApplicable: checked,
                                        notApplicableText: resolvedNotApplicableText,
                                        value: checked ? resolvedNotApplicableText : "",
                                        fileName: "",
                                        fileMimeType: "",
                                        fileSize: null,
                                        fileData: "",
                                        entryFiles: [],
                                      });
                                    }}
                                  />
                                  {resolvedNotApplicableText}
                                </label>
                                ) : null;
                              const personalDetailsCopyToggle = renderPersonalDetailsCopyCheckbox({
                                item,
                                serviceForm,
                                field,
                                fieldStorageKey,
                                answer,
                              });

                              if (field.fieldType === "long_text") {
                                if (supportsRepeatable(field, serviceAllowsMultipleEntries)) {
                                  const repeatableValues = parseRepeatableAnswerValues(answer.value);

                                  return (
                                    <div
                                      key={`${item._id}-${serviceForm.serviceId}-${fieldStorageKey}`}
                                      style={{ ...correctionStyle, gridColumn: fieldGridColumn }}
                                    >
                                      <label className="label">
                                        <QuestionPrompt
                                          iconKey={field.iconKey}
                                          labelText={labelText}
                                          isRejectedField={isRejectedField}
                                        />
                                      </label>
                                      {notApplicableToggle}
                                      <div style={{ display: "grid", gap: "0.55rem" }}>
                                        {repeatableValues.map((entryValue, entryIndex) => (
                                          <div
                                            key={`${item._id}-${serviceForm.serviceId}-${fieldStorageKey}-${entryIndex}`}
                                            style={{
                                              border: "1px solid #DEE2E6",
                                              borderRadius: "10px",
                                              padding: "0.55rem",
                                              background: "#FFFFFF",
                                              display: "grid",
                                              gap: "0.45rem",
                                            }}
                                          >
                                            <textarea
                                              className="input"
                                              rows={5}
                                              value={entryValue}
                                              onChange={(e) => {
                                                const nextValues = parseRepeatableAnswerValues(answer.value);
                                                nextValues[entryIndex] = normalizeAnswerValue(field, e.target.value);
                                                onAnswerChange(item._id, serviceForm.serviceId, fieldStorageKey, {
                                                  ...answer,
                                                  value: serializeRepeatableAnswerValues(nextValues),
                                                });
                                              }}
                                              minLength={typeof field.minLength === "number" ? field.minLength : undefined}
                                              maxLength={typeof field.maxLength === "number" ? field.maxLength : undefined}
                                              style={{ minHeight: "120px", resize: "vertical" }}
                                              required={field.required && !isNotApplicable}
                                              disabled={isNotApplicable}
                                            />
                                            {renderPersonalDetailsCopyCheckbox({
                                              item,
                                              serviceForm,
                                              field,
                                              fieldStorageKey,
                                              answer,
                                              entryIndex,
                                            })}
                                            <div style={{ display: "flex", justifyContent: "flex-end" }}>
                                              <button
                                                className="btn btn-secondary"
                                                type="button"
                                                style={{ padding: "0.35rem 0.65rem", fontSize: "0.8rem" }}
                                                disabled={
                                                  serviceAllowsMultipleEntries ||
                                                  repeatableValues.length === 1 ||
                                                  isNotApplicable
                                                }
                                                onClick={() => {
                                                  const nextValues = parseRepeatableAnswerValues(answer.value).filter(
                                                    (_value, idx) => idx !== entryIndex,
                                                  );
                                                  onAnswerChange(item._id, serviceForm.serviceId, fieldStorageKey, {
                                                    ...answer,
                                                    value: serializeRepeatableAnswerValues(nextValues),
                                                  });
                                                }}
                                              >
                                                Remove
                                              </button>
                                            </div>
                                          </div>
                                        ))}

                                        {!serviceAllowsMultipleEntries ? (
                                          <button
                                            className="btn btn-secondary"
                                            type="button"
                                            style={{ justifySelf: "start", padding: "0.4rem 0.7rem", fontSize: "0.82rem" }}
                                            disabled={isNotApplicable}
                                            onClick={() => {
                                              const nextValues = [...parseRepeatableAnswerValues(answer.value), ""];
                                              onAnswerChange(item._id, serviceForm.serviceId, fieldStorageKey, {
                                                ...answer,
                                                value: serializeRepeatableAnswerValues(nextValues),
                                              });
                                            }}
                                          >
                                            + Add another entry
                                          </button>
                                        ) : null}

                                        {isNotApplicable ? (
                                          <p style={{ margin: 0, color: "#6C757D", fontSize: "0.82rem" }}>
                                            Saved as: {resolvedNotApplicableText}
                                          </p>
                                        ) : null}
                                      </div>
                                      {constraintHint ? (
                                        <p style={{ margin: "0.3rem 0 0", color: "#6C757D", fontSize: "0.82rem" }}>
                                          {constraintHint}
                                        </p>
                                      ) : null}
                                    </div>
                                  );
                                }

                                return (
                                  <div
                                    key={`${item._id}-${serviceForm.serviceId}-${fieldStorageKey}`}
                                    style={{ ...correctionStyle, gridColumn: fieldGridColumn }}
                                  >
                                    <label className="label">
                                      <QuestionPrompt
                                        iconKey={field.iconKey}
                                        labelText={labelText}
                                        isRejectedField={isRejectedField}
                                      />
                                    </label>
                                    {notApplicableToggle}
                                    {personalDetailsCopyToggle}
                                    <textarea
                                      className="input"
                                      rows={5}
                                      value={answer.value}
                                      onChange={(e) =>
                                        onAnswerChange(item._id, serviceForm.serviceId, fieldStorageKey, {
                                          ...answer,
                                          value: normalizeAnswerValue(field, e.target.value),
                                        })
                                      }
                                      minLength={typeof field.minLength === "number" ? field.minLength : undefined}
                                      maxLength={typeof field.maxLength === "number" ? field.maxLength : undefined}
                                      style={{ minHeight: "120px", resize: "vertical" }}
                                      required={field.required && !isNotApplicable}
                                      disabled={isNotApplicable}
                                    />
                                    {isNotApplicable ? (
                                      <p style={{ margin: "0.3rem 0 0", color: "#6C757D", fontSize: "0.82rem" }}>
                                        Saved as: {resolvedNotApplicableText}
                                      </p>
                                    ) : null}
                                    {constraintHint ? (
                                      <p style={{ margin: "0.3rem 0 0", color: "#6C757D", fontSize: "0.82rem" }}>
                                        {constraintHint}
                                      </p>
                                    ) : null}
                                  </div>
                                );
                              }

                              if (field.fieldType === "file") {
                                return (
                                  <div
                                    key={`${item._id}-${serviceForm.serviceId}-${fieldStorageKey}`}
                                    style={{ ...correctionStyle, gridColumn: fieldGridColumn }}
                                  >
                                    <label className="label">
                                      <QuestionPrompt
                                        iconKey={field.iconKey}
                                        labelText={labelText}
                                        isRejectedField={isRejectedField}
                                      />
                                    </label>
                                    {notApplicableToggle}
                                    <input
                                      className="input"
                                      type="file"
                                      accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                                      onChange={(e) =>
                                        onFileChange(
                                          item._id,
                                          serviceForm.serviceId,
                                          fieldStorageKey,
                                          e.target.files?.[0] ?? null,
                                          answer,
                                        )
                                      }
                                      required={field.required && !answer.fileData && !isNotApplicable}
                                      disabled={isNotApplicable}
                                    />
                                    <p style={{ margin: "0.35rem 0 0", color: "#6C757D", fontSize: "0.86rem" }}>
                                      PDF, JPG, PNG only. Maximum size 5MB.
                                    </p>
                                    {isNotApplicable ? (
                                      <p style={{ margin: "0.3rem 0 0", color: "#6C757D", fontSize: "0.82rem" }}>
                                        Saved as: {resolvedNotApplicableText}
                                      </p>
                                    ) : null}
                                    {answer.fileData ? (
                                      <div style={{ marginTop: "0.35rem", fontSize: "0.88rem" }}>
                                        <a href={answer.fileData} target="_blank" rel="noreferrer" style={{ color: "#4A90E2", fontWeight: 700 }}>
                                          {answer.fileName || "View uploaded file"}
                                        </a>
                                        {answer.fileSize ? ` (${formatFileSize(answer.fileSize)})` : ""}
                                      </div>
                                    ) : null}
                                  </div>
                                );
                              }

                              const inputType =
                                field.fieldType === "number"
                                  ? "number"
                                  : field.fieldType === "date"
                                    ? "date"
                                    : field.fieldType === "email"
                                      ? "email"
                                    : "text";
                              const isDropdownField = field.fieldType === "dropdown";
                              const dropdownOptions = isDropdownField
                                ? resolveDropdownOptionsForField(item, serviceForm, field)
                                : [];
                              const isLocationSelectionBlocked =
                                isDropdownField &&
                                isLocationFieldSelectionBlocked(item, serviceForm, field);
                              const isMobileField = field.fieldType === "mobile";
                              const parsedSingleMobileValue =
                                isMobileField
                                  ? parseMobileAnswerValue(
                                      answer.value,
                                      resolveServiceCountryDialCode(item, serviceForm),
                                    )
                                  : null;

                              if (supportsRepeatable(field, serviceAllowsMultipleEntries)) {
                                const repeatableValues = parseRepeatableAnswerValues(answer.value);

                                return (
                                  <div
                                    key={`${item._id}-${serviceForm.serviceId}-${fieldStorageKey}`}
                                    style={
                                      isRejectedField
                                        ? {
                                            display: "grid",
                                            gridTemplateColumns: fieldRowTemplate,
                                            gap: "0.7rem",
                                            alignItems: "start",
                                            gridColumn: fieldGridColumn,
                                            border: "1px solid #F5C2C7",
                                            borderRadius: "10px",
                                            background: "#FFF7F7",
                                            padding: "0.55rem 0.6rem",
                                          }
                                        : {
                                            display: "grid",
                                            gridTemplateColumns: fieldRowTemplate,
                                            gap: "0.7rem",
                                            alignItems: "start",
                                            gridColumn: fieldGridColumn,
                                          }
                                    }
                                  >
                                    <label className="label" style={{ marginBottom: 0 }}>
                                      <QuestionPrompt
                                        iconKey={field.iconKey}
                                        labelText={labelText}
                                        isRejectedField={isRejectedField}
                                      />
                                    </label>
                                    <div style={{ display: "grid", gap: "0.45rem" }}>
                                      {notApplicableToggle}
                                      {repeatableValues.map((entryValue, entryIndex) => (
                                        <div
                                          key={`${item._id}-${serviceForm.serviceId}-${fieldStorageKey}-${entryIndex}`}
                                          style={{
                                            border: "1px solid #DEE2E6",
                                            borderRadius: "10px",
                                            background: "#FFFFFF",
                                            padding: "0.5rem",
                                            display: "grid",
                                            gap: "0.35rem",
                                          }}
                                        >
                                            {(() => {
                                              const repeatableDropdownOptions = isDropdownField
                                                ? resolveDropdownOptionsForField(
                                                    item,
                                                    serviceForm,
                                                    field,
                                                    entryIndex,
                                                  )
                                                : [];
                                              const isRepeatableLocationSelectionBlocked =
                                                isDropdownField &&
                                                isLocationFieldSelectionBlocked(
                                                  item,
                                                  serviceForm,
                                                  field,
                                                  entryIndex,
                                                );
                                              const parsedRepeatableMobileValue =
                                                isMobileField
                                                  ? parseMobileAnswerValue(
                                                      entryValue,
                                                      resolveServiceCountryDialCode(
                                                        item,
                                                        serviceForm,
                                                        entryIndex,
                                                      ),
                                                    )
                                                  : null;

                                              return (
                                          <div
                                            style={{
                                              display: "grid",
                                              gridTemplateColumns: "minmax(0, 1fr) auto",
                                              gap: "0.5rem",
                                              alignItems: "center",
                                            }}
                                          >
                                            {isDropdownField ? (
                                              <select
                                                className="input"
                                                value={entryValue}
                                                onChange={(e) => {
                                                  const nextValues = parseRepeatableAnswerValues(answer.value);
                                                  nextValues[entryIndex] = e.target.value;
                                                  onAnswerChange(item._id, serviceForm.serviceId, fieldStorageKey, {
                                                    ...answer,
                                                    value: serializeRepeatableAnswerValues(nextValues),
                                                  });
                                                }}
                                                required={field.required && !isNotApplicable}
                                                disabled={isNotApplicable || isRepeatableLocationSelectionBlocked}
                                              >
                                                <option value="">{DROPDOWN_DEFAULT_OPTION_LABEL}</option>
                                                {repeatableDropdownOptions.map((option, optionIndex) => (
                                                  <option key={`${fieldStorageKey}-${entryIndex}-${optionIndex}`} value={option}>
                                                    {option}
                                                  </option>
                                                ))}
                                              </select>
                                            ) : isMobileField && parsedRepeatableMobileValue ? (
                                              <div
                                                style={{
                                                  display: "grid",
                                                  gridTemplateColumns: "minmax(120px, 0.9fr) minmax(0, 1fr)",
                                                  gap: "0.45rem",
                                                }}
                                              >
                                                <select
                                                  className="input"
                                                  value={parsedRepeatableMobileValue.countryCode}
                                                  onChange={(e) => {
                                                    const nextValues = parseRepeatableAnswerValues(answer.value);
                                                    nextValues[entryIndex] = serializeMobileAnswerValue({
                                                      countryCode: e.target.value,
                                                      number: parsedRepeatableMobileValue.number,
                                                    });
                                                    onAnswerChange(item._id, serviceForm.serviceId, fieldStorageKey, {
                                                      ...answer,
                                                      value: serializeRepeatableAnswerValues(nextValues),
                                                    });
                                                  }}
                                                  disabled={isNotApplicable}
                                                >
                                                  {MOBILE_COUNTRY_CODE_OPTIONS.map((countryCodeOption) => (
                                                    <option
                                                      key={`${fieldStorageKey}-${entryIndex}-${countryCodeOption}`}
                                                      value={countryCodeOption}
                                                    >
                                                      {countryCodeOption}
                                                    </option>
                                                  ))}
                                                </select>
                                                <input
                                                  className="input"
                                                  type="tel"
                                                  value={parsedRepeatableMobileValue.number}
                                                  onChange={(e) => {
                                                    const nextValues = parseRepeatableAnswerValues(answer.value);
                                                    nextValues[entryIndex] = serializeMobileAnswerValue({
                                                      countryCode: parsedRepeatableMobileValue.countryCode,
                                                      number: e.target.value,
                                                    });
                                                    onAnswerChange(item._id, serviceForm.serviceId, fieldStorageKey, {
                                                      ...answer,
                                                      value: serializeRepeatableAnswerValues(nextValues),
                                                    });
                                                  }}
                                                  required={field.required && !isNotApplicable}
                                                  disabled={isNotApplicable}
                                                />
                                              </div>
                                            ) : (
                                              <input
                                                className="input"
                                                type={inputType}
                                                value={entryValue}
                                                onChange={(e) => {
                                                  const nextValues = parseRepeatableAnswerValues(answer.value);
                                                  nextValues[entryIndex] = normalizeAnswerValue(field, e.target.value);
                                                  onAnswerChange(item._id, serviceForm.serviceId, fieldStorageKey, {
                                                    ...answer,
                                                    value: serializeRepeatableAnswerValues(nextValues),
                                                  });
                                                }}
                                                min={field.fieldType === "date" ? resolveMinDateConstraint(item, serviceForm, field, entryIndex) : undefined}
                                                minLength={typeof field.minLength === "number" ? field.minLength : undefined}
                                                maxLength={typeof field.maxLength === "number" ? field.maxLength : undefined}
                                                required={field.required && !isNotApplicable}
                                                disabled={isNotApplicable}
                                              />
                                            )}
                                            <button
                                              className="btn btn-secondary"
                                              type="button"
                                              style={{ padding: "0.35rem 0.65rem", fontSize: "0.8rem" }}
                                              disabled={
                                                serviceAllowsMultipleEntries ||
                                                repeatableValues.length === 1 ||
                                                isNotApplicable
                                              }
                                              onClick={() => {
                                                const nextValues = parseRepeatableAnswerValues(answer.value).filter(
                                                  (_value, idx) => idx !== entryIndex,
                                                );
                                                onAnswerChange(item._id, serviceForm.serviceId, fieldStorageKey, {
                                                  ...answer,
                                                  value: serializeRepeatableAnswerValues(nextValues),
                                                });
                                              }}
                                            >
                                              Remove
                                            </button>
                                          </div>
                                              );
                                            })()}
                                          {renderPersonalDetailsCopyCheckbox({
                                            item,
                                            serviceForm,
                                            field,
                                            fieldStorageKey,
                                            answer,
                                            entryIndex,
                                          })}
                                          {field.fieldType === "date" ? (
                                            <p style={{ margin: 0, color: "#6C757D", fontSize: "0.82rem" }}>
                                              Pick a date from the calendar.
                                            </p>
                                          ) : null}
                                        </div>
                                      ))}

                                      {!serviceAllowsMultipleEntries ? (
                                        <button
                                          className="btn btn-secondary"
                                          type="button"
                                          style={{ justifySelf: "start", padding: "0.4rem 0.7rem", fontSize: "0.82rem" }}
                                          disabled={isNotApplicable}
                                          onClick={() => {
                                            const nextValues = [...parseRepeatableAnswerValues(answer.value), ""];
                                            onAnswerChange(item._id, serviceForm.serviceId, fieldStorageKey, {
                                              ...answer,
                                              value: serializeRepeatableAnswerValues(nextValues),
                                            });
                                          }}
                                        >
                                          + Add another entry
                                        </button>
                                      ) : null}

                                      {isNotApplicable ? (
                                        <p style={{ margin: 0, color: "#6C757D", fontSize: "0.82rem" }}>
                                          Saved as: {resolvedNotApplicableText}
                                        </p>
                                      ) : null}

                                      {constraintHint ? (
                                        <p style={{ margin: 0, color: "#6C757D", fontSize: "0.82rem" }}>
                                          {constraintHint}
                                        </p>
                                      ) : null}
                                    </div>
                                  </div>
                                );
                              }

                              return (
                                <div
                                  key={`${item._id}-${serviceForm.serviceId}-${fieldStorageKey}`}
                                  style={
                                    isRejectedField
                                      ? {
                                          display: "grid",
                                          gridTemplateColumns: fieldRowTemplate,
                                          gap: "0.7rem",
                                          alignItems: fieldRowAlignItems,
                                          gridColumn: fieldGridColumn,
                                          border: "1px solid #F5C2C7",
                                          borderRadius: "10px",
                                          background: "#FFF7F7",
                                          padding: "0.55rem 0.6rem",
                                        }
                                      : {
                                          display: "grid",
                                          gridTemplateColumns: fieldRowTemplate,
                                          gap: "0.7rem",
                                          alignItems: fieldRowAlignItems,
                                          gridColumn: fieldGridColumn,
                                        }
                                  }
                                >
                                  <label className="label" style={{ marginBottom: 0 }}>
                                    <QuestionPrompt
                                      iconKey={field.iconKey}
                                      labelText={labelText}
                                      isRejectedField={isRejectedField}
                                    />
                                  </label>
                                  <div style={{ display: "grid", gap: "0.3rem" }}>
                                    {notApplicableToggle}
                                    {personalDetailsCopyToggle}
                                    {isDropdownField ? (
                                      <select
                                        className="input"
                                        value={answer.value}
                                        onChange={(e) =>
                                          setSingleFieldValueWithLocationCascade(
                                            item,
                                            serviceForm,
                                            field,
                                            answer,
                                            fieldStorageKey,
                                            e.target.value,
                                          )
                                        }
                                        required={field.required && !isNotApplicable}
                                        disabled={isNotApplicable || isLocationSelectionBlocked}
                                      >
                                        <option value="">{DROPDOWN_DEFAULT_OPTION_LABEL}</option>
                                        {dropdownOptions.map((option, optionIndex) => (
                                          <option key={`${fieldStorageKey}-${optionIndex}`} value={option}>
                                            {option}
                                          </option>
                                        ))}
                                      </select>
                                    ) : isMobileField && parsedSingleMobileValue ? (
                                      <div
                                        style={{
                                          display: "grid",
                                          gridTemplateColumns: "minmax(120px, 0.9fr) minmax(0, 1fr)",
                                          gap: "0.45rem",
                                        }}
                                      >
                                        <select
                                          className="input"
                                          value={parsedSingleMobileValue.countryCode}
                                          onChange={(e) =>
                                            onAnswerChange(item._id, serviceForm.serviceId, fieldStorageKey, {
                                              ...answer,
                                              value: serializeMobileAnswerValue({
                                                countryCode: e.target.value,
                                                number: parsedSingleMobileValue.number,
                                              }),
                                            })
                                          }
                                          disabled={isNotApplicable}
                                        >
                                          {MOBILE_COUNTRY_CODE_OPTIONS.map((countryCodeOption) => (
                                            <option key={`${fieldStorageKey}-${countryCodeOption}`} value={countryCodeOption}>
                                              {countryCodeOption}
                                            </option>
                                          ))}
                                        </select>
                                        <input
                                          className="input"
                                          type="tel"
                                          value={parsedSingleMobileValue.number}
                                          onChange={(e) =>
                                            onAnswerChange(item._id, serviceForm.serviceId, fieldStorageKey, {
                                              ...answer,
                                              value: serializeMobileAnswerValue({
                                                countryCode: parsedSingleMobileValue.countryCode,
                                                number: e.target.value,
                                              }),
                                            })
                                          }
                                          required={field.required && !isNotApplicable}
                                          disabled={isNotApplicable}
                                        />
                                      </div>
                                    ) : (
                                      <input
                                        className="input"
                                        type={inputType}
                                        value={answer.value}
                                        onChange={(e) =>
                                          onAnswerChange(item._id, serviceForm.serviceId, fieldStorageKey, {
                                            ...answer,
                                            value: normalizeAnswerValue(field, e.target.value),
                                          })
                                        }
                                        min={field.fieldType === "date" ? resolveMinDateConstraint(item, serviceForm, field) : undefined}
                                        minLength={typeof field.minLength === "number" ? field.minLength : undefined}
                                        maxLength={typeof field.maxLength === "number" ? field.maxLength : undefined}
                                        required={field.required && !isNotApplicable}
                                        disabled={isNotApplicable}
                                      />
                                    )}
                                    {isNotApplicable ? (
                                      <p style={{ margin: 0, color: "#6C757D", fontSize: "0.82rem" }}>
                                        Saved as: {resolvedNotApplicableText}
                                      </p>
                                    ) : null}
                                    {field.fieldType === "date" ? (
                                      <p style={{ margin: 0, color: "#6C757D", fontSize: "0.82rem" }}>
                                        Pick a date from the calendar.
                                      </p>
                                    ) : null}
                                    {constraintHint ? (
                                      <p style={{ margin: 0, color: "#6C757D", fontSize: "0.82rem" }}>
                                        {constraintHint}
                                      </p>
                                    ) : null}
                                  </div>
                                </div>
                              );
                            })}
                            </div>
                          )}
                        </div>
                      ))}

                      <button
                        className="btn btn-primary"
                        type="button"
                        disabled={submittingRequestId === item._id}
                        onClick={() => submitForm(item)}
                      >
                        {submittingRequestId === item._id ? "Submitting..." : "Submit Form To Admin"}
                      </button>
                    </div>
                  </div>
                ) : null}
              </BlockCard>
            );
          })}
        </section>
      </div>
    </PortalFrame>
  );
}

export default function OrdersPage() {
  return (
    <Suspense
      fallback={
        <main className="portal-shell">
          <BlockCard tone="muted">
            <p className="block-subtitle">Loading candidate forms...</p>
          </BlockCard>
        </main>
      }
    >
      <OrdersPageContent />
    </Suspense>
  );
}
