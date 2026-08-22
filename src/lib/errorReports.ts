import { list, put } from "@vercel/blob";
import { randomUUID } from "crypto";

export type ErrorReportStatus = "OPEN" | "ARCHIVED";

export type ErrorReportNote = {
  id: string;
  text: string;
  createdAt: string;
};

export type ErrorReport = {
  id: string;
  status: ErrorReportStatus;
  createdAt: string;
  updatedAt: string;
  time: string | null;
  url: string | null;
  title: string | null;
  queryParams: string | null;
  lastButtons: string[];
  userText: string;
  notes: ErrorReportNote[];
};

const BLOB_PATH = "error-reports.json";

async function readAll(): Promise<ErrorReport[]> {
  const { blobs } = await list({ prefix: BLOB_PATH });
  const blob = blobs.find((b) => b.pathname === BLOB_PATH);
  if (!blob) return [];

  const res = await fetch(blob.url, { cache: "no-store" });
  if (!res.ok) return [];

  const data = await res.json().catch(() => null);
  return Array.isArray(data) ? data : [];
}

async function writeAll(reports: ErrorReport[]): Promise<void> {
  await put(BLOB_PATH, JSON.stringify(reports, null, 2), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

export async function listReports(): Promise<ErrorReport[]> {
  const reports = await readAll();
  return reports.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export type CreateReportInput = {
  userText: string;
  time?: string;
  url?: string;
  title?: string;
  queryParams?: string;
  lastButtons?: string[];
};

export async function createReport(input: CreateReportInput): Promise<ErrorReport> {
  const now = new Date().toISOString();
  const report: ErrorReport = {
    id: randomUUID(),
    status: "OPEN",
    createdAt: now,
    updatedAt: now,
    time: input.time ? String(input.time).slice(0, 100) : null,
    url: input.url ? String(input.url).slice(0, 500) : null,
    title: input.title ? String(input.title).slice(0, 200) : null,
    queryParams: input.queryParams ? String(input.queryParams).slice(0, 500) : null,
    lastButtons: Array.isArray(input.lastButtons)
      ? input.lastButtons.slice(0, 5).map((s) => String(s).slice(0, 80))
      : [],
    userText: input.userText,
    notes: [],
  };

  const reports = await readAll();
  reports.push(report);
  await writeAll(reports);

  return report;
}

export async function setReportStatus(
  id: string,
  status: ErrorReportStatus
): Promise<ErrorReport | null> {
  const reports = await readAll();
  const report = reports.find((r) => r.id === id);
  if (!report) return null;

  report.status = status;
  report.updatedAt = new Date().toISOString();
  await writeAll(reports);

  return report;
}

export async function addReportNote(id: string, text: string): Promise<ErrorReport | null> {
  const reports = await readAll();
  const report = reports.find((r) => r.id === id);
  if (!report) return null;

  const now = new Date().toISOString();
  report.notes.push({ id: randomUUID(), text, createdAt: now });
  report.updatedAt = now;
  await writeAll(reports);

  return report;
}
