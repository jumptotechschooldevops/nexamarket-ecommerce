export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return <div className="loading-state">{label}</div>;
}

export function EmptyState({ label }: { label: string }) {
  return <div className="empty-state">{label}</div>;
}
