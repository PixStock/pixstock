"use client";

import { useEffect, useState } from "react";
import { api, RelayerError, type VaultBalance, type VaultOrder } from "@/lib/api";
import { usePairedVault } from "@/lib/vault";

/**
 * What the paired vault holds, and what it has been asked to sign.
 *
 * Watch-only, and derived rather than looked up: the relayer computes the
 * addresses a vault would own from the same table the phone uses offline.
 * Being told "this is your token account" is exactly what an attacker would
 * say.
 */
export function VaultBalances() {
  const { vault, isValid } = usePairedVault();
  const [balances, setBalances] = useState<VaultBalance[] | null>(null);
  const [orders, setOrders] = useState<VaultOrder[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isValid) return;

    let live = true;
    api
      .vault(vault)
      .then((result) => {
        if (!live) return;
        setBalances(result.balances);
        setOrders(result.orders);
        setError(null);
      })
      .catch((err: RelayerError) => live && setError(err.message));

    return () => {
      live = false;
    };
  }, [vault, isValid]);

  if (!isValid) return null;

  if (error) {
    return (
      <p className="alert-inline" role="alert">
        {error}
      </p>
    );
  }

  if (!balances) return <p className="muted">Reading the chain…</p>;

  // An account that does not exist yet is not a zero balance to hide: it is
  // the reason the relayer will pay rent on the first buy.
  const held = balances.filter((balance) => balance.exists);

  return (
    <div className="stack-24">
      <div>
        <span className="eyebrow">Holdings</span>
        {held.length === 0 ? (
          <p className="copy">
            No token accounts yet. The first order creates them, and the relayer pays their rent,
            which is why this vault can hold 0.00 SOL.
          </p>
        ) : (
          <dl style={{ margin: 0, display: "grid", gap: 6 }}>
            {held.map((balance) => (
              <div key={balance.mint} className="quote-row">
                <dt>
                  {balance.symbol}
                  {balance.frozen && <span className="alert-inline"> frozen by the issuer</span>}
                </dt>
                <dd className="num">
                  {balance.amount.toLocaleString(undefined, {
                    maximumFractionDigits: balance.decimals,
                  })}
                  {balance.multiplier !== 1 && (
                    <span className="muted"> ×{balance.multiplier} applied</span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      {orders.length > 0 && (
        <div>
          <span className="eyebrow">Recent orders</span>
          <dl style={{ margin: 0, display: "grid", gap: 6 }}>
            {orders.slice(0, 5).map((order) => (
              <div key={order.orderId} className="quote-row">
                <dt>
                  {order.kind} · {new Date(order.createdAt).toLocaleString()}
                </dt>
                <dd>{order.status}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}
