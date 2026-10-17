const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export function formatBRL(cents: number): string {
  return brl.format(cents / 100);
}

/** Parse user input like "50", "50,00", "1.234,56" into cents. */
export function parseAmountToCents(input: string): number | null {
  const cleaned = input.trim().replace(/\s|R\$/gi, "");
  if (!cleaned) return null;
  const normalized =
    cleaned.includes(",") && cleaned.includes(".")
      ? cleaned.replace(/\./g, "").replace(",", ".")
      : cleaned.replace(",", ".");
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

export function formatOdd(odd: number): string {
  return odd.toFixed(2).replace(".", ",");
}

export const MIN_DEPOSIT_CENTS = 1000;
export const MAX_DEPOSIT_CENTS = 500_000;
export const MIN_STAKE_CENTS = 200;
export const MAX_SELECTIONS = 20;
