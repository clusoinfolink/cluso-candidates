"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { ListChecks, Search } from "lucide-react";
import { PortalFrame } from "@/components/dashboard/PortalFrame";
import { BlockCard, BlockTitle } from "@/components/ui/blocks";
import { usePortalSession } from "@/lib/hooks/usePortalSession";
import { useRequestsData } from "@/lib/hooks/useRequestsData";

function RequestsPageContent() {
  const { me, loading, logout } = usePortalSession();
  const searchParams = useSearchParams();
  const { items, loading: requestsLoading, refreshRequests } = useRequestsData();
  const [requestsReady, setRequestsReady] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [highlightedRequestId, setHighlightedRequestId] = useState("");
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

  const normalizedSearch = searchText.trim().toLowerCase();

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (!normalizedSearch) {
        return true;
      }

      const haystack = [
        item.customerName,
        item.customerEmail,
        item.status,
        item.candidateFormStatus,
        item.rejectionNote,
        item.selectedServices.map((service) => service.serviceName).join(" "),
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedSearch);
    });
  }, [items, normalizedSearch]);

  useEffect(() => {
    if (!focusRequestId || items.length === 0) {
      return;
    }

    const targetRequest = items.find((item) => item._id === focusRequestId);
    if (!targetRequest) {
      return;
    }

    const stateUpdateTimer = window.setTimeout(() => {
      setSearchText("");
      setHighlightedRequestId(focusRequestId);
    }, 0);

    const scrollTimer = window.setTimeout(() => {
      document.getElementById(`request-${focusRequestId}`)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 60);

    return () => {
      window.clearTimeout(stateUpdateTimer);
      window.clearTimeout(scrollTimer);
    };
  }, [focusRequestId, items]);

  if (loading || requestsLoading || !me || !requestsReady) {
    return (
      <main className="portal-shell">
        <BlockCard tone="muted">
          <p className="block-subtitle">Loading request history...</p>
        </BlockCard>
      </main>
    );
  }

  return (
    <PortalFrame
      me={me}
      onLogout={logout}
      title="Verification History"
      subtitle="Review submitted forms, admin decisions, and service-level answers."
    >
      <BlockCard className="request-toolbar" interactive>
        <BlockTitle
          icon={<ListChecks size={14} />}
          title="Request Timeline"
          subtitle="Track pending, approved, and rejected verification updates."
          action={<span className="neo-badge">Candidate view</span>}
        />

        <div className="search-input-wrap">
          <label className="sr-only" htmlFor="history-search">
            Search requests
          </label>
          <span className="search-input-icon" aria-hidden="true">
            <Search size={18} />
          </span>
          <input
            id="history-search"
            className="input"
            placeholder="Search by company, service, status, or admin note"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </div>
      </BlockCard>

      {filteredItems.length === 0 ? (
        <BlockCard tone="muted" interactive>
          <p className="block-subtitle">No requests match your search.</p>
        </BlockCard>
      ) : (
        <section className="request-square-grid">
          {filteredItems.map((item) => (
            <BlockCard
              as="article"
              key={item._id}
              id={`request-${item._id}`}
              interactive
              style={
                highlightedRequestId === item._id
                  ? { outline: "2px solid #4A90E2", outlineOffset: "2px" }
                  : undefined
              }
            >
              <div className="block-title-row">
                <h3 className="block-title" style={{ margin: 0 }}>
                  {item.customerName}
                </h3>
                <span className={`status-pill status-pill-${item.status}`} style={{ textTransform: "capitalize" }}>
                  {item.candidateFormStatus === "pending" ? "form pending" : item.status}
                </span>
              </div>

              <p className="block-subtitle" style={{ marginTop: "0.35rem" }}>
                Services: {item.selectedServices.map((service) => service.serviceName).join(", ") || "-"}
              </p>

              <div className="request-accordion-details" style={{ marginTop: "0.65rem" }}>
                <div className="request-square-label">Company Email</div>
                <div className="request-square-value">{item.customerEmail}</div>

                <div className="request-square-label">Created</div>
                <div className="request-square-value">{new Date(item.createdAt).toLocaleString()}</div>

                <div className="request-square-label">Submitted To Admin</div>
                <div className="request-square-value">
                  {item.candidateSubmittedAt
                    ? new Date(item.candidateSubmittedAt).toLocaleString()
                    : "Pending form completion"}
                </div>

                <div className="request-square-label">Admin Note</div>
                <div className="request-square-value" style={{ display: "grid", gap: "0.45rem" }}>
                  <span>{item.rejectionNote || "-"}</span>
                  {item.status === "rejected" && item.candidateFormStatus === "pending" ? (
                    <Link
                      href={`/dashboard/orders?requestId=${encodeURIComponent(item._id)}`}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: "fit-content",
                        border: "1px solid #F5C2C7",
                        borderRadius: "8px",
                        padding: "0.3rem 0.55rem",
                        background: "#FFF1F2",
                        color: "#9F1239",
                        fontWeight: 700,
                        textDecoration: "none",
                        fontSize: "0.8rem",
                      }}
                    >
                      Edit and Resubmit
                    </Link>
                  ) : null}
                </div>

                <div className="request-square-label">Submitted Answers</div>
                <div className="request-square-value" style={{ display: "grid", gap: "0.35rem" }}>
                  {item.candidateFormResponses.length === 0 ? (
                    <span>-</span>
                  ) : (
                    item.candidateFormResponses.map((serviceResponse) => (
                      <div
                        key={`${item._id}-${serviceResponse.serviceId}`}
                        style={{
                          border: "1px solid #E0E0E0",
                          borderRadius: "10px",
                          padding: "0.55rem 0.65rem",
                          background: "#F8F9FA",
                        }}
                      >
                        <strong>{serviceResponse.serviceName}</strong>
                        <div style={{ marginTop: "0.35rem", display: "grid", gap: "0.3rem" }}>
                          {serviceResponse.answers.map((answer, index) => (
                            <div key={`${serviceResponse.serviceId}-${index}`}>
                              <span style={{ fontWeight: 600 }}>{answer.question}:</span>{" "}
                              {answer.fieldType === "file" && answer.fileData ? (
                                <a
                                  href={answer.fileData}
                                  target="_blank"
                                  rel="noreferrer"
                                  style={{ color: "#4A90E2", fontWeight: 700 }}
                                >
                                  {answer.fileName || "Open attachment"}
                                </a>
                              ) : (
                                answer.value || "-"
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </BlockCard>
          ))}
        </section>
      )}
    </PortalFrame>
  );
}

export default function RequestsPage() {
  return (
    <Suspense
      fallback={
        <main className="portal-shell">
          <BlockCard tone="muted">
            <p className="block-subtitle">Loading request history...</p>
          </BlockCard>
        </main>
      }
    >
      <RequestsPageContent />
    </Suspense>
  );
}
