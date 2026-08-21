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

function copyRichTextFallback(html: string): boolean {
  const container = document.createElement('div');
  container.contentEditable = 'true';
  container.style.position = 'fixed';
  container.style.left = '-10000px';
  container.style.top = '0';
  container.innerHTML = html;
  document.body.append(container);

  const selection = window.getSelection();
  const range = document.createRange();
  try {
    range.selectNodeContents(container);
    selection?.removeAllRanges();
    selection?.addRange(range);
    const legacyDocument = document as unknown as { execCommand: (commandId: string) => boolean };
    return legacyDocument.execCommand('copy');
  } finally {
    selection?.removeAllRanges();
    container.remove();
  }
}

export async function copyRichText(html: string, plainText: string): Promise<void> {
  if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([plainText], { type: 'text/plain' }),
        }),
      ]);
      return;
    } catch {
      // Some browsers expose the rich clipboard API but only allow it in stricter contexts.
    }
  }

  if (!copyRichTextFallback(html)) throw new Error('copy failed');
}
