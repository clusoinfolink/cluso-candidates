"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { ListChecks, Search } from "lucide-react";
import { PortalFrame } from "@/components/dashboard/PortalFrame";
import { BlockCard } from "@/components/ui/blocks";
import { usePortalSession } from "@/lib/hooks/usePortalSession";
import { useRequestsData } from "@/lib/hooks/useRequestsData";

function parseRepeatableAnswerValues(rawValue: string, repeatable?: boolean) {
  if (!repeatable) {
    return [];
  }

  const trimmedValue = rawValue.trim();
  if (!trimmedValue.startsWith("[")) {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmedValue);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
      .filter((entry) => entry.length > 0);
  } catch {
    return [];
  }
}

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
      <BlockCard className="mb-8 p-6 bg-white shadow-sm rounded-xl border border-gray-100 dark:bg-gray-800 dark:border-gray-700">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg dark:bg-blue-900/30 dark:text-blue-400">
              <ListChecks size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Request Timeline</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">Track pending, partner decisions, and verified verification updates.</p>
            </div>
          </div>
          <span className="px-3 py-1 text-xs font-semibold tracking-wider text-blue-700 uppercase bg-blue-100 rounded-full dark:bg-blue-900/30 dark:text-blue-400">Candidate View</span>
        </div>

        <div className="relative mt-2">
          <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-gray-400">
            <Search size={18} />
          </div>
          <input
            id="history-search"
            className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors dark:bg-gray-900 dark:border-gray-700 dark:text-white"
            placeholder="Search by company, service, status, or admin note..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </div>
      </BlockCard>

      {filteredItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 bg-gray-50 border border-dashed border-gray-200 rounded-xl dark:bg-gray-800/50 dark:border-gray-700">
          <div className="w-16 h-16 mb-4 flex items-center justify-center text-gray-400 bg-white rounded-full shadow-sm dark:bg-gray-800">
            <ListChecks size={32} />
          </div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">No requests found</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">There are no verification requests matching your search.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {filteredItems.map((item) => {
            const isHighlighted = highlightedRequestId === item._id;
            
            // Status colors
            let statusBadge = "bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-800 dark:text-gray-300";
            const currentStatus = item.candidateFormStatus === "pending" ? "pending" : item.status;
            
            if (currentStatus === "verified") statusBadge = "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-900/30 dark:text-teal-300";
            else if (currentStatus === "approved") statusBadge = "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400";
            else if (currentStatus === "rejected") statusBadge = "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400";
            else if (currentStatus === "pending" || currentStatus === "in-progress") statusBadge = "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400";

            return (
            <article
              key={item._id}
              id={`request-${item._id}`}
              className={`bg-white rounded-xl shadow-sm border overflow-hidden transition-all duration-200 dark:bg-gray-800 dark:border-gray-700 ${
                isHighlighted ? "ring-2 ring-blue-500 border-transparent shadow-md" : "hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600"
              }`}
            >
              <div className="border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/20 p-5 p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                      {item.customerName}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      {item.customerEmail}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold capitalize border ${statusBadge}`}>
                      {item.candidateFormStatus === "pending"
                        ? "form pending"
                        : item.status === "approved"
                          ? "approved by partner"
                          : item.status}
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="space-y-6">
                  <div>
                    <h4 className="text-xs font-bold tracking-wider text-gray-500 uppercase mb-2">Request Details</h4>
                    <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4 space-y-3">
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-500 dark:text-gray-400 text-sm">Created</span>
                        <span className="font-medium text-gray-900 dark:text-white text-sm">{new Date(item.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-500 dark:text-gray-400 text-sm">Submitted To Admin</span>
                        <span className="font-medium text-gray-900 dark:text-white text-sm">
                          {item.candidateSubmittedAt
                            ? new Date(item.candidateSubmittedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                            : <span className="text-amber-600 dark:text-amber-400 italic">Pending completion</span>}
                        </span>
                      </div>
                      <div className="flex flex-col gap-1 pt-2 mt-2 border-t border-gray-200 dark:border-gray-700 text-sm">
                        <span className="text-gray-500 dark:text-gray-400 text-sm">Required Services</span>
                        <span className="font-medium text-gray-900 dark:text-white text-sm">
                          {item.selectedServices.map((service) => service.serviceName).join(", ") || "-"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {(item.rejectionNote || (item.status === "rejected" && item.candidateFormStatus === "pending")) && (
                    <div>
                      <h4 className="text-xs font-bold tracking-wider text-gray-500 uppercase mb-2">Admin Feedback</h4>
                      <div className="bg-red-50 border border-red-100 dark:bg-red-900/10 dark:border-red-900/30 rounded-lg p-4">
                        <p className="text-sm text-red-800 dark:text-red-300 font-medium mb-3">{item.rejectionNote || "Revisions required."}</p>
                        
                        {item.status === "rejected" && item.candidateFormStatus === "pending" && (
                          <Link
                            href={`/dashboard/orders?requestId=${encodeURIComponent(item._id)}`}
                            className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] active:bg-red-800 shadow-sm hover:shadow-md transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                          >
                            Edit and Resubmit
                          </Link>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <h4 className="text-xs font-bold tracking-wider text-gray-500 uppercase mb-2">Submitted Answers</h4>
                  
                  {item.candidateFormResponses.length === 0 ? (
                    <div className="flex items-center justify-center h-32 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-dashed border-gray-200 dark:border-gray-700 text-sm text-gray-500">
                      No answers submitted yet
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {item.candidateFormResponses.map((serviceResponse) => (
                        <div
                          key={`${item._id}-${serviceResponse.serviceId}`}
                          className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm rounded-lg overflow-hidden"
                        >
                          <div className="bg-gray-50 dark:bg-gray-900/50 px-4 py-3 border-b border-gray-200 dark:border-gray-700 font-semibold text-sm text-gray-900 dark:text-white">
                            {serviceResponse.serviceName}
                          </div>
                          <div className="px-4 py-3 space-y-3 divide-y divide-gray-100 dark:divide-gray-700/50">
                            {serviceResponse.answers.map((answer, index) => {
                              const repeatableValues = parseRepeatableAnswerValues(
                                answer.value,
                                answer.repeatable,
                              );

                              return (
                                <div key={`${serviceResponse.serviceId}-${index}`} className="pt-3 first:pt-0">
                                  <span className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{answer.question}</span>
                                  <div className="text-sm text-gray-900 dark:text-gray-200 text-sm">
                                    {answer.fieldType === "file" && answer.fileData ? (
                                      <a
                                        href={answer.fileData}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
                                      >
                                        📄 {answer.fileName || "Open attachment"}
                                      </a>
                                    ) : repeatableValues.length > 0 ? (
                                      <ul className="list-disc pl-5 space-y-1">
                                        {repeatableValues.map((entry, entryIndex) => (
                                          <li
                                            key={`${serviceResponse.serviceId}-${index}-entry-${entryIndex}`}
                                            className="whitespace-pre-wrap break-words"
                                          >
                                            {entry}
                                          </li>
                                        ))}
                                      </ul>
                                    ) : (
                                      answer.value || <span className="text-gray-400 italic">No answer</span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </article>
            );
          })}
        </div>
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
