"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
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
import { RequestItem, ServiceFormField } from "@/lib/types";

type DraftAnswer = {
  value: string;
  notApplicable: boolean;
  notApplicableText: string;
  fileName: string;
  fileMimeType: string;
  fileSize: number | null;
  fileData: string;
};

type RequestServiceForm = RequestItem["serviceForms"][number];

const ALLOWED_UPLOAD_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
]);
const MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024;
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
  return field.fieldType === "text" || field.fieldType === "long_text" || field.fieldType === "number";
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

  function getDraftAnswer(item: RequestItem, serviceId: string, field: ServiceFormField) {
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
    };
  }

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
          [fieldKey]: next,
        },
      },
    }));
  }

  function getServiceLevelEntryCount(item: RequestItem, serviceForm: RequestServiceForm) {
    if (!serviceForm.allowMultipleEntries) {
      return 1;
    }

    let maxEntries = 1;

    for (const field of serviceForm.fields) {
      if (field.fieldType === "file") {
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

    for (const field of serviceForm.fields) {
      if (field.fieldType === "file") {
        continue;
      }

      const fieldStorageKey = field.fieldKey?.trim() || field.question.trim();
      const answer = getDraftAnswer(item, serviceForm.serviceId, field);
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
  ) {
    if (!file) {
      onAnswerChange(requestId, serviceId, fieldKey, createEmptyDraftAnswer());
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
      onAnswerChange(requestId, serviceId, fieldKey, {
        value: file.name,
        notApplicable: false,
        notApplicableText: "",
        fileName: file.name,
        fileMimeType: mimeType,
        fileSize: file.size,
        fileData,
      });
    } catch {
      setMessage("Could not read selected file. Please try again.");
    }
  }

  async function submitForm(item: RequestItem) {
    setMessage("");
    setSubmittingRequestId(item._id);

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
        const normalizedRepeatableValues = parseRepeatableAnswerValues(answer.value)
          .map((entry) => {
            const trimmedEntry = entry.trim();
            if (
              Boolean(field.allowNotApplicable) &&
              trimmedEntry &&
              trimmedEntry === resolvedNotApplicableText
            ) {
              return resolvedNotApplicableText;
            }

            return normalizeAnswerValue(field, entry).trim();
          })
          .filter(Boolean);
        const hasRepeatableNotApplicableEntry =
          usesRepeatableMode &&
          Boolean(field.allowNotApplicable) &&
          normalizedRepeatableValues.some((entry) => entry === resolvedNotApplicableText);
        const normalizedValue = usesRepeatableMode
          ? serializeRepeatableAnswerValues(normalizedRepeatableValues)
          : normalizeAnswerValue(field, answer.value);

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
        };
      }),
    }));

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

                                  <div style={{ display: "grid", gap: "0.7rem" }}>
                                    {serviceForm.fields.map((field) => {
                                      const fieldStorageKey = field.fieldKey?.trim() || field.question.trim();
                                      const answer = getDraftAnswer(item, serviceForm.serviceId, field);
                                      const labelText = `${field.question}${field.required ? " *" : ""}`;
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
                                        : undefined;
                                      const constraintHint = getConstraintHint(field);

                                      if (field.fieldType === "file") {
                                        if (serviceEntryIndex > 0) {
                                          return null;
                                        }

                                        return (
                                          <div key={`${item._id}-${serviceForm.serviceId}-${fieldStorageKey}`} style={correctionStyle}>
                                            <label className="label">
                                              <QuestionPrompt
                                                iconKey={field.iconKey}
                                                labelText={labelText}
                                                isRejectedField={isRejectedField}
                                              />
                                            </label>
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
                                                )
                                              }
                                              required={field.required && !answer.fileData}
                                            />
                                            <p style={{ margin: "0.35rem 0 0", color: "#6C757D", fontSize: "0.86rem" }}>
                                              PDF, JPG, PNG only. Maximum size 5MB.
                                            </p>
                                            {getServiceLevelEntryCount(item, serviceForm) > 1 ? (
                                              <p style={{ margin: "0.2rem 0 0", color: "#6C757D", fontSize: "0.82rem" }}>
                                                This uploaded file is shared across all whole-service entries.
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

                                      const repeatableValues = parseRepeatableAnswerValues(answer.value);
                                      const entryValue = repeatableValues[serviceEntryIndex] ?? "";
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
                                      const questionRepeatableHint = Boolean(field.repeatable) ? (
                                        <p style={{ margin: 0, color: "#15803D", fontSize: "0.8rem", fontWeight: 600 }}>
                                          Specific-question multiple entries is enabled in Service Builder.
                                        </p>
                                      ) : null;

                                      if (field.fieldType === "long_text") {
                                        return (
                                          <div key={`${item._id}-${serviceForm.serviceId}-${fieldStorageKey}-${serviceEntryIndex}`} style={correctionStyle}>
                                            <label className="label">
                                              <QuestionPrompt
                                                iconKey={field.iconKey}
                                                labelText={labelText}
                                                isRejectedField={isRejectedField}
                                              />
                                            </label>
                                            {questionRepeatableHint}
                                            {entryNotApplicableToggle}
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
                                            : "text";

                                      return (
                                        <div
                                          key={`${item._id}-${serviceForm.serviceId}-${fieldStorageKey}-${serviceEntryIndex}`}
                                          style={
                                            isRejectedField
                                              ? {
                                                  display: "grid",
                                                  gridTemplateColumns: "minmax(210px, 1fr) minmax(260px, 2fr)",
                                                  gap: "0.7rem",
                                                  alignItems: "center",
                                                  border: "1px solid #F5C2C7",
                                                  borderRadius: "10px",
                                                  background: "#FFF7F7",
                                                  padding: "0.55rem 0.6rem",
                                                }
                                              : {
                                                  display: "grid",
                                                  gridTemplateColumns: "minmax(210px, 1fr) minmax(260px, 2fr)",
                                                  gap: "0.7rem",
                                                  alignItems: "center",
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
                                              minLength={typeof field.minLength === "number" ? field.minLength : undefined}
                                              maxLength={typeof field.maxLength === "number" ? field.maxLength : undefined}
                                              required={field.required && !isEntryNotApplicable}
                                              disabled={isEntryNotApplicable}
                                            />
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
                            serviceForm.fields.map((field) => {
                              const serviceAllowsMultipleEntries = Boolean(serviceForm.allowMultipleEntries);
                              const fieldStorageKey = field.fieldKey?.trim() || field.question.trim();
                              const answer = getDraftAnswer(item, serviceForm.serviceId, field);
                              const labelText = `${field.question}${field.required ? " *" : ""}`;
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
                                : undefined;
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
                                      });
                                    }}
                                  />
                                  {resolvedNotApplicableText}
                                </label>
                                ) : null;

                              if (field.fieldType === "long_text") {
                                if (supportsRepeatable(field, serviceAllowsMultipleEntries)) {
                                  const repeatableValues = parseRepeatableAnswerValues(answer.value);

                                  return (
                                    <div key={`${item._id}-${serviceForm.serviceId}-${fieldStorageKey}`} style={correctionStyle}>
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
                                  <div key={`${item._id}-${serviceForm.serviceId}-${fieldStorageKey}`} style={correctionStyle}>
                                    <label className="label">
                                      <QuestionPrompt
                                        iconKey={field.iconKey}
                                        labelText={labelText}
                                        isRejectedField={isRejectedField}
                                      />
                                    </label>
                                    {notApplicableToggle}
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
                                  <div key={`${item._id}-${serviceForm.serviceId}-${fieldStorageKey}`} style={correctionStyle}>
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
                                    : "text";

                              if (supportsRepeatable(field, serviceAllowsMultipleEntries)) {
                                const repeatableValues = parseRepeatableAnswerValues(answer.value);

                                return (
                                  <div
                                    key={`${item._id}-${serviceForm.serviceId}-${fieldStorageKey}`}
                                    style={
                                      isRejectedField
                                        ? {
                                            display: "grid",
                                            gridTemplateColumns: "minmax(210px, 1fr) minmax(260px, 2fr)",
                                            gap: "0.7rem",
                                            alignItems: "start",
                                            border: "1px solid #F5C2C7",
                                            borderRadius: "10px",
                                            background: "#FFF7F7",
                                            padding: "0.55rem 0.6rem",
                                          }
                                        : {
                                            display: "grid",
                                            gridTemplateColumns: "minmax(210px, 1fr) minmax(260px, 2fr)",
                                            gap: "0.7rem",
                                            alignItems: "start",
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
                                          <div
                                            style={{
                                              display: "grid",
                                              gridTemplateColumns: "minmax(0, 1fr) auto",
                                              gap: "0.5rem",
                                              alignItems: "center",
                                            }}
                                          >
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
                                              minLength={typeof field.minLength === "number" ? field.minLength : undefined}
                                              maxLength={typeof field.maxLength === "number" ? field.maxLength : undefined}
                                              required={field.required && !isNotApplicable}
                                              disabled={isNotApplicable}
                                            />
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
                                          gridTemplateColumns: "minmax(210px, 1fr) minmax(260px, 2fr)",
                                          gap: "0.7rem",
                                          alignItems: "center",
                                          border: "1px solid #F5C2C7",
                                          borderRadius: "10px",
                                          background: "#FFF7F7",
                                          padding: "0.55rem 0.6rem",
                                        }
                                      : {
                                          display: "grid",
                                          gridTemplateColumns: "minmax(210px, 1fr) minmax(260px, 2fr)",
                                          gap: "0.7rem",
                                          alignItems: "center",
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
                                      minLength={typeof field.minLength === "number" ? field.minLength : undefined}
                                      maxLength={typeof field.maxLength === "number" ? field.maxLength : undefined}
                                      required={field.required && !isNotApplicable}
                                      disabled={isNotApplicable}
                                    />
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
                            })
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
