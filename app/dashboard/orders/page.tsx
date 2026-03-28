"use client";

import { useEffect, useMemo, useState } from "react";
import { FileSignature, Sparkles } from "lucide-react";
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

export default function OrdersPage() {
  const { me, loading, logout } = usePortalSession();
  const { items, loading: requestsLoading, refreshRequests } = useRequestsData();
  const [requestsReady, setRequestsReady] = useState(false);
  const [formDrafts, setFormDrafts] = useState<
    Record<string, Record<string, Record<string, DraftAnswer>>>
  >({});
  const [submittingRequestId, setSubmittingRequestId] = useState("");
  const [message, setMessage] = useState("");

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

  if (loading || requestsLoading || !me || !requestsReady) {
    return (
      <main className="portal-shell">
        <BlockCard tone="muted">
          <p className="block-subtitle">Loading candidate forms...</p>
        </BlockCard>
      </main>
    );
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
        return {
          question: field.question,
          value: answer.value,
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

  return (
    <PortalFrame
      me={me}
      onLogout={logout}
      title="Candidate Forms"
      subtitle="Fill and submit assigned forms like Google Forms. Required questions are marked with *."
    >
      {message ? <p className={`inline-alert ${getAlertTone(message)}`}>{message}</p> : null}

      {pendingItems.length === 0 ? (
        <BlockCard as="article" tone="muted" interactive>
          <BlockTitle
            icon={<Sparkles size={14} />}
            title="All Forms Submitted"
            subtitle="No pending forms at the moment. Check History for approval updates."
          />
        </BlockCard>
      ) : null}

      <section className="dashboard-grid">
        {pendingItems.map((item) => (
          <BlockCard as="article" key={item._id} interactive>
            <BlockTitle
              icon={<FileSignature size={14} />}
              title={item.customerName}
              subtitle={`Request created ${new Date(item.createdAt).toLocaleDateString()} | ${item.selectedServices.map((service) => service.serviceName).join(", ")}`}
            />

            <div className="form-grid">
              {item.serviceForms.map((serviceForm) => (
                <div
                  key={`${item._id}-${serviceForm.serviceId}`}
                  style={{
                    border: "1px solid #d4e2f2",
                    borderRadius: "12px",
                    padding: "0.75rem",
                    background: "#f9fcff",
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

                      if (field.fieldType === "long_text") {
                        return (
                          <div key={`${item._id}-${serviceForm.serviceId}-${field.question}`}>
                            <label className="label">{labelText}</label>
                            <textarea
                              className="input"
                              rows={5}
                              value={answer.value}
                              onChange={(e) =>
                                onAnswerChange(item._id, serviceForm.serviceId, field.question, {
                                  ...answer,
                                  value: e.target.value,
                                })
                              }
                              style={{ minHeight: "120px", resize: "vertical" }}
                              required={field.required}
                            />
                          </div>
                        );
                      }

                      if (field.fieldType === "file") {
                        return (
                          <div key={`${item._id}-${serviceForm.serviceId}-${field.question}`}>
                            <label className="label">{labelText}</label>
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
                            <p style={{ margin: "0.35rem 0 0", color: "#4e6f90", fontSize: "0.86rem" }}>
                              PDF, JPG, PNG only. Maximum size 5MB.
                            </p>
                            {answer.fileData ? (
                              <div style={{ marginTop: "0.35rem", fontSize: "0.88rem" }}>
                                <a href={answer.fileData} target="_blank" rel="noreferrer" style={{ color: "#1f5ea2", fontWeight: 700 }}>
                                  {answer.fileName || "View uploaded file"}
                                </a>
                                {answer.fileSize ? ` (${formatFileSize(answer.fileSize)})` : ""}
                              </div>
                            ) : null}
                          </div>
                        );
                      }

                      return (
                        <div
                          key={`${item._id}-${serviceForm.serviceId}-${field.question}`}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "minmax(210px, 1fr) minmax(260px, 2fr)",
                            gap: "0.7rem",
                            alignItems: "center",
                          }}
                        >
                          <label className="label" style={{ marginBottom: 0 }}>
                            {labelText}
                          </label>
                          <input
                            className="input"
                            type={field.fieldType === "number" ? "number" : "text"}
                            value={answer.value}
                            onChange={(e) =>
                              onAnswerChange(item._id, serviceForm.serviceId, field.question, {
                                ...answer,
                                value: e.target.value,
                              })
                            }
                            required={field.required}
                          />
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
          </BlockCard>
        ))}
      </section>
    </PortalFrame>
  );
}
