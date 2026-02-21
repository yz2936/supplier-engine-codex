"use client";

import { UserRole } from "@/lib/types";

export function RolePicker({ role, onChange }: { role: UserRole; onChange: (r: UserRole) => void }) {
  return (
    <div className="panel panel-aurora flex items-center gap-3">
      <label className="text-sm font-medium">Role</label>
      <select className="input max-w-56" value={role} onChange={(e) => onChange(e.target.value as UserRole)}>
        <option value="sales_rep">Sales Representative</option>
        <option value="inventory_manager">Inventory Manager</option>
        <option value="sales_manager">Sales Manager</option>
      </select>
    </div>
  );
}
