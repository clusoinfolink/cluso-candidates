"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  FileSignature,
  ListChecks,
  ShieldAlert,
  SlidersHorizontal,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { PortalFrame } from "@/components/dashboard/PortalFrame";
import { BlockCard, BlockTitle } from "@/components/ui/blocks";
import { usePortalSession } from "@/lib/hooks/usePortalSession";
import { useRequestsData } from "@/lib/hooks/useRequestsData";

type CountCard = {
  label: string;
  value: number;
  tone: string;
  icon: LucideIcon;
};

export default function DashboardOverviewPage() {
  const { me, loading, logout } = usePortalSession();
  const { items, loading: requestsLoading, refreshRequests } = useRequestsData();
  const [requestsReady, setRequestsReady] = useState(false);

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

  if (loading || requestsLoading || !me || !requestsReady) {
    return (
      <main className="portal-shell">
        <BlockCard tone="muted">
          <p className="block-subtitle">Loading your workspace...</p>
        </BlockCard>
      </main>
    );
  }

  const pendingFormsCount = items.filter((item) => item.candidateFormStatus === "pending").length;
  const inReviewCount = items.filter(
    (item) => item.candidateFormStatus === "submitted" && item.status === "pending",
  ).length;
  const approvedCount = items.filter((item) => item.status === "approved").length;
  const rejectedCount = items.filter((item) => item.status === "rejected").length;
  const cards: CountCard[] = [
    { label: "Pending Forms", value: pendingFormsCount, tone: "portal-stat-sky", icon: FileSignature },
    { label: "In Review", value: inReviewCount, tone: "portal-stat-amber", icon: Clock3 },
    { label: "Verified", value: approvedCount, tone: "portal-stat-emerald", icon: CheckCircle2 },
    { label: "Needs Update", value: rejectedCount, tone: "portal-stat-rose", icon: TriangleAlert },
  ];
  const recentItems = [...items]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  return (
    <PortalFrame
      me={me}
      onLogout={logout}
      title="Candidate Overview"
      subtitle="Complete pending forms fast and monitor what is in admin review."
    >
      {rejectedCount > 0 ? (
        <p className="inline-alert inline-alert-warning">
          {rejectedCount} verification{rejectedCount > 1 ? "s" : ""} need updates. Open History for admin notes.
        </p>
      ) : null}

      <section className="portal-stats-grid" aria-label="Request overview">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <article key={card.label} className={`portal-stat ${card.tone}`}>
              <div className="portal-stat-head">
                <p className="portal-stat-value">{card.value}</p>
                <span className="portal-stat-icon" aria-hidden="true">
                  <Icon size={18} />
                </span>
              </div>
              <p className="portal-stat-label">{card.label}</p>
            </article>
          );
        })}
      </section>

      <section className="quick-actions-grid" aria-label="Quick actions">
        <Link href="/dashboard/orders" className="quick-action-card" aria-label="Go to forms">
          <div className="quick-action-head">
            <span className="icon-chip" aria-hidden="true">
              <FileSignature size={14} />
            </span>
            <strong>Complete Forms</strong>
          </div>
          <p className="block-subtitle">Fill service forms assigned to your email and submit to admin.</p>
          <span className="quick-action-link">
            Open Forms
            <ArrowRight size={14} />
          </span>
        </Link>

        <Link href="/dashboard/requests" className="quick-action-card" aria-label="Go to history">
          <div className="quick-action-head">
            <span className="icon-chip" aria-hidden="true">
              <ListChecks size={14} />
            </span>
            <strong>Track Verification History</strong>
          </div>
          <p className="block-subtitle">See which submissions are pending review, approved, or rejected.</p>
          <span className="quick-action-link">
            Open History
            <ArrowRight size={14} />
          </span>
        </Link>

        <Link href="/dashboard/settings" className="quick-action-card" aria-label="Go to settings">
          <div className="quick-action-head">
            <span className="icon-chip" aria-hidden="true">
              <SlidersHorizontal size={14} />
            </span>
            <strong>Security Settings</strong>
          </div>
          <p className="block-subtitle">Change your password to keep your account secure.</p>
          <span className="quick-action-link">
            Open Settings
            <ArrowRight size={14} />
          </span>
        </Link>
      </section>

      <BlockCard interactive>
        <BlockTitle
          icon={<ShieldAlert size={14} />}
          title="Latest Verification Activity"
          subtitle="Recent candidate tasks and current review state."
        />

        {recentItems.length === 0 ? (
          <p className="block-subtitle">No assigned requests yet. You will see them here when available.</p>
        ) : (
          <div className="recent-request-list">
            {recentItems.map((item) => (
              <article key={item._id} className="recent-request-item">
                <div>
                  <strong>{item.customerName}</strong>
                  <p className="block-subtitle recent-request-meta">{item.selectedServices.map((service) => service.serviceName).join(", ") || "No services"}</p>
                </div>
                <div className="recent-request-right">
                  <span className={`status-pill status-pill-${item.status}`} style={{ textTransform: "capitalize" }}>
                    {item.candidateFormStatus === "pending" ? "form pending" : item.status}
                  </span>
                  <span className="recent-request-meta">{new Date(item.createdAt).toLocaleDateString()}</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </BlockCard>
    </PortalFrame>
  );
}
