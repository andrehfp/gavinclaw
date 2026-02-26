import assert from 'node:assert/strict';
import test from 'node:test';
import {
  extractFilesFromClipboardData,
  getUnsupportedAttachmentMessage,
  resolveAttachmentSupport,
  splitAttachmentsBySupport,
} from '../lib/chat/file-attachments';

function createFile(name: string, type: string, contents = 'file-data'): File {
  return new File([contents], name, { type, lastModified: 1730000000000 });
}

test('extractFilesFromClipboardData returns empty array when clipboard data is missing', () => {
  assert.deepEqual(extractFilesFromClipboardData(null), []);
  assert.deepEqual(extractFilesFromClipboardData(undefined), []);
});

test('extractFilesFromClipboardData reads files from clipboardData.files first', () => {
  const screenshot = createFile('screenshot.png', 'image/png');
  const report = createFile('report.pdf', 'application/pdf');

  const files = extractFilesFromClipboardData({
    files: [screenshot, report],
  });

  assert.equal(files.length, 2);
  assert.equal(files[0], screenshot);
  assert.equal(files[1], report);
});

test('extractFilesFromClipboardData falls back to clipboardData.items for file items', () => {
  const image = createFile('clip.png', 'image/png');
  const doc = createFile('notes.txt', 'text/plain');

  const files = extractFilesFromClipboardData({
    items: [
      { kind: 'string' },
      { kind: 'file', getAsFile: () => image },
      { kind: 'file', getAsFile: () => doc },
      { kind: 'file', getAsFile: () => null },
    ],
  });

  assert.equal(files.length, 2);
  assert.equal(files[0], image);
  assert.equal(files[1], doc);
});

test('extractFilesFromClipboardData de-duplicates same file identity across files and items', () => {
  const pastedImage = createFile('paste.png', 'image/png');

  const files = extractFilesFromClipboardData({
    files: [pastedImage],
    items: [{ kind: 'file', getAsFile: () => pastedImage }],
  });

  assert.equal(files.length, 1);
  assert.equal(files[0], pastedImage);
});

test('resolveAttachmentSupport prioritizes full file support over vision-only support', () => {
  assert.equal(resolveAttachmentSupport({ acceptsFiles: true, hasVision: false }), 'files');
  assert.equal(resolveAttachmentSupport({ acceptsFiles: true, hasVision: true }), 'files');
  assert.equal(resolveAttachmentSupport({ acceptsFiles: false, hasVision: true }), 'images-only');
  assert.equal(resolveAttachmentSupport({ acceptsFiles: false, hasVision: false }), 'none');
});

test('splitAttachmentsBySupport accepts only images for vision-only models', () => {
  const image = createFile('screen.png', 'image/png');
  const imageNoMime = createFile('photo.jpg', '');
  const doc = createFile('report.pdf', 'application/pdf');

  const { accepted, rejected } = splitAttachmentsBySupport([image, imageNoMime, doc], 'images-only');

  assert.deepEqual(accepted, [image, imageNoMime]);
  assert.deepEqual(rejected, [doc]);
});

test('splitAttachmentsBySupport rejects all files when support is none', () => {
  const image = createFile('screen.png', 'image/png');
  const doc = createFile('report.pdf', 'application/pdf');

  const { accepted, rejected } = splitAttachmentsBySupport([image, doc], 'none');

  assert.deepEqual(accepted, []);
  assert.deepEqual(rejected, [image, doc]);
});

test('getUnsupportedAttachmentMessage returns support-specific messages', () => {
  assert.equal(getUnsupportedAttachmentMessage('images-only'), 'The selected model only supports image attachments.');
  assert.equal(getUnsupportedAttachmentMessage('none'), 'The selected model does not support file attachments.');
});
