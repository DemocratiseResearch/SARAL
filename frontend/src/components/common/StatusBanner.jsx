// src/components/common/StatusBanner.jsx
import React, { useEffect, useState, useRef } from "react";
import Analytics from "../../lib/analytics";

const HEALTH_CHECK_URL = import.meta.env.VITE_APP_API_URL || "http://localhost:8000/";

function useBackendStatus(intervalMs = 30000) {
  const [isBackendUp, setIsBackendUp] = useState(true);
  const firstCheckDone = useRef(false);
  const lastStatus = useRef(true);

  useEffect(() => {
    async function check() {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

        const res = await fetch(HEALTH_CHECK_URL + "/health", {
          method: "GET",
          signal: controller.signal,
        });

        clearTimeout(timeout);

        const up = res.ok;

        // track changes only
        if (!firstCheckDone.current) {
          firstCheckDone.current = true;
          Analytics.track("FE HealthCheck Initial", {
            backend_up: up,
          });
        } else if (lastStatus.current !== up) {
          Analytics.track("FE HealthCheck StatusChanged", {
            previous: lastStatus.current,
            current: up,
          });
        }

        lastStatus.current = up;
        setIsBackendUp(up);
      } catch (err) {
        // network failure, DNS, timeout
        if (!firstCheckDone.current) {
          firstCheckDone.current = true;
          Analytics.track("FE HealthCheck Initial", {
            backend_up: false,
            error: err.message,
          });
        } else if (lastStatus.current === true) {
          Analytics.track("FE HealthCheck StatusChanged", {
            previous: true,
            current: false,
            error: err.message,
          });
        }

        lastStatus.current = false;
        setIsBackendUp(false);
      }
    }

    check(); // initial
    const id = setInterval(check, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return isBackendUp;
}

export default function StatusBanner() {
  const isBackendUp = useBackendStatus();

  if (isBackendUp) return null;

  return (
    <div
      style={{
        padding: "10px",
        background: "black",
        textAlign: "center",
        color: "white",
        fontWeight: "600",
      }}
    >
      ⚠️ Saral is currently undergoing updates. Please expect delays in response times. We apologize for the inconvenience.
    </div>
  );
}
