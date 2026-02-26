export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (text.length === 0) {
    return false;
  }

  if (typeof navigator === 'undefined' || !navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
    return false;
  }

  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
