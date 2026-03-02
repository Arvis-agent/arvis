export interface ClientConfig {
    name: string;
    slug: string;
    contactInfo?: Record<string, unknown>;
    plan?: 'per_task' | 'monthly' | 'prepaid';
    planConfig?: Record<string, unknown>;
    notes?: string;
}
export interface Client {
    id: number;
    name: string;
    slug: string;
    contactInfo: Record<string, unknown> | null;
    plan: 'per_task' | 'monthly' | 'prepaid';
    planConfig: Record<string, unknown> | null;
    balance: number;
    status: string;
    notes: string | null;
    createdAt: string;
    updatedAt: string;
}
export interface Charge {
    id: number;
    clientId: number;
    agentId: number | null;
    amount: number;
    type: 'task' | 'subscription' | 'adjustment' | 'payment';
    description: string | null;
    status: 'pending' | 'approved' | 'paid' | 'disputed';
    conversationId: number | null;
    metadata: Record<string, unknown> | null;
    createdAt: string;
}
export interface BillingSummary {
    clientId: number;
    clientName: string;
    totalCharges: number;
    totalPayments: number;
    balance: number;
    charges: Charge[];
}
//# sourceMappingURL=types.d.ts.map