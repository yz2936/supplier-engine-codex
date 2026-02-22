"use client";

import { useState } from "react";

export function InventoryUploader({ onUploaded }: { onUploaded: () => void }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string>("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const upload = async (file: File) => {
    setLoading(true);
    setMessage("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/inventory/upload", { credentials: "include", method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Upload failed");
      setMessage(`Uploaded ${json.count} inventory rows`);
      onUploaded();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="panel panel-aurora space-y-2">
      <div className="font-semibold">Inventory Upload (CSV / Excel)</div>
      <input
        type="file"
        accept=".csv,.xlsx,.xls"
        className="input"
        onChange={(e) => {
          const f = e.target.files?.[0];
          setSelectedFile(f ?? null);
          setMessage(f ? `Selected: ${f.name}` : "");
        }}
      />
      <button
        className="btn"
        disabled={loading || !selectedFile}
        onClick={async () => {
          if (!selectedFile) return;
          await upload(selectedFile);
        }}
      >
        {loading ? "Uploading..." : "Upload Inventory"}
      </button>
      <p className="text-xs text-steel-700">Supports flexible headers (e.g. item code, alloy, dimensions, OD/NB, schedule, qty on hand, unit price) in CSV/XLSX.</p>
      {message && <p className="text-sm">{message}</p>}
    </div>
  );
}
