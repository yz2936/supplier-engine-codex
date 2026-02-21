import { UserRole } from "@/lib/types";

export const canUploadInventory = (role: UserRole) => role === "inventory_manager" || role === "sales_manager";
export const canGenerateQuotes = (role: UserRole) => role === "sales_rep" || role === "sales_manager";
export const canViewAllQuotes = (role: UserRole) => role === "sales_manager";

export const roleLabel = (role: UserRole) => {
  if (role === "sales_rep") return "Sales Representative";
  if (role === "inventory_manager") return "Inventory Manager";
  return "Sales Manager";
};
