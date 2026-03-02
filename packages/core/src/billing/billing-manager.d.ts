import type { ArvisDatabase } from '../db/database.js';
import type { ClientConfig, Client, Charge, BillingSummary } from './types.js';
/**
 * Tracks client usage, manages plans, records charges.
 */
export declare class BillingManager {
    private db;
    constructor(db: ArvisDatabase);
    /** Create a new client */
    createClient(config: ClientConfig): Client;
    /** Update an existing client */
    updateClient(slug: string, changes: Partial<ClientConfig>): Client;
    /** Get a client by slug */
    getClient(slug: string): Client | null;
    /** Get all clients */
    getClients(): Client[];
    /** Record a charge */
    recordCharge(charge: {
        clientId: number;
        agentId?: number;
        amount: number;
        type: Charge['type'];
        description: string;
        conversationId?: number;
        metadata?: Record<string, unknown>;
    }): Charge;
    /** Get client balance */
    getBalance(clientId: number): number;
    /** Get charges for a client */
    getCharges(clientId: number, options?: {
        since?: Date;
        type?: string;
    }): Charge[];
    /** Get monthly billing summary for a client */
    getSummary(clientId: number, month: string): BillingSummary;
    private getChargeById;
    private hydrateClient;
    private hydrateCharge;
}
//# sourceMappingURL=billing-manager.d.ts.map