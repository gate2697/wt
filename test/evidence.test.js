import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_EVIDENCE_BYTES, MAX_EVIDENCE_FILES, totalUploadedBytes, validateEvidenceFiles } from '../src/services/evidence.js';

test('evidence limits allow ten files within the 100 MB total', () => {
  const files = Array.from({ length: MAX_EVIDENCE_FILES }, (_, index) => ({ size: index === 0 ? 10 * 1024 * 1024 : 10 * 1024 * 1024 }));
  assert.equal(totalUploadedBytes(files), MAX_EVIDENCE_BYTES);
  assert.doesNotThrow(() => validateEvidenceFiles(files));
});

test('evidence limits reject more than ten files or more than 100 MB', () => {
  assert.throws(() => validateEvidenceFiles(Array.from({ length: MAX_EVIDENCE_FILES + 1 }, () => ({ size: 1 }))), (error) => error.code === 'evidence_file_count_exceeded' && error.statusCode === 413);
  assert.throws(() => validateEvidenceFiles([{ size: MAX_EVIDENCE_BYTES + 1 }]), (error) => error.code === 'evidence_total_size_exceeded' && error.statusCode === 413);
});
