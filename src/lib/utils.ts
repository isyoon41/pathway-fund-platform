import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatAmount(amount: number | null | undefined): string {
  if (amount == null || isNaN(amount)) return '-'
  if (amount >= 100000000) {
    return `${(amount / 100000000).toFixed(1)}억원`
  }
  if (amount >= 10000) {
    return `${(amount / 10000).toFixed(0)}만원`
  }
  return `${amount.toLocaleString()}원`
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}
