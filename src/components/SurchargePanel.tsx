"use client";

import { useState } from "react";

export function SurchargePanel({ onSaved }: { onSaved: () => void }) {
  const [grade, setGrade] = useState("304");
  const [valuePerLb, setValuePerLb] = useState(0);
  const [status, setStatus] = useState("");

  return (
    <div className="panel space-y-2">
      <div className="font-semibold">Monthly Surcharge</div>
      <div className="grid grid-cols-2 gap-2">
        <input className="input" value={grade} onChange={(e) => setGrade(e.target.value.toUpperCase())} placeholder="Grade" />
        <input
          className="input"
          type="number"
          step="0.001"
          value={valuePerLb}
          onChange={(e) => setValuePerLb(Number(e.target.value))}
          placeholder="Value / lb"
        />
      </div>
      <button
        className="btn"
        onClick={async () => {
          setStatus("Saving...");
          const res = await fetch("/api/surcharges", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ grade, valuePerLb })
          });
          setStatus(res.ok ? "Saved" : "Failed");
          if (res.ok) onSaved();
        }}
      >
        Save Surcharge
      </button>
      {status && <p className="text-sm">{status}</p>}
    </div>
  );
}
