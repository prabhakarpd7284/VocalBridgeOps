/**
 * InvoiceLookup Tool
 * Mock implementation for looking up order/invoice information
 */

import type { Tool, ToolContext, ToolResult } from './types.js';

// Mock invoice database
const mockInvoices: Record<
  string,
  {
    orderId: string;
    invoiceNumber: string;
    status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
    amount: number;
    currency: string;
    customerName: string;
    createdAt: string;
    updatedAt: string;
    trackingNumber?: string;
    estimatedDelivery?: string;
    items: Array<{ name: string; quantity: number; price: number }>;
  }
> = {
  '12345': {
    orderId: '12345',
    invoiceNumber: 'INV-2024-12345',
    status: 'shipped',
    amount: 99.99,
    currency: 'USD',
    customerName: 'John Doe',
    createdAt: '2024-01-10T10:00:00Z',
    updatedAt: '2024-01-12T14:30:00Z',
    trackingNumber: '1Z999AA10123456784',
    estimatedDelivery: '2024-01-18',
    items: [
      { name: 'Wireless Headphones', quantity: 1, price: 79.99 },
      { name: 'USB-C Cable', quantity: 2, price: 10.0 },
    ],
  },
  '67890': {
    orderId: '67890',
    invoiceNumber: 'INV-2024-67890',
    status: 'processing',
    amount: 249.5,
    currency: 'USD',
    customerName: 'Jane Smith',
    createdAt: '2024-01-14T15:20:00Z',
    updatedAt: '2024-01-14T15:20:00Z',
    items: [
      { name: 'Laptop Stand', quantity: 1, price: 149.5 },
      { name: 'Keyboard', quantity: 1, price: 100.0 },
    ],
  },
  '11111': {
    orderId: '11111',
    invoiceNumber: 'INV-2024-11111',
    status: 'delivered',
    amount: 45.0,
    currency: 'USD',
    customerName: 'Bob Wilson',
    createdAt: '2024-01-05T09:00:00Z',
    updatedAt: '2024-01-08T11:45:00Z',
    trackingNumber: '1Z999AA10123456789',
    items: [{ name: 'Phone Case', quantity: 3, price: 15.0 }],
  },
  '99999': {
    orderId: '99999',
    invoiceNumber: 'INV-2024-99999',
    status: 'cancelled',
    amount: 500.0,
    currency: 'USD',
    customerName: 'Alice Brown',
    createdAt: '2024-01-02T08:00:00Z',
    updatedAt: '2024-01-03T10:00:00Z',
    items: [{ name: 'Smart Watch', quantity: 1, price: 500.0 }],
  },
};

export const InvoiceLookupTool: Tool = {
  name: 'InvoiceLookup',
  description:
    'Look up invoice or order details by order ID. Returns order status, tracking information, and line items.',
  parameters: {
    type: 'object',
    properties: {
      orderId: {
        type: 'string',
        description: 'The order ID to look up (e.g., "12345")',
      },
      invoiceNumber: {
        type: 'string',
        description: 'The invoice number to look up (e.g., "INV-2024-12345")',
      },
    },
    oneOf: [{ required: ['orderId'] }, { required: ['invoiceNumber'] }],
  },
  permissions: {
    dataAccess: 'none', // Uses mock data only
    networkAccess: false,
    estimatedCostCents: 0,
  },
  limits: {
    timeoutMs: 5000,
    maxPayloadBytes: 10240, // 10KB
  },

  async execute(
    args: unknown,
    context: ToolContext
  ): Promise<ToolResult> {
    const input = args as { orderId?: string; invoiceNumber?: string };

    // Simulate some processing time
    await new Promise((resolve) => setTimeout(resolve, 50 + Math.random() * 100));

    let invoice;

    if (input.orderId) {
      invoice = mockInvoices[input.orderId];
    } else if (input.invoiceNumber) {
      // Search by invoice number
      invoice = Object.values(mockInvoices).find(
        (inv) => inv.invoiceNumber === input.invoiceNumber
      );
    }

    if (!invoice) {
      return {
        success: false,
        error: `Order not found: ${input.orderId || input.invoiceNumber}`,
      };
    }

    // Return relevant information
    return {
      success: true,
      data: {
        orderId: invoice.orderId,
        invoiceNumber: invoice.invoiceNumber,
        status: invoice.status,
        statusDescription: getStatusDescription(invoice.status),
        amount: invoice.amount,
        currency: invoice.currency,
        customerName: invoice.customerName,
        createdAt: invoice.createdAt,
        updatedAt: invoice.updatedAt,
        trackingNumber: invoice.trackingNumber,
        estimatedDelivery: invoice.estimatedDelivery,
        itemCount: invoice.items.length,
        items: invoice.items,
      },
    };
  },
};

function getStatusDescription(status: string): string {
  const descriptions: Record<string, string> = {
    pending: 'Order received and awaiting processing',
    processing: 'Order is being prepared for shipment',
    shipped: 'Order has been shipped and is on its way',
    delivered: 'Order has been delivered successfully',
    cancelled: 'Order was cancelled',
  };
  return descriptions[status] || 'Unknown status';
}
