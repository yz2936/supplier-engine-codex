"use client";

import * as XLSX from "xlsx";

const readableChunkPattern = /[A-Za-z0-9][A-Za-z0-9 ,.:;()/#%+\-_\n]{18,}/g;

const fallbackReadableText = async (file: File) => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const text = new TextDecoder("latin1").decode(bytes);
  const chunks = text.match(readableChunkPattern) || [];
  return chunks.join(" ").replace(/\s+/g, " ").trim().slice(0, 16000);
};

const isTextFile = (name: string) => {
  const lower = name.toLowerCase();
  return lower.endsWith(".txt")
    || lower.endsWith(".md")
    || lower.endsWith(".eml")
    || lower.endsWith(".rtf")
    || lower.endsWith(".json")
    || lower.endsWith(".xml")
    || lower.endsWith(".csv");
};

const isExcelFile = (name: string) => {
  const lower = name.toLowerCase();
  return lower.endsWith(".xlsx") || lower.endsWith(".xls") || lower.endsWith(".csv");
};

const isWordFile = (name: string) => {
  const lower = name.toLowerCase();
  return lower.endsWith(".doc") || lower.endsWith(".docx");
};

const extractExcelText = async (file: File) => {
  const name = file.name.toLowerCase();
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, name.endsWith(".csv") ? { type: "array", raw: false } : { type: "array" });
  const sections: string[] = [];
  let charBudget = 14000;

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, { header: 1, raw: false })
      .map((row) => row.map((cell) => String(cell ?? "").trim()).filter(Boolean).join(" | "))
      .filter(Boolean);
    if (rows.length) {
      const nextSection: string[] = [`[Sheet: ${sheetName}]`];
      charBudget -= nextSection[0].length;
      for (const row of rows.slice(0, 150)) {
        if (charBudget <= 0) break;
        nextSection.push(row);
        charBudget -= row.length;
      }
      sections.push(...nextSection);
    }
    if (charBudget <= 0) break;
  }

  return sections.join("\n").trim();
};

export const RFQ_FILE_ACCEPT = ".pdf,.xlsx,.xls,.csv,.doc,.docx,.txt,.md,.eml,.rtf,.json,.xml";

export const extractTextFromRfqFile = async (file: File) => {
  const lower = file.name.toLowerCase();

  if (isExcelFile(lower)) {
    const text = await extractExcelText(file);
    if (!text) throw new Error(`Could not read tabular content from ${file.name}`);
    return { text, kind: "excel" as const };
  }

  if (isTextFile(lower)) {
    const text = await file.text();
    if (!text.trim()) throw new Error(`No readable text found in ${file.name}`);
    return { text: text.trim(), kind: "text" as const };
  }

  if (lower.endsWith(".pdf") || isWordFile(lower)) {
    const text = await fallbackReadableText(file);
    if (!text.trim()) throw new Error(`No readable text found in ${file.name}`);
    return { text, kind: lower.endsWith(".pdf") ? "pdf" as const : "word" as const };
  }

  throw new Error(`Unsupported file type for ${file.name}`);
};
