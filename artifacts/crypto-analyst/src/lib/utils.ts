import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number, minimumFractionDigits = 2) {
  if (value === undefined || value === null) return "$0.00";
  
  // Format based on value size
  if (value < 0.01) {
    minimumFractionDigits = 4;
  } else if (value > 1000) {
    minimumFractionDigits = 2;
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits,
    maximumFractionDigits: minimumFractionDigits,
  }).format(value);
}

export function formatCompactNumber(number: number) {
  if (number === undefined || number === null) return "0";
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(number);
}

export function formatPercent(value: number) {
  if (value === undefined || value === null) return "0.00%";
  const formatted = new Intl.NumberFormat("en-US", {
    style: "percent",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value / 100);
  
  return value > 0 ? `+${formatted}` : formatted;
}
