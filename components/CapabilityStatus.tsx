"use client";

import { useEffect, useState } from "react";

import type { CapabilityHealth } from "@/lib/health";

export function CapabilityStatus() {
  const [health, setHealth] =
    useState<CapabilityHealth | null>(null);

  useEffect(() => {
    let active = true;

    void fetch("/api/health", {
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("health request failed");
        }
        return (await response.json()) as CapabilityHealth;
      })
      .then((payload) => {
        if (active) {
          setHealth(payload);
        }
      })
      .catch(() => {
        if (active) {
          setHealth(null);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  if (!health) {
    return (
      <div className="capabilityStatus">
        <span className="eyebrow">System</span>
        <span className="capability unknown">
          Status unavailable
        </span>
      </div>
    );
  }

  const readinessLabel = health.readiness.fullReady
    ? "Full"
    : health.readiness.coreReady
      ? "Core"
      : "Blocked";

  const rows = [
    {
      label: "Tutor model",
      ready: health.model.configured,
      detail:
        health.model.mode === "mock"
          ? "Mock"
          : health.model.mode === "self-hosted"
            ? "Configured"
            : "Missing",
    },
    {
      label: "Study sources",
      ready: health.retrieval.configured,
      detail: health.retrieval.configured
        ? "Configured"
        : "Not configured",
    },
    {
      label: "Embeddings",
      ready: health.embeddings.configured,
      detail: health.embeddings.configured
        ? "Configured"
        : "Lexical only",
    },
    {
      label: "Progress",
      ready: health.progress.configured,
      detail: health.progress.configured
        ? "Configured"
        : "Not configured",
    },
  ];

  return (
    <section className="capabilityStatus">
      <div className="capabilityHeader">
        <span className="eyebrow">System</span>
        <span
          className={
            health.readiness.coreReady
              ? "readinessBadge ready"
              : "readinessBadge"
          }
        >
          {readinessLabel}
        </span>
      </div>
      {rows.map((row) => (
        <div className="capability" key={row.label}>
          <span
            className={
              row.ready
                ? "capabilityDot ready"
                : "capabilityDot"
            }
          />
          <span>{row.label}</span>
          <b>{row.detail}</b>
        </div>
      ))}
      {!health.readiness.coreReady ? (
        <p className="readinessDetail">
          Missing: {health.readiness.blockers.join(", ")}
        </p>
      ) : !health.readiness.fullReady ? (
        <p className="readinessDetail">
          Core tutor ready · embeddings optional but recommended
        </p>
      ) : (
        <p className="readinessDetail">
          Private tutor configuration complete
        </p>
      )}
    </section>
  );
}
