"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { ListChecks, Search } from "lucide-react";
import { PortalFrame } from "@/components/dashboard/PortalFrame";
import { BlockCard } from "@/components/ui/blocks";
import { formatRequestedHistoryWindow } from "@/lib/history";
import { usePortalSession } from "@/lib/hooks/usePortalSession";
import { useRequestsData } from "@/lib/hooks/useRequestsData";
import { RequestItem } from "@/lib/types";

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

function dedupeDisplayValues(values: string[]) {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const value of values) {
    const normalized = value.trim().toLowerCase().replace(/\s+/g, " ");
    if (!normalized) {
      continue;
    }
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    deduped.push(value.trim());
  }

  return deduped;
}

function formatServiceLabelWithHistory(service: RequestItem["selectedServices"][number]) {
  const historyWindow = formatRequestedHistoryWindow(service.yearsOfChecking);
  if (!historyWindow) {
    return service.serviceName;
  }

  return `${service.serviceName} ${historyWindow}`;
}

const PERSONAL_DETAILS_SERVICE_NAME = "personal details";

function isPersonalDetailsServiceName(serviceName: string) {
  const normalizedServiceName = serviceName.trim().toLowerCase();
  return (
    normalizedServiceName === PERSONAL_DETAILS_SERVICE_NAME ||
    normalizedServiceName.includes("personal detail")
  );
}

type CandidateServiceResponse = RequestItem["candidateFormResponses"][number];

function sortCandidateResponsesForDisplay(
  responses: CandidateServiceResponse[],
) {
  return responses
    .map((serviceResponse, index) => ({
      serviceResponse,
      index,
      isPersonalDetailsService: isPersonalDetailsServiceName(
        serviceResponse.serviceName,
      ),
    }))
    .sort((left, right) => {
      if (left.isPersonalDetailsService === right.isPersonalDetailsService) {
        return left.index - right.index;
      }

      return left.isPersonalDetailsService ? -1 : 1;
    })
    .map((entry) => entry.serviceResponse);
}

function formatServiceInstanceName(serviceName: string, entryIndex: number, entryCount: number) {
  const trimmedName = serviceName.trim() || "Service";
  if (entryCount <= 1) {
    return trimmedName;
  }

  const suffix = ` ${entryIndex}`;
  if (trimmedName.endsWith(suffix)) {
    return trimmedName;
  }

  return `${trimmedName}${suffix}`;
}

function normalizeServiceNameForGrouping(serviceName: string) {
  return serviceName.trim().toLowerCase().replace(/\s+/g, " ");
}

function buildServiceInstancesForHistory(
  serviceResponse: CandidateServiceResponse,
) {
  const entryCountFromResponse =
    typeof serviceResponse.serviceEntryCount === "number" &&
    Number.isFinite(serviceResponse.serviceEntryCount) &&
    serviceResponse.serviceEntryCount > 0
      ? Math.trunc(serviceResponse.serviceEntryCount)
      : 1;

  const repeatableMax = serviceResponse.answers.reduce((maxCount, answer) => {
    const values = parseRepeatableAnswerValues(answer.value, answer.repeatable);
    return Math.max(maxCount, values.length);
  }, 0);

  const entryFilesMax = serviceResponse.answers.reduce((maxCount, answer) => {
    const entryIndexes = (answer.entryFiles ?? [])
      .map((entry) =>
        typeof entry.entryIndex === "number" && Number.isFinite(entry.entryIndex)
          ? Math.trunc(entry.entryIndex)
          : 0,
      )
      .filter((entryIndex) => entryIndex > 0);

    return Math.max(maxCount, ...entryIndexes, 0);
  }, 0);

  const entryCount = Math.max(1, entryCountFromResponse, repeatableMax, entryFilesMax);

  return Array.from({ length: entryCount }, (_, idx) => {
    const entryIndex = idx + 1;
    return {
      serviceId: serviceResponse.serviceId,
      serviceName: formatServiceInstanceName(serviceResponse.serviceName, entryIndex, entryCount),
      serviceEntryIndex: entryIndex,
      serviceEntryCount: entryCount,
      answers: serviceResponse.answers.map((answer) => {
        const repeatableValues = parseRepeatableAnswerValues(answer.value, answer.repeatable);
        const resolvedValue =
          repeatableValues.length > 0 ? repeatableValues[entryIndex - 1] ?? "" : answer.value;

        const entryFile = (answer.entryFiles ?? []).find((entry) => entry.entryIndex === entryIndex);
        const resolvedFileData = entryFile?.fileData ?? answer.fileData;
        const resolvedFileName = entryFile?.fileName ?? answer.fileName;

        return {
          ...answer,
          value: resolvedValue,
          fileData: resolvedFileData,
          fileName: resolvedFileName,
        };
      }),
    };
  });
}

function annotateServiceInstancesForDisplay(
  instances: Array<{
    serviceId: string;
    serviceName: string;
    serviceEntryIndex: number;
    serviceEntryCount: number;
    answers: CandidateServiceResponse["answers"];
  }>,
) {
  const totalByName = new Map<string, number>();

  for (const instance of instances) {
    const nameKey = normalizeServiceNameForGrouping(instance.serviceName);
    totalByName.set(nameKey, (totalByName.get(nameKey) ?? 0) + 1);
  }

  const seenByName = new Map<string, number>();

  return instances.map((instance) => {
    const nameKey = normalizeServiceNameForGrouping(instance.serviceName);
    const totalForName = totalByName.get(nameKey) ?? 1;
    const seenCount = (seenByName.get(nameKey) ?? 0) + 1;
    seenByName.set(nameKey, seenCount);

    const displayServiceName =
      totalForName > 1 ? formatServiceInstanceName(instance.serviceName, seenCount, totalForName) : instance.serviceName;

    return {
      ...instance,
      displayServiceName,
    };
  });
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
        item.selectedServices.map((service) => formatServiceLabelWithHistory(service)).join(" "),
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
              <p className="text-sm text-gray-500 dark:text-gray-400">Track pending, enterprise decisions, and verified verification updates.</p>
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
            else if (currentStatus === "pending") statusBadge = "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400";

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
                          ? "approved by enterprise"
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
                        <div className="mt-1 grid gap-2">
                          {item.selectedServices.length === 0 ? (
                            <span className="font-medium text-gray-900 dark:text-white text-sm">-</span>
                          ) : (
                            item.selectedServices.map((service) => {
                              const historyWindow = formatRequestedHistoryWindow(
                                service.yearsOfChecking,
                              );

                              return (
                                <div
                                  key={`${item._id}-${service.serviceId}`}
                                  className="flex flex-wrap items-center gap-2"
                                >
                                  <span className="font-medium text-gray-900 dark:text-white text-sm">
                                    {service.serviceName}
                                  </span>
                                  {historyWindow ? (
                                    <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-300">
                                      Requested history: {historyWindow}
                                    </span>
                                  ) : null}
                                </div>
                              );
                            })
                          )}
                        </div>
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
                      {annotateServiceInstancesForDisplay(
                        sortCandidateResponsesForDisplay(item.candidateFormResponses).flatMap(
                          (serviceResponse) => buildServiceInstancesForHistory(serviceResponse),
                        ),
                      ).map((serviceResponse, serviceResponseIndex) => (
                        <div
                          key={`${item._id}-${serviceResponse.serviceId}-${serviceResponse.serviceEntryIndex ?? 1}-${serviceResponseIndex}`}
                          className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm rounded-lg overflow-hidden"
                        >
                          <div className="bg-gray-50 dark:bg-gray-900/50 px-4 py-3 border-b border-gray-200 dark:border-gray-700 font-semibold text-sm text-gray-900 dark:text-white">
                            {serviceResponse.displayServiceName}
                          </div>
                          <div className="px-4 py-3 space-y-3 divide-y divide-gray-100 dark:divide-gray-700/50">
                            {serviceResponse.answers.map((answer, index) => {
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
