export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading your orders">
      <div className="skeleton h-8 w-32" />
      <ul className="mt-5 space-y-4">
        {Array.from({ length: 3 }, (_, i) => (
          <li key={i} className="rounded-[var(--radius-card)] border border-line bg-white p-5">
            <div className="flex justify-between gap-4">
              <div className="space-y-2">
                <div className="skeleton h-5 w-40" />
                <div className="skeleton h-4 w-56" />
              </div>
              <div className="skeleton h-7 w-28 rounded-full" />
            </div>
            <div className="mt-5 flex gap-2">
              {Array.from({ length: 4 }, (_, j) => <div key={j} className="skeleton size-12" />)}
            </div>
            <div className="mt-5 flex justify-between">
              <div className="skeleton h-5 w-20" />
              <div className="skeleton h-9 w-48 rounded-full" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
