"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  FileSignature,
  ListChecks,
  SlidersHorizontal,
  FileText,
  Clock3,
  CheckCircle2,
  TriangleAlert
} from "lucide-react";
import { PortalFrame } from "@/components/dashboard/PortalFrame";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { usePortalSession } from "@/lib/hooks/usePortalSession";
import { useRequestsData } from "@/lib/hooks/useRequestsData";

export default function DashboardOverviewPage() {
  const { me, loading, logout } = usePortalSession();
  const { items, loading: requestsLoading, refreshRequests } = useRequestsData();
  const [requestsReady, setRequestsReady] = useState(false);

  useEffect(() => {
    if (!me) return;
    let active = true;
    (async () => {
      await refreshRequests(false);
      if (active) setRequestsReady(true);
    })();
    return () => { active = false; };
  }, [me, refreshRequests]);

  if (loading || requestsLoading || !me || !requestsReady) {
    return (
      <LoadingScreen
        title="Loading workspace..."
        subtitle="Preparing your dashboard overview"
      />
    );
  }

  const pendingFormsCount = items.filter((item) => item.candidateFormStatus === "pending").length;
  const inReviewCount = items.filter((item) => item.candidateFormStatus === "submitted" && item.status === "pending").length;
  const verifiedCount = items.filter((item) => item.status === "verified").length;
  const rejectedCount = items.filter((item) => item.status === "rejected").length;
  
  const recentItems = [...items]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  return (
    <PortalFrame me={me} onLogout={logout} title="" subtitle="">
      
      {rejectedCount > 0 && (
        <div className="inline-alert inline-alert-warning">
          {rejectedCount} verification{rejectedCount > 1 ? "s" : ""} need updates. Open History for admin notes.
        </div>
      )}

      <div className="dashboard-header">
        <h2>Dashboard</h2>
        <div className="top-actions">
          <Link href="/dashboard/orders" className="btn btn-green">Forms to fill</Link>
          <Link href="/dashboard/requests" className="btn btn-blue">History</Link>
        </div>
      </div>

      <div className="portal-stats-grid">
        <Link href="/dashboard/orders" className="portal-stat portal-stat-sky">
          <div className="portal-stat-icon-wrap">
            <FileText size={24} />
          </div>
          <div className="portal-stat-info">
            <span className="portal-stat-value">{pendingFormsCount}</span>
            <span className="portal-stat-label">Pending Forms</span>
          </div>
        </Link>

        <Link href="/dashboard/requests" className="portal-stat portal-stat-amber">
          <div className="portal-stat-icon-wrap">
            <Clock3 size={24} />
          </div>
          <div className="portal-stat-info">
            <span className="portal-stat-value">{inReviewCount}</span>
            <span className="portal-stat-label">In Review</span>
          </div>
        </Link>
        
        <Link href="/dashboard/requests" className="portal-stat portal-stat-emerald">
          <div className="portal-stat-icon-wrap">
            <CheckCircle2 size={24} />
          </div>
          <div className="portal-stat-info">
            <span className="portal-stat-value">{verifiedCount}</span>
            <span className="portal-stat-label">Verified</span>
          </div>
        </Link>

        <Link href="/dashboard/requests" className="portal-stat portal-stat-rose">
          <div className="portal-stat-icon-wrap">
            <TriangleAlert size={24} />
          </div>
          <div className="portal-stat-info">
            <span className="portal-stat-value">{rejectedCount}</span>
            <span className="portal-stat-label">Needs Update</span>
          </div>
        </Link>
      </div>

      <div className="quick-actions-section">
        <h3>Quick Actions</h3>
        <div className="quick-actions-grid">
          <Link href="/dashboard/orders" className="quick-action-card">
            <FileSignature size={28} />
            <span>Complete Forms</span>
          </Link>
          <Link href="/dashboard/requests" className="quick-action-card">
            <ListChecks size={28} />
            <span>Track Verification</span>
          </Link>
          <Link href="/dashboard/profile" className="quick-action-card">
            <SlidersHorizontal size={28} />
            <span>Profile</span>
          </Link>
        </div>
      </div>

      <div className="block-card">
        <h3 className="block-title">Latest Verification Activity</h3>
        <p className="block-subtitle">Recent candidate tasks and current review state.</p>
        
        {recentItems.length === 0 ? (
          <p>No assigned requests yet.</p>
        ) : (
          <div className="recent-request-list">
            {recentItems.map((item) => (
              <div key={item._id} className="recent-request-item">
                <div>
                  <strong>{item.customerName}</strong>
                  <span className="recent-request-meta">
                    {item.selectedServices.map((service) => service.serviceName).join(", ") || "No services"}
                  </span>
                </div>
                <div className="recent-request-right">
                  <span className={`status-pill status-pill-${item.status}`}>
                    {item.candidateFormStatus === "pending"
                      ? "form pending"
                      : item.status === "approved"
                        ? "approved by enterprise"
                        : item.status}
                  </span>
                  <span className="recent-request-meta">
                    {new Date(item.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </PortalFrame>
  );
}
