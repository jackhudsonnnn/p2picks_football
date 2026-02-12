/**
 * Unit Tests: Message Validation
 *
 * Tests for the message validation and sanitization utilities.
 */

import { describe, it, expect } from 'vitest';
import {
  validateMessage,
  isValidUUID,
  MAX_MESSAGE_LENGTH,
} from '../../../src/utils/messageValidation';

describe('messageValidation', () => {
  describe('validateMessage', () => {
    it('should accept a valid message', () => {
      const result = validateMessage('Hello, world!');
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe('Hello, world!');
      expect(result.error).toBeUndefined();
    });

    it('should trim whitespace', () => {
      const result = validateMessage('  Hello  ');
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe('Hello');
    });

    it('should reject non-string input', () => {
      expect(validateMessage(null).valid).toBe(false);
      expect(validateMessage(undefined).valid).toBe(false);
      expect(validateMessage(123).valid).toBe(false);
      expect(validateMessage({}).valid).toBe(false);
      expect(validateMessage([]).valid).toBe(false);
    });

    it('should reject empty messages', () => {
      const result = validateMessage('');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Message cannot be empty');
    });

    it('should reject whitespace-only messages', () => {
      const result = validateMessage('   \n\t   ');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Message cannot be empty');
    });

    it('should reject messages exceeding max length', () => {
      const longMessage = 'a'.repeat(MAX_MESSAGE_LENGTH + 1);
      const result = validateMessage(longMessage);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('exceeds maximum length');
    });

    it('should accept message at exactly max length', () => {
      const exactMessage = 'a'.repeat(MAX_MESSAGE_LENGTH);
      const result = validateMessage(exactMessage);
      expect(result.valid).toBe(true);
      expect(result.sanitized).toHaveLength(MAX_MESSAGE_LENGTH);
    });

    it('should strip control characters', () => {
      const result = validateMessage('Hello\x00World\x1F');
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe('HelloWorld');
    });

    it('should strip zero-width characters', () => {
      const result = validateMessage('Hello\u200BWorld');
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe('HelloWorld');
    });

    it('should normalize line breaks', () => {
      const result = validateMessage('Line1\r\nLine2\rLine3');
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe('Line1\nLine2\nLine3');
    });

    it('should collapse excessive newlines', () => {
      const result = validateMessage('Line1\n\n\n\n\n\nLine2');
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe('Line1\n\n\nLine2');
    });

    it('should collapse excessive spaces', () => {
      const result = validateMessage('Word1' + ' '.repeat(20) + 'Word2');
      expect(result.valid).toBe(true);
      // Should have at most 9 spaces
      expect(result.sanitized.split(' ').length).toBeLessThanOrEqual(10);
    });

    it('should preserve emojis', () => {
      const result = validateMessage('Hello 👋 World 🌍');
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe('Hello 👋 World 🌍');
    });

    it('should preserve international characters', () => {
      const result = validateMessage('Привет мир 你好世界');
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe('Привет мир 你好世界');
    });
  });

  describe('isValidUUID', () => {
    it('should accept valid UUIDs', () => {
      expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
      expect(isValidUUID('6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe(true);
      // Note: all-zeros UUID is technically not valid per RFC 4122 (version/variant bits)
      expect(isValidUUID('f47ac10b-58cc-4372-a567-0e02b2c3d479')).toBe(true);
    });

    it('should reject invalid UUIDs', () => {
      expect(isValidUUID('not-a-uuid')).toBe(false);
      expect(isValidUUID('550e8400-e29b-41d4-a716')).toBe(false);
      expect(isValidUUID('550e8400e29b41d4a716446655440000')).toBe(false);
      expect(isValidUUID('')).toBe(false);
    });

    it('should reject non-string input', () => {
      expect(isValidUUID(null as any)).toBe(false);
      expect(isValidUUID(undefined as any)).toBe(false);
      expect(isValidUUID(123 as any)).toBe(false);
    });

    it('should be case-insensitive', () => {
      expect(isValidUUID('550E8400-E29B-41D4-A716-446655440000')).toBe(true);
      expect(isValidUUID('550e8400-E29B-41d4-A716-446655440000')).toBe(true);
    });
  });
});
