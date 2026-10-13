export default function Loading() {
  return (
    <div className="container-page pt-10" aria-busy="true" aria-label="Loading product">
      <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr]">
        <div className="skeleton aspect-[5/4] rounded-[1.75rem]" />
        <div className="space-y-4 pt-4">
          <div className="skeleton h-12 w-2/3" />
          <div className="skeleton h-10 w-40" />
          <div className="grid grid-cols-3 gap-3"><div className="skeleton h-16" /><div className="skeleton h-16" /><div className="skeleton h-16" /></div>
          <div className="skeleton h-13 w-60 rounded-full" />
        </div>
      </div>
    </div>
  );
}
