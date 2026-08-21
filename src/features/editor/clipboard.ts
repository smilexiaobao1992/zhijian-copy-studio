export async function copyPlainText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.append(textarea);
  textarea.select();
  const legacyDocument = document as unknown as { execCommand: (commandId: string) => boolean };
  const copied = legacyDocument.execCommand('copy');
  textarea.remove();

  if (!copied) throw new Error('copy failed');
}
