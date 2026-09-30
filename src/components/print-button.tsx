"use client";

import { quietButtonClass } from "@/components/styles";

export function PrintButton() {
  return (
    <button
      type="button"
      className={`${quietButtonClass} print:hidden`}
      onClick={() => window.print()}
    >
      Print
    </button>
  );
}
