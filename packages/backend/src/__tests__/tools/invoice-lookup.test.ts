/**
 * InvoiceLookup tool tests
 */

import { describe, it, expect } from 'vitest';
import { InvoiceLookupTool } from '../../tools/invoice-lookup.js';
import type { ToolContext } from '../../tools/types.js';

describe('InvoiceLookupTool', () => {
  const mockContext: ToolContext = {
    tenantId: 'tenant_123',
    sessionId: 'session_456',
    correlationId: 'corr_789',
  };

  describe('Tool Definition', () => {
    it('should have correct name', () => {
      expect(InvoiceLookupTool.name).toBe('InvoiceLookup');
    });

    it('should have description', () => {
      expect(InvoiceLookupTool.description).toBeDefined();
      expect(InvoiceLookupTool.description.length).toBeGreaterThan(0);
    });

    it('should have parameter schema', () => {
      expect(InvoiceLookupTool.parameters).toBeDefined();
      expect(InvoiceLookupTool.parameters.type).toBe('object');
    });

    it('should have permissions defined', () => {
      expect(InvoiceLookupTool.permissions).toBeDefined();
      expect(InvoiceLookupTool.permissions.dataAccess).toBe('none');
      expect(InvoiceLookupTool.permissions.networkAccess).toBe(false);
    });

    it('should have limits defined', () => {
      expect(InvoiceLookupTool.limits).toBeDefined();
      expect(InvoiceLookupTool.limits.timeoutMs).toBe(5000);
    });
  });

  describe('execute', () => {
    it('should find order by orderId', async () => {
      const result = await InvoiceLookupTool.execute(
        { orderId: '12345' },
        mockContext
      );

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect((result.data as any).orderId).toBe('12345');
      expect((result.data as any).status).toBe('shipped');
    });

    it('should return error for unknown orderId', async () => {
      const result = await InvoiceLookupTool.execute(
        { orderId: 'unknown' },
        mockContext
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should include order details in response', async () => {
      const result = await InvoiceLookupTool.execute(
        { orderId: '12345' },
        mockContext
      );

      expect(result.success).toBe(true);
      const data = result.data as any;
      expect(data.invoiceNumber).toBeDefined();
      expect(data.status).toBeDefined();
      expect(data.amount).toBeDefined();
      expect(data.items).toBeDefined();
    });

    it('should work with shipped orders', async () => {
      const result = await InvoiceLookupTool.execute(
        { orderId: '12345' },
        mockContext
      );

      expect(result.success).toBe(true);
      const data = result.data as any;
      expect(data.status).toBe('shipped');
      expect(data.trackingNumber).toBeDefined();
    });

    it('should work with processing orders', async () => {
      const result = await InvoiceLookupTool.execute(
        { orderId: '67890' },
        mockContext
      );

      expect(result.success).toBe(true);
      const data = result.data as any;
      expect(data.status).toBe('processing');
    });

    it('should work with delivered orders', async () => {
      const result = await InvoiceLookupTool.execute(
        { orderId: '11111' },
        mockContext
      );

      expect(result.success).toBe(true);
      const data = result.data as any;
      expect(data.status).toBe('delivered');
    });

    it('should work with cancelled orders', async () => {
      const result = await InvoiceLookupTool.execute(
        { orderId: '99999' },
        mockContext
      );

      expect(result.success).toBe(true);
      const data = result.data as any;
      expect(data.status).toBe('cancelled');
    });
  });
});
