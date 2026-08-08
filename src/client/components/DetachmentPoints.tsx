export function DetachmentPoints({ spent, available, error }: { spent: number; available: number | null; error?: string | null }) {
  return (
    <p role={error ? 'alert' : undefined} className={`min-h-4 text-xs ${error ? 'text-destructive' : 'text-dim'}`}>
      {available === null ? `${spent} DP used · No limit` : `${spent} used / ${available} available DP`}
    </p>
  )
}
