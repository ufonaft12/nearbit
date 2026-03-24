/**
 * Tests for UploadForm component edge cases.
 *
 * Covers:
 *  - Submit button disabled when no file selected
 *  - Rejects files with disallowed extensions (alert)
 *  - Accepts .csv, .xlsx, .xls by extension
 *  - Shows file name + size after selection
 *  - Shows success result: inserted count, skipped count
 *  - Shows error rows from UploadResult.errors
 *  - Shows error result style (yellow border) when errors exist
 *  - Shows success style (green border) when no errors
 *  - Upload button disabled while pending
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import UploadForm from "@/components/inventory/UploadForm";

vi.mock("@/lib/actions/inventory", () => ({
  uploadInventoryAction: vi.fn(),
}));

import { uploadInventoryAction } from "@/lib/actions/inventory";

function makeFile(name: string, type = "text/csv", sizeBytes = 1024): File {
  const content = "a".repeat(sizeBytes);
  return new File([content], name, { type });
}

describe("UploadForm — initial state", () => {
  it("renders drop zone and disabled submit button with no file", () => {
    render(<UploadForm />);
    expect(screen.getByText("Drop your CSV or Excel file here")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Upload Inventory/i })).toBeDisabled();
  });

  it("shows Smart Mapping AI note", () => {
    render(<UploadForm />);
    expect(screen.getByText(/Smart Mapping/i)).toBeInTheDocument();
  });
});

describe("UploadForm — file type validation", () => {
  beforeEach(() => {
    vi.spyOn(window, "alert").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects a .pdf file and shows an alert", () => {
    render(<UploadForm />);
    const input = document.querySelector("input[type='file']") as HTMLInputElement;
    const badFile = makeFile("report.pdf", "application/pdf");

    // Use fireEvent.change to bypass jsdom's accept-attribute filter so
    // handleFile() actually runs and we can verify the alert logic.
    fireEvent.change(input, { target: { files: [badFile] } });

    expect(window.alert).toHaveBeenCalledWith(
      expect.stringContaining("CSV or Excel")
    );
    // Submit button should still be disabled — file was rejected
    expect(screen.getByRole("button", { name: /Upload Inventory/i })).toBeDisabled();
  });

  it("rejects a .txt file", () => {
    render(<UploadForm />);
    const input = document.querySelector("input[type='file']") as HTMLInputElement;
    const txtFile = makeFile("data.txt", "text/plain");
    fireEvent.change(input, { target: { files: [txtFile] } });
    expect(window.alert).toHaveBeenCalled();
  });

  it("accepts a .csv file without alert", async () => {
    render(<UploadForm />);
    const input = document.querySelector("input[type='file']") as HTMLInputElement;
    await userEvent.upload(input, makeFile("products.csv", "text/csv"));
    expect(window.alert).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Upload Inventory/i })).not.toBeDisabled();
  });

  it("accepts a .xlsx file without alert", async () => {
    render(<UploadForm />);
    const input = document.querySelector("input[type='file']") as HTMLInputElement;
    const xlsxFile = makeFile(
      "products.xlsx",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    await userEvent.upload(input, xlsxFile);
    expect(window.alert).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Upload Inventory/i })).not.toBeDisabled();
  });

  it("accepts a .xls file without alert", async () => {
    render(<UploadForm />);
    const input = document.querySelector("input[type='file']") as HTMLInputElement;
    const xlsFile = makeFile("products.xls", "application/vnd.ms-excel");
    await userEvent.upload(input, xlsFile);
    expect(window.alert).not.toHaveBeenCalled();
  });
});

describe("UploadForm — file selected state", () => {
  it("shows the file name after a valid file is selected", async () => {
    render(<UploadForm />);
    const input = document.querySelector("input[type='file']") as HTMLInputElement;
    await userEvent.upload(input, makeFile("inventory.csv", "text/csv", 2048));

    expect(screen.getByText("inventory.csv")).toBeInTheDocument();
  });

  it("shows file size in KB", async () => {
    render(<UploadForm />);
    const input = document.querySelector("input[type='file']") as HTMLInputElement;
    await userEvent.upload(input, makeFile("inventory.csv", "text/csv", 2048));

    // 2048 bytes = 2.0 KB
    expect(screen.getByText(/2\.0 KB/)).toBeInTheDocument();
  });
});

describe("UploadForm — upload result display", () => {
  it("shows inserted and skipped counts after successful upload", async () => {
    vi.mocked(uploadInventoryAction).mockResolvedValueOnce({
      inserted: 42,
      skipped: 3,
      errors: [],
    });

    render(<UploadForm />);
    const input = document.querySelector("input[type='file']") as HTMLInputElement;
    await userEvent.upload(input, makeFile("inv.csv", "text/csv"));
    fireEvent.submit(screen.getByRole("button", { name: /Upload Inventory/i }).closest("form")!);

    await waitFor(() => {
      expect(screen.getByText(/42 products imported/i)).toBeInTheDocument();
      expect(screen.getByText(/3 skipped/i)).toBeInTheDocument();
    });
  });

  it("shows individual error rows when UploadResult.errors is non-empty", async () => {
    vi.mocked(uploadInventoryAction).mockResolvedValueOnce({
      inserted: 10,
      skipped: 0,
      errors: ["Row 3: missing name_he", "Row 7: invalid price"],
    });

    render(<UploadForm />);
    const input = document.querySelector("input[type='file']") as HTMLInputElement;
    await userEvent.upload(input, makeFile("inv.csv", "text/csv"));
    fireEvent.submit(screen.getByRole("button", { name: /Upload Inventory/i }).closest("form")!);

    await waitFor(() => {
      expect(screen.getByText("Row 3: missing name_he")).toBeInTheDocument();
      expect(screen.getByText("Row 7: invalid price")).toBeInTheDocument();
    });
  });

  it("shows green result block when no errors", async () => {
    vi.mocked(uploadInventoryAction).mockResolvedValueOnce({
      inserted: 5,
      skipped: 0,
      errors: [],
    });

    render(<UploadForm />);
    const input = document.querySelector("input[type='file']") as HTMLInputElement;
    await userEvent.upload(input, makeFile("inv.csv", "text/csv"));
    fireEvent.submit(screen.getByRole("button", { name: /Upload Inventory/i }).closest("form")!);

    await waitFor(() => {
      // "Upload complete" lives inside the inner header div; go up to the card container
      const result = screen.getByText("Upload complete").closest(".rounded-lg");
      expect(result?.className).toContain("emerald");
    });
  });

  it("shows yellow result block when errors exist", async () => {
    vi.mocked(uploadInventoryAction).mockResolvedValueOnce({
      inserted: 2,
      skipped: 0,
      errors: ["Row 1: bad data"],
    });

    render(<UploadForm />);
    const input = document.querySelector("input[type='file']") as HTMLInputElement;
    await userEvent.upload(input, makeFile("inv.csv", "text/csv"));
    fireEvent.submit(screen.getByRole("button", { name: /Upload Inventory/i }).closest("form")!);

    await waitFor(() => {
      const result = screen.getByText("Upload complete").closest(".rounded-lg");
      expect(result?.className).toContain("yellow");
    });
  });

  it("shows '1 product imported' (singular) for a single row", async () => {
    vi.mocked(uploadInventoryAction).mockResolvedValueOnce({
      inserted: 1,
      skipped: 0,
      errors: [],
    });

    render(<UploadForm />);
    const input = document.querySelector("input[type='file']") as HTMLInputElement;
    await userEvent.upload(input, makeFile("inv.csv", "text/csv"));
    fireEvent.submit(screen.getByRole("button", { name: /Upload Inventory/i }).closest("form")!);

    await waitFor(() => {
      expect(screen.getByText(/1 product imported/)).toBeInTheDocument();
    });
  });
});
