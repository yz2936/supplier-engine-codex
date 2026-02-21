import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stainless Logic",
  description: "AI-driven RFQ sidecar assistant for stainless steel distributors"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
