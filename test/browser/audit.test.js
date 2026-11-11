import { describe, it, expect } from 'vitest';
import { auditOutput } from '../../src/index.js';
import { utilities } from './helpers.js';

const { imageTypeToExtension } = utilities;

describe('auditOutput', () => {
  describe('normal path', () => {
    it('should retain EXIF when retainExif is set and the output is JPEG', () => {
      const report = auditOutput({
        file: { type: 'image/jpeg', size: 100000, name: 'photo.jpg', lastModified: 1700000000000 },
        result: { type: 'image/jpeg', size: 80000 },
        options: { strict: true, retainExif: true },
        naturalWidth: 2000,
        naturalHeight: 1000,
      });

      expect(report.degraded).toBe(false);
      expect(report.fallback.occurs).toBe(false);
      expect(report.fallback.reason).toBe('none');
      expect(report.exif.action).toBe('retain');
      expect(report.output.mimeType).toBe('image/jpeg');
      expect(report.output.name).toBe('photo.jpg');

      const retentionCheck = report.checks.find((check) => check.name === 'exif-retention');

      expect(retentionCheck.passed).toBe(true);
      expect(retentionCheck.reason).toBeNull();
    });

    it('should convert extensions exactly like imageTypeToExtension', () => {
      const mimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];

      for (const mimeType of mimeTypes) {
        const report = auditOutput({
          file: { type: 'image/png', size: 100, name: 'photo.png' },
          result: { type: mimeType, size: 50 },
          options: { mimeType },
          naturalWidth: 100,
          naturalHeight: 100,
        });

        expect(report.output.mimeType).toBe(mimeType);
        expect(report.output.extension).toBe(imageTypeToExtension(mimeType));
        expect(report.output.name).toBe(`photo${imageTypeToExtension(mimeType)}`);
      }

      // JPEG specifically maps to `.jpg`
      const jpegReport = auditOutput({
        file: { type: 'image/png', size: 100, name: 'photo.png' },
        result: { type: 'image/jpeg', size: 50 },
        options: { mimeType: 'image/jpeg' },
        naturalWidth: 100,
        naturalHeight: 100,
      });

      expect(jpegReport.output.extension).toBe('.jpg');
      expect(jpegReport.output.name).toBe('photo.jpg');
    });

    it('should convert to JPEG when the file exceeds convertSize and is listed in convertTypes', () => {
      const report = auditOutput({
        file: { type: 'image/png', size: 6000000, name: 'photo.png' },
        result: { type: 'image/jpeg', size: 100000 },
        options: { convertTypes: ['image/png'], convertSize: 5000000 },
        naturalWidth: 2000,
        naturalHeight: 1000,
      });

      expect(report.output.mimeType).toBe('image/jpeg');
      expect(report.output.name).toBe('photo.jpg');
      expect(report.output.typeChanged).toBe(true);

      const conversionCheck = report.checks.find((check) => check.name === 'jpeg-conversion');

      expect(conversionCheck.passed).toBe(true);
    });

    it('should strip EXIF when retainExif is not set and the output is JPEG', () => {
      const report = auditOutput({
        file: { type: 'image/jpeg', size: 100000, name: 'photo.jpg' },
        result: { type: 'image/jpeg', size: 80000 },
        options: { strict: true, retainExif: false },
        naturalWidth: 2000,
        naturalHeight: 1000,
      });

      expect(report.exif.action).toBe('strip');

      const stripCheck = report.checks.find((check) => check.name === 'exif-strip');

      expect(stripCheck.passed).toBe(true);
    });

    it('should fall back to the original file when the canvas produces no output', () => {
      const report = auditOutput({
        file: { type: 'image/png', size: 100000, name: 'photo.png' },
        result: null,
        options: {},
        naturalWidth: 2000,
        naturalHeight: 1000,
      });

      expect(report.fallback.occurs).toBe(true);
      expect(report.fallback.reason).toBe('canvas-no-output');
      expect(report.output.mimeType).toBe('image/png');
      expect(report.output.name).toBe('photo.png');
      expect(report.exif.action).toBe('none');

      const canvasCheck = report.checks.find((check) => check.name === 'canvas-output');

      expect(canvasCheck.passed).toBe(false);
      expect(canvasCheck.reason).toBeTruthy();
    });
  });

  describe('negative path', () => {
    it('should not auto-convert to JPEG when mimeType is explicitly set alongside convertTypes', () => {
      const report = auditOutput({
        file: { type: 'image/png', size: 10000000, name: 'photo.png' },
        result: { type: 'image/png', size: 500000 },
        options: { mimeType: 'image/png', convertTypes: ['image/png'], convertSize: 0 },
        naturalWidth: 2000,
        naturalHeight: 1000,
      });

      expect(report.output.mimeType).toBe('image/png');
      expect(report.output.name).toBe('photo.png');
      expect(report.output.typeChanged).toBe(false);

      const conversionCheck = report.checks.find((check) => check.name === 'jpeg-conversion');

      expect(conversionCheck.passed).toBe(false);
      expect(conversionCheck.reason).toContain('explicitly set');
    });

    it('should fall back to the original file under strict when the result is larger and nothing else changed', () => {
      const report = auditOutput({
        file: { type: 'image/jpeg', size: 50000, name: 'photo.jpg' },
        result: { type: 'image/jpeg', size: 60000 },
        options: { strict: true, retainExif: false },
        naturalWidth: 2000,
        naturalHeight: 1000,
      });

      expect(report.fallback.occurs).toBe(true);
      expect(report.fallback.reason).toBe('strict');
      expect(report.output.mimeType).toBe('image/jpeg');
      expect(report.output.name).toBe('photo.jpg');
      // The strict fallback strips EXIF from the original JPEG asynchronously
      expect(report.exif.action).toBe('strip');

      const strictCheck = report.checks.find((check) => check.name === 'strict-fallback');

      expect(strictCheck.passed).toBe(true);
    });
  });

  describe('boundary path', () => {
    it('should not fall back when the result is larger but maxWidth is set', () => {
      const report = auditOutput({
        file: { type: 'image/jpeg', size: 50000, name: 'photo.jpg' },
        result: { type: 'image/jpeg', size: 60000 },
        options: { strict: true, retainExif: false, maxWidth: 800 },
        naturalWidth: 2000,
        naturalHeight: 1000,
      });

      expect(report.fallback.occurs).toBe(false);
      expect(report.fallback.reason).toBe('none');

      const strictCheck = report.checks.find((check) => check.name === 'strict-fallback');

      expect(strictCheck.passed).toBe(false);
      expect(strictCheck.reason).toContain('maxWidth');
    });

    it('should not fall back when the result is larger but the mime type changed', () => {
      const report = auditOutput({
        file: { type: 'image/png', size: 50000, name: 'photo.png' },
        result: { type: 'image/jpeg', size: 60000 },
        options: { strict: true, retainExif: false, convertTypes: ['image/png'], convertSize: 0 },
        naturalWidth: 2000,
        naturalHeight: 1000,
      });

      expect(report.fallback.occurs).toBe(false);

      const strictCheck = report.checks.find((check) => check.name === 'strict-fallback');

      expect(strictCheck.passed).toBe(false);
      expect(strictCheck.reason).toContain('mime type changed');
    });

    it('should not fall back when the result is not larger than the original', () => {
      const report = auditOutput({
        file: { type: 'image/jpeg', size: 60000, name: 'photo.jpg' },
        result: { type: 'image/jpeg', size: 60000 },
        options: { strict: true },
        naturalWidth: 2000,
        naturalHeight: 1000,
      });

      expect(report.fallback.occurs).toBe(false);

      const strictCheck = report.checks.find((check) => check.name === 'strict-fallback');

      expect(strictCheck.passed).toBe(false);
      expect(strictCheck.reason).toContain('not larger');
    });
  });

  describe('degraded input', () => {
    it('should return a degraded report instead of throwing for a non-image file type', () => {
      let report;

      expect(() => {
        report = auditOutput({
          file: { type: 'text/plain', size: 100, name: 'notes.txt' },
          result: { type: 'text/plain', size: 90 },
          options: {},
          naturalWidth: 100,
          naturalHeight: 100,
        });
      }).not.toThrow();

      expect(report.degraded).toBe(true);
      expect(report.issues.some((issue) => issue.field === 'file.type')).toBe(true);
      expect(report.issues.find((issue) => issue.field === 'file.type').reason).toBeTruthy();
      expect(report.fallback).toBeDefined();
      expect(report.exif).toBeDefined();
    });

    it('should flag negative sizes and non-positive natural dimensions', () => {
      const report = auditOutput({
        file: { type: 'image/jpeg', size: -1, name: 'photo.jpg' },
        result: { type: 'image/jpeg', size: 100 },
        options: {},
        naturalWidth: 0,
        naturalHeight: -5,
      });

      expect(report.degraded).toBe(true);

      const fields = report.issues.map((issue) => issue.field);

      expect(fields).toContain('file.size');
      expect(fields).toContain('naturalWidth');
      expect(fields).toContain('naturalHeight');
    });

    it('should not throw for an empty or missing snapshot', () => {
      expect(() => auditOutput()).not.toThrow();
      expect(() => auditOutput({})).not.toThrow();

      const report = auditOutput({});

      expect(report.degraded).toBe(true);
      expect(report.issues.length).toBeGreaterThan(0);
    });
  });

  describe('serializability', () => {
    it('should produce a JSON-serializable report without File, Blob, TypedArray, or function references', () => {
      const report = auditOutput({
        file: { type: 'image/jpeg', size: 100000, name: 'photo.jpg', lastModified: 1700000000000 },
        result: { type: 'image/jpeg', size: 80000 },
        options: { strict: true, retainExif: true, maxWidth: Infinity },
        naturalWidth: 2000,
        naturalHeight: 1000,
      });

      let serialized;

      expect(() => {
        serialized = JSON.stringify(report);
      }).not.toThrow();

      const parsed = JSON.parse(serialized);

      expect(parsed).toEqual(report);
      expect(parsed.fallback.reason).toBe('none');
      expect(parsed.exif.action).toBe('retain');
      expect(Array.isArray(parsed.checks)).toBe(true);
      expect(parsed.checks.every((check) => (
        typeof check.name === 'string'
        && typeof check.passed === 'boolean'
        && (check.reason === null || typeof check.reason === 'string')
      ))).toBe(true);
    });
  });
});
