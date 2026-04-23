"use client";

import Link from "next/link";
import { ArrowRight, Compass } from "lucide-react";
import { PortalFrame } from "@/components/dashboard/PortalFrame";
import { BlockCard, BlockTitle } from "@/components/ui/blocks";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { usePortalSession } from "@/lib/hooks/usePortalSession";

export default function TeamPage() {
  const { me, loading, logout } = usePortalSession();

  if (loading || !me) {
    return (
      <LoadingScreen
        title="Loading workspace..."
        subtitle="Preparing candidate guidance"
      />
    );
  }

  return (
    <PortalFrame
      me={me}
      onLogout={logout}
      title="Candidate Guidance"
      subtitle="Use the focused candidate workflow to finish verification quickly."
    >
      <BlockCard interactive>
        <BlockTitle
          icon={<Compass size={14} />}
          title="Recommended Flow"
          subtitle="Move through these steps for the fastest verification turnaround."
        />
        <ol className="flow-list">
          <li>Open Forms and complete every required service question.</li>
          <li>Submit the form to move your request into admin review.</li>
          <li>Track approval or rejection updates from History.</li>
          <li>Use Profile to keep your details updated and rotate your password regularly.</li>
        </ol>

        <Link href="/dashboard/orders" className="quick-action-link" style={{ marginTop: "0.8rem", display: "inline-flex" }}>
          Open Forms
          <ArrowRight size={14} />
        </Link>
      </BlockCard>
    </PortalFrame>
  );
}
