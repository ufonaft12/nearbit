/**
 * Edge Case 2: Extremely long Russian or Hebrew product names in the table.
 *
 * The UI must not break layout — names should be truncated/wrapped rather than
 * causing horizontal overflow that breaks the sticky table layout.
 * We verify truncation CSS classes are present on name cells.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ProductsTable from "@/components/inventory/ProductsTable";
import { makeProduct } from "./helpers/factories";
import { NextIntlClientProvider } from "next-intl";
import en from "@/messages/en.json";

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      {ui}
    </NextIntlClientProvider>
  );
}

const VERY_LONG_HEBREW =
  "מוצר עם שם ארוך מאוד שבהחלט לא אמור להופיע בצורה נורמלית על המסך ויגרום לבעיות תצוגה אם לא מטפלים בו כראוי";
const VERY_LONG_RUSSIAN =
  "Очень длинное название товара которое точно не должно нормально отображаться на экране и вызовет проблемы с отображением если не обработать его правильно";

describe("Edge Case 2 — Extremely long product names", () => {
  it("renders a very long Hebrew name without throwing", () => {
    const product = makeProduct({ id: "p1", name_he: VERY_LONG_HEBREW });
    expect(() =>
      renderWithIntl(<ProductsTable products={[product]} />)
    ).not.toThrow();
  });

  it("renders a very long Russian name without throwing", () => {
    const product = makeProduct({ id: "p1", name_ru: VERY_LONG_RUSSIAN });
    expect(() =>
      renderWithIntl(<ProductsTable products={[product]} />)
    ).not.toThrow();
  });

  it("Russian name cell has truncate class to prevent layout overflow", () => {
    const product = makeProduct({ id: "p1", name_ru: VERY_LONG_RUSSIAN });
    const { container } = renderWithIntl(<ProductsTable products={[product]} />);

    // The Russian name td should carry the truncate utility
    const ruCell = container.querySelector("td.truncate, td[class*='truncate']");
    expect(ruCell).not.toBeNull();
  });

  it("renders the full Hebrew text in the DOM (screen reader accessible)", () => {
    const product = makeProduct({ id: "p1", name_he: VERY_LONG_HEBREW });
    renderWithIntl(<ProductsTable products={[product]} />);
    // Text must be in the DOM even if visually truncated via CSS
    expect(screen.getByText(VERY_LONG_HEBREW)).toBeInTheDocument();
  });

  it("renders the full Russian text in the DOM (screen reader accessible)", () => {
    const product = makeProduct({ id: "p1", name_ru: VERY_LONG_RUSSIAN });
    renderWithIntl(<ProductsTable products={[product]} />);
    expect(screen.getByText(VERY_LONG_RUSSIAN)).toBeInTheDocument();
  });
});
