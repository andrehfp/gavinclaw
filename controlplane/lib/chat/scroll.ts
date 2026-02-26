type ScrollMetrics = Pick<HTMLElement, 'clientHeight' | 'scrollHeight' | 'scrollTop'>;

export function getDistanceFromBottom(container: ScrollMetrics): number {
  return Math.max(0, container.scrollHeight - container.clientHeight - container.scrollTop);
}

export function isScrolledNearBottom(container: ScrollMetrics, thresholdPx = 0): boolean {
  const safeThreshold = Math.max(0, thresholdPx);
  return getDistanceFromBottom(container) <= safeThreshold;
}
