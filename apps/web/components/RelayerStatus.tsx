"use client";

import { useEffect, useState } from "react";
import { api, type Health } from "@/lib/api";

/**
 * What the relayer cannot do right now.
 *
 * Shown rather than hidden: an order built while the price cannot be attested
 * is still an order the vault will refuse to call verified, and it is better
 * to know that before scanning it.
 */
export function RelayerStatus() {
  const [health, setHealth] = useState<Health | null>(null);
  const [down, setDown] = useState(false);

  useEffect(() => {
    api
      .health()
      .then(setHealth)
      .catch(() => setDown(true));
  }, []);

  if (down) {
    return (
      <p className="alert-inline" role="status">
        The relayer is not answering, so no live price or order can be built.
      </p>
    );
  }

  if (!health || health.missing.length === 0) return null;

  return (
    <div className="notice">
      <h3>This build is incomplete</h3>
      <ul className="muted" style={{ margin: 0, paddingLeft: 18 }}>
        {health.missing.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
