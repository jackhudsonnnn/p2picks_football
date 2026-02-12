/**
 * Unit Tests: Table Repository
 *
 * Tests for the TableRepository class.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TableRepository } from '../../../src/repositories/TableRepository';
import { MockSupabaseClient } from '../../helpers/mockSupabase';

describe('TableRepository', () => {
  let mockSupabase: MockSupabaseClient;
  let tableRepo: TableRepository;

  beforeEach(() => {
    mockSupabase = new MockSupabaseClient();
    tableRepo = new TableRepository(mockSupabase as any);
  });

  describe('findById', () => {
    it('should return table when found', async () => {
      const mockTable = {
        table_id: 'table-123',
        table_name: 'Test Table',
        host_user_id: 'user-456',
        created_at: '2024-01-01T00:00:00Z',
        last_activity_at: '2024-01-01T00:00:00Z',
      };

      mockSupabase.mockTable('tables').setResult(mockTable);

      const result = await tableRepo.findById('table-123');
      expect(result).toEqual(mockTable);
    });

    it('should return null when table not found', async () => {
      mockSupabase.mockTable('tables').setResult(null);

      const result = await tableRepo.findById('nonexistent');
      expect(result).toBeNull();
    });

    it('should throw on database error', async () => {
      mockSupabase.mockTable('tables').setResult(null, { message: 'Database error' });

      await expect(tableRepo.findById('table-123')).rejects.toThrow();
    });
  });

  describe('listTables', () => {
    it('should return user tables with pagination', async () => {
      const mockTables = [
        { 
          table_id: 'table-1', 
          table_name: 'Table 1', 
          host_user_id: 'user-1',
          created_at: '2024-01-01T00:00:00Z',
          last_activity_at: '2024-01-02T00:00:00Z',
          host: { username: 'testuser' },
          table_members: [{ user_id: 'user-123' }],
        },
        { 
          table_id: 'table-2', 
          table_name: 'Table 2', 
          host_user_id: 'user-2',
          created_at: '2024-01-01T00:00:00Z',
          last_activity_at: '2024-01-01T00:00:00Z',
          host: { username: 'testuser2' },
          table_members: [{ user_id: 'user-123' }],
        },
      ];

      mockSupabase.mockTable('tables').setResult(mockTables);

      const result = await tableRepo.listTables({
        userId: 'user-123',
        limit: 10,
      });

      expect(result.data).toHaveLength(2);
      expect(result.hasMore).toBe(false);
    });

    it('should indicate hasMore when more results exist', async () => {
      // Return 11 items when limit is 10 (limit + 1)
      const mockTables = Array.from({ length: 11 }, (_, i) => ({
        table_id: `table-${i}`,
        table_name: `Table ${i}`,
        host_user_id: 'user-1',
        created_at: '2024-01-01T00:00:00Z',
        last_activity_at: '2024-01-01T00:00:00Z',
        host: { username: 'testuser' },
        table_members: [{ user_id: 'user-123' }],
      }));

      mockSupabase.mockTable('tables').setResult(mockTables);

      const result = await tableRepo.listTables({
        userId: 'user-123',
        limit: 10,
      });

      expect(result.data).toHaveLength(10);
      expect(result.hasMore).toBe(true);
    });

    it('should return empty array for user with no tables', async () => {
      mockSupabase.mockTable('tables').setResult([]);

      const result = await tableRepo.listTables({
        userId: 'user-123',
        limit: 10,
      });

      expect(result.data).toEqual([]);
      expect(result.hasMore).toBe(false);
    });
  });

  describe('isMember', () => {
    it('should return true for valid member', async () => {
      mockSupabase.mockTable('table_members').setResult({
        table_id: 'table-123',
        user_id: 'user-456',
      });

      const result = await tableRepo.isMember('table-123', 'user-456');
      expect(result).toBe(true);
    });

    it('should return false for non-member', async () => {
      mockSupabase.mockTable('table_members').setResult(null);

      const result = await tableRepo.isMember('table-123', 'user-456');
      expect(result).toBe(false);
    });
  });
});
