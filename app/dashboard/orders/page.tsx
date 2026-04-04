"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronDown, Sparkles } from "lucide-react";
import { PortalFrame } from "@/components/dashboard/PortalFrame";
import { BlockCard, BlockTitle } from "@/components/ui/blocks";
import { getAlertTone } from "@/lib/alerts";
import { usePortalSession } from "@/lib/hooks/usePortalSession";
import { useRequestsData } from "@/lib/hooks/useRequestsData";
import { RequestItem, ServiceFormField } from "@/lib/types";

type DraftAnswer = {
  value: string;
  fileName: string;
  fileMimeType: string;
  fileSize: number | null;
  fileData: string;
};

const ALLOWED_UPLOAD_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
]);
const MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024;

function createEmptyDraftAnswer(): DraftAnswer {
  return {
    value: "",
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

function buildRejectedFieldKey(serviceId: string, question: string) {
  return `${serviceId}::${question.trim()}`;
}

function supportsLengthConstraints(field: ServiceFormField) {
  return field.fieldType === "text" || field.fieldType === "long_text";
}

function normalizeAnswerValue(field: ServiceFormField, rawValue: string) {
  let nextValue = rawValue;

  if (field.forceUppercase) {
    nextValue = nextValue.toUpperCase();
  }

  if (
    supportsLengthConstraints(field) &&
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
  if (typeof field.minLength === "number") {
    hints.push(`Min ${field.minLength} chars`);
  }
  if (typeof field.maxLength === "number") {
    hints.push(`Max ${field.maxLength} chars`);
  }
  if (field.forceUppercase) {
    hints.push("ALL CAPS");
  }

  return hints.join(" | ");
}

function supportsRepeatable(field: ServiceFormField) {
  return field.fieldType !== "file" && Boolean(field.repeatable);
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

function OrdersPageContent() {
  const { me, loading, logout } = usePortalSession();
  const searchParams = useSearchParams();
  const { items, loading: requestsLoading, refreshRequests } = useRequestsData();
  const [requestsReady, setRequestsReady] = useState(false);
  const [formDrafts, setFormDrafts] = useState<
    Record<string, Record<string, Record<string, DraftAnswer>>>
  >({});
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
    const draftValue = formDrafts[item._id]?.[serviceId]?.[field.question];
    if (draftValue) {
      return draftValue;
    }

    const existingResponse = item.candidateFormResponses.find(
      (response) => response.serviceId === serviceId,
    );
    const existingAnswer = existingResponse?.answers.find((answer) => answer.question === field.question);

    return {
      value: existingAnswer?.value ?? "",
      fileName: existingAnswer?.fileName ?? "",
      fileMimeType: existingAnswer?.fileMimeType ?? "",
      fileSize: existingAnswer?.fileSize ?? null,
      fileData: existingAnswer?.fileData ?? "",
    };
  }

  function onAnswerChange(
    requestId: string,
    serviceId: string,
    question: string,
    next: DraftAnswer,
  ) {
    setFormDrafts((prev) => ({
      ...prev,
      [requestId]: {
        ...(prev[requestId] ?? {}),
        [serviceId]: {
          ...(prev[requestId]?.[serviceId] ?? {}),
          [question]: next,
        },
      },
    }));
  }

  async function onFileChange(
    requestId: string,
    serviceId: string,
    question: string,
    file: File | null,
  ) {
    if (!file) {
      onAnswerChange(requestId, serviceId, question, createEmptyDraftAnswer());
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
      onAnswerChange(requestId, serviceId, question, {
        value: file.name,
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
      answers: serviceForm.fields.map((field) => {
        const answer = getDraftAnswer(item, serviceForm.serviceId, field);
        const normalizedValue = supportsRepeatable(field)
          ? serializeRepeatableAnswerValues(
              parseRepeatableAnswerValues(answer.value)
                .map((entry) => normalizeAnswerValue(field, entry).trim())
                .filter(Boolean),
            )
          : normalizeAnswerValue(field, answer.value);

        return {
          question: field.question,
          repeatable: supportsRepeatable(field),
          value: normalizedValue,
          fileName: answer.fileName,
          fileMimeType: answer.fileMimeType,
          fileSize: answer.fileSize,
          fileData: answer.fileData,
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
                buildRejectedFieldKey(field.serviceId, field.question),
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
                        {item.selectedServices.map((service) => service.serviceName).join(", ")}
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
                            border: "1px solid #E0E0E0",
                            borderRadius: "12px",
                            padding: "0.75rem",
                            background: "#F8F9FA",
                            display: "grid",
                            gap: "0.75rem",
                          }}
                        >
                          <strong>{serviceForm.serviceName}</strong>

                          {serviceForm.fields.length === 0 ? (
                            <p className="block-subtitle">No custom form fields for this service.</p>
                          ) : (
                            serviceForm.fields.map((field) => {
                              const answer = getDraftAnswer(item, serviceForm.serviceId, field);
                              const labelText = `${field.question}${field.required ? " *" : ""}`;
                              const isRejectedField = rejectedFieldSet.has(
                                buildRejectedFieldKey(serviceForm.serviceId, field.question),
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

                              if (field.fieldType === "long_text") {
                                if (supportsRepeatable(field)) {
                                  const repeatableValues = parseRepeatableAnswerValues(answer.value);

                                  return (
                                    <div key={`${item._id}-${serviceForm.serviceId}-${field.question}`} style={correctionStyle}>
                                      <label className="label">
                                        {labelText}
                                        {isRejectedField ? (
                                          <span style={{ marginLeft: "0.45rem", color: "#B02A37", fontSize: "0.78rem" }}>
                                            Needs correction
                                          </span>
                                        ) : null}
                                      </label>
                                      <div style={{ display: "grid", gap: "0.55rem" }}>
                                        {repeatableValues.map((entryValue, entryIndex) => (
                                          <div
                                            key={`${item._id}-${serviceForm.serviceId}-${field.question}-${entryIndex}`}
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
                                                onAnswerChange(item._id, serviceForm.serviceId, field.question, {
                                                  ...answer,
                                                  value: serializeRepeatableAnswerValues(nextValues),
                                                });
                                              }}
                                              minLength={typeof field.minLength === "number" ? field.minLength : undefined}
                                              maxLength={typeof field.maxLength === "number" ? field.maxLength : undefined}
                                              style={{ minHeight: "120px", resize: "vertical" }}
                                              required={field.required}
                                            />
                                            <div style={{ display: "flex", justifyContent: "flex-end" }}>
                                              <button
                                                className="btn btn-secondary"
                                                type="button"
                                                style={{ padding: "0.35rem 0.65rem", fontSize: "0.8rem" }}
                                                disabled={repeatableValues.length === 1}
                                                onClick={() => {
                                                  const nextValues = parseRepeatableAnswerValues(answer.value).filter(
                                                    (_value, idx) => idx !== entryIndex,
                                                  );
                                                  onAnswerChange(item._id, serviceForm.serviceId, field.question, {
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

                                        <button
                                          className="btn btn-secondary"
                                          type="button"
                                          style={{ justifySelf: "start", padding: "0.4rem 0.7rem", fontSize: "0.82rem" }}
                                          onClick={() => {
                                            const nextValues = [...parseRepeatableAnswerValues(answer.value), ""];
                                            onAnswerChange(item._id, serviceForm.serviceId, field.question, {
                                              ...answer,
                                              value: serializeRepeatableAnswerValues(nextValues),
                                            });
                                          }}
                                        >
                                          + Add another entry
                                        </button>
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
                                  <div key={`${item._id}-${serviceForm.serviceId}-${field.question}`} style={correctionStyle}>
                                    <label className="label">
                                      {labelText}
                                      {isRejectedField ? (
                                        <span style={{ marginLeft: "0.45rem", color: "#B02A37", fontSize: "0.78rem" }}>
                                          Needs correction
                                        </span>
                                      ) : null}
                                    </label>
                                    <textarea
                                      className="input"
                                      rows={5}
                                      value={answer.value}
                                      onChange={(e) =>
                                        onAnswerChange(item._id, serviceForm.serviceId, field.question, {
                                          ...answer,
                                          value: normalizeAnswerValue(field, e.target.value),
                                        })
                                      }
                                      minLength={typeof field.minLength === "number" ? field.minLength : undefined}
                                      maxLength={typeof field.maxLength === "number" ? field.maxLength : undefined}
                                      style={{ minHeight: "120px", resize: "vertical" }}
                                      required={field.required}
                                    />
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
                                  <div key={`${item._id}-${serviceForm.serviceId}-${field.question}`} style={correctionStyle}>
                                    <label className="label">
                                      {labelText}
                                      {isRejectedField ? (
                                        <span style={{ marginLeft: "0.45rem", color: "#B02A37", fontSize: "0.78rem" }}>
                                          Needs correction
                                        </span>
                                      ) : null}
                                    </label>
                                    <input
                                      className="input"
                                      type="file"
                                      accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                                      onChange={(e) =>
                                        onFileChange(
                                          item._id,
                                          serviceForm.serviceId,
                                          field.question,
                                          e.target.files?.[0] ?? null,
                                        )
                                      }
                                      required={field.required && !answer.fileData}
                                    />
                                    <p style={{ margin: "0.35rem 0 0", color: "#6C757D", fontSize: "0.86rem" }}>
                                      PDF, JPG, PNG only. Maximum size 5MB.
                                    </p>
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

                              if (supportsRepeatable(field)) {
                                const repeatableValues = parseRepeatableAnswerValues(answer.value);

                                return (
                                  <div
                                    key={`${item._id}-${serviceForm.serviceId}-${field.question}`}
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
                                      {labelText}
                                      {isRejectedField ? (
                                        <span style={{ marginLeft: "0.45rem", color: "#B02A37", fontSize: "0.78rem" }}>
                                          Needs correction
                                        </span>
                                      ) : null}
                                    </label>
                                    <div style={{ display: "grid", gap: "0.45rem" }}>
                                      {repeatableValues.map((entryValue, entryIndex) => (
                                        <div
                                          key={`${item._id}-${serviceForm.serviceId}-${field.question}-${entryIndex}`}
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
                                                onAnswerChange(item._id, serviceForm.serviceId, field.question, {
                                                  ...answer,
                                                  value: serializeRepeatableAnswerValues(nextValues),
                                                });
                                              }}
                                              minLength={typeof field.minLength === "number" ? field.minLength : undefined}
                                              maxLength={typeof field.maxLength === "number" ? field.maxLength : undefined}
                                              required={field.required}
                                            />
                                            <button
                                              className="btn btn-secondary"
                                              type="button"
                                              style={{ padding: "0.35rem 0.65rem", fontSize: "0.8rem" }}
                                              disabled={repeatableValues.length === 1}
                                              onClick={() => {
                                                const nextValues = parseRepeatableAnswerValues(answer.value).filter(
                                                  (_value, idx) => idx !== entryIndex,
                                                );
                                                onAnswerChange(item._id, serviceForm.serviceId, field.question, {
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

                                      <button
                                        className="btn btn-secondary"
                                        type="button"
                                        style={{ justifySelf: "start", padding: "0.4rem 0.7rem", fontSize: "0.82rem" }}
                                        onClick={() => {
                                          const nextValues = [...parseRepeatableAnswerValues(answer.value), ""];
                                          onAnswerChange(item._id, serviceForm.serviceId, field.question, {
                                            ...answer,
                                            value: serializeRepeatableAnswerValues(nextValues),
                                          });
                                        }}
                                      >
                                        + Add another entry
                                      </button>

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
                                  key={`${item._id}-${serviceForm.serviceId}-${field.question}`}
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
                                    {labelText}
                                    {isRejectedField ? (
                                      <span style={{ marginLeft: "0.45rem", color: "#B02A37", fontSize: "0.78rem" }}>
                                        Needs correction
                                      </span>
                                    ) : null}
                                  </label>
                                  <div style={{ display: "grid", gap: "0.3rem" }}>
                                    <input
                                      className="input"
                                      type={inputType}
                                      value={answer.value}
                                      onChange={(e) =>
                                        onAnswerChange(item._id, serviceForm.serviceId, field.question, {
                                          ...answer,
                                          value: normalizeAnswerValue(field, e.target.value),
                                        })
                                      }
                                      minLength={typeof field.minLength === "number" ? field.minLength : undefined}
                                      maxLength={typeof field.maxLength === "number" ? field.maxLength : undefined}
                                      required={field.required}
                                    />
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
