/**
 * Google Sheets import service.
 *
 * Reads data from a Google Sheet shared with Nova's service account.
 * The merchant shares their sheet with the service account email,
 * then provides the sheet URL. No OAuth flow required.
 *
 * Authentication: Google Service Account (JWT)
 * - The service account key JSON is stored in GOOGLE_SERVICE_ACCOUNT_KEY env var
 * - The merchant shares their sheet with the service account email
 * - The service reads the sheet using the Google Sheets API v4
 *
 * Environment:
 *   GOOGLE_SERVICE_ACCOUNT_KEY — JSON string of the service account key file
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL — email of the service account (for display to merchants)
 */

import { google, sheets_v4 } from "googleapis";

// --- Types ---

export interface SheetPreview {
  spreadsheetId: string;
  spreadsheetTitle: string;
  sheets: {
    sheetId: number;
    title: string;
    rowCount: number;
    columnCount: number;
  }[];
}

export interface SheetData {
  sheetTitle: string;
  headers: string[];
  rows: Record<string, string>[];
  totalRows: number;
}

export interface ColumnMapping {
  sheetColumn: string;
  targetField: string;
}

// --- Service Account Auth ---

function getAuthClient() {
  const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!keyJson) {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_KEY environment variable is not set. " +
        "Configure it with the service account key JSON from Google Cloud Console.",
    );
  }

  let key: { client_email: string; private_key: string };
  try {
    key = JSON.parse(keyJson) as { client_email: string; private_key: string };
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY is not valid JSON.");
  }

  return new google.auth.JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
}

function getSheetsClient(): sheets_v4.Sheets {
  const auth = getAuthClient();
  return google.sheets({ version: "v4", auth });
}

// --- URL Parsing ---

/**
 * Extract the spreadsheet ID from a Google Sheets URL.
 * Supports formats:
 *   - https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit
 *   - https://docs.google.com/spreadsheets/d/SPREADSHEET_ID
 *   - Just the ID itself
 */
export function extractSpreadsheetId(urlOrId: string): string {
  const trimmed = urlOrId.trim();

  // Direct ID (no slashes, no dots)
  if (/^[a-zA-Z0-9_-]+$/.test(trimmed) && trimmed.length > 10) {
    return trimmed;
  }

  // URL format
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (match?.[1]) {
    return match[1];
  }

  throw new Error(
    "Invalid Google Sheets URL. Expected format: https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit",
  );
}

/**
 * Get the service account email for display to merchants.
 * They need to share their sheet with this email.
 */
export function getServiceAccountEmail(): string {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  if (email) return email;

  // Try to extract from the key JSON.
  const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (keyJson) {
    try {
      const key = JSON.parse(keyJson) as { client_email?: string };
      if (key.client_email) return key.client_email;
    } catch {
      // Fall through.
    }
  }

  return "not-configured@example.com";
}

// --- Sheet Operations ---

/**
 * Preview a Google Sheet: list all sheets with their dimensions.
 * Used to let the merchant choose which sheet to import from.
 */
export async function previewSpreadsheet(urlOrId: string): Promise<SheetPreview> {
  const spreadsheetId = extractSpreadsheetId(urlOrId);
  const sheets = getSheetsClient();

  const response = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "spreadsheetId,properties.title,sheets.properties",
  });

  const spreadsheet = response.data;

  return {
    spreadsheetId: spreadsheet.spreadsheetId ?? spreadsheetId,
    spreadsheetTitle: spreadsheet.properties?.title ?? "Untitled",
    sheets: (spreadsheet.sheets ?? []).map((s) => ({
      sheetId: s.properties?.sheetId ?? 0,
      title: s.properties?.title ?? "Sheet",
      rowCount: s.properties?.gridProperties?.rowCount ?? 0,
      columnCount: s.properties?.gridProperties?.columnCount ?? 0,
    })),
  };
}

/**
 * Read data from a specific sheet. Returns headers (first row) and
 * data rows as key-value objects keyed by header name.
 *
 * Limits to maxRows to prevent reading enormous sheets.
 */
export async function readSheetData(
  spreadsheetId: string,
  sheetTitle: string,
  maxRows: number = 1000,
): Promise<SheetData> {
  const sheets = getSheetsClient();

  // Read the first row (headers) + data rows.
  const range = `'${sheetTitle}'!A1:ZZ${maxRows + 1}`;

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
    valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "FORMATTED_STRING",
  });

  const values = response.data.values ?? [];

  if (values.length === 0) {
    return { sheetTitle, headers: [], rows: [], totalRows: 0 };
  }

  // First row is headers.
  const headers = (values[0] ?? []).map((h) => String(h).trim());
  const dataRows = values.slice(1);

  // Convert to key-value objects.
  const rows = dataRows.map((row) => {
    const obj: Record<string, string> = {};
    headers.forEach((header, i) => {
      if (header && row[i] !== undefined && row[i] !== null && row[i] !== "") {
        obj[header] = String(row[i]);
      }
    });
    return obj;
  });

  return {
    sheetTitle,
    headers,
    rows,
    totalRows: rows.length,
  };
}

/**
 * Check if the Google Sheets service is configured.
 * Returns true if the service account key is set.
 */
export function isGoogleSheetsConfigured(): boolean {
  return !!process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
}
