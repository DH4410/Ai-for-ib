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
      label: "Progress",
      ready: health.progress.configured,
      detail: health.progress.configured
        ? "Configured"
        : "Not configured",
    },
  ];

  return (
    <section className="capabilityStatus">
      <span className="eyebrow">System</span>
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
    </section>
  );
}
