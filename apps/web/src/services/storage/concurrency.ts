/** Bounded concurrency for I/O during project load; preserves input order. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!items.length) return [];
  const workerCount = Math.min(
    items.length,
    Number.isFinite(concurrency) ? Math.max(1, Math.floor(concurrency)) : 1,
  );
  const output = new Array<R>(items.length);
  let nextIndex = 0;
  const work = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      output[index] = await mapper(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: workerCount }, () => work()));
  return output;
}
