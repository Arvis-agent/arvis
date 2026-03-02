import type { ArvisDatabase } from '../db/database.js';
import type { ClientRow, ChargeRow } from '../db/schema.js';
import type { ClientConfig, Client, Charge, BillingSummary } from './types.js';
import { createLogger } from '../logger.js';

const log = createLogger('billing');

/**
 * Tracks client usage, manages plans, records charges.
 */
export class BillingManager {
  constructor(private db: ArvisDatabase) {}

  /** Create a new client */
  createClient(config: ClientConfig): Client {
    const existing = this.getClient(config.slug);
    if (existing) throw new Error(`Client "${config.slug}" already exists`);

    const result = this.db.run(
      `INSERT INTO clients (name, slug, contact_info, plan, plan_config, notes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      config.name,
      config.slug,
      config.contactInfo ? JSON.stringify(config.contactInfo) : null,
      config.plan ?? 'per_task',
      config.planConfig ? JSON.stringify(config.planConfig) : null,
      config.notes ?? null,
    );

    log.info({ slug: config.slug }, 'Client created');
    return this.getClient(config.slug)!;
  }

  /** Update an existing client */
  updateClient(slug: string, changes: Partial<ClientConfig>): Client {
    const client = this.getClient(slug);
    if (!client) throw new Error(`Client "${slug}" not found`);

    const sets: string[] = [];
    const params: unknown[] = [];

    if (changes.name !== undefined) { sets.push('name = ?'); params.push(changes.name); }
    if (changes.plan !== undefined) { sets.push('plan = ?'); params.push(changes.plan); }
    if (changes.contactInfo !== undefined) { sets.push('contact_info = ?'); params.push(JSON.stringify(changes.contactInfo)); }
    if (changes.planConfig !== undefined) { sets.push('plan_config = ?'); params.push(JSON.stringify(changes.planConfig)); }
    if (changes.notes !== undefined) { sets.push('notes = ?'); params.push(changes.notes); }

    if (sets.length > 0) {
      sets.push("updated_at = datetime('now')");
      params.push(client.id);
      this.db.run(`UPDATE clients SET ${sets.join(', ')} WHERE id = ?`, ...params);
    }

    return this.getClient(slug)!;
  }

  /** Get a client by slug */
  getClient(slug: string): Client | null {
    const row = this.db.get<ClientRow>('SELECT * FROM clients WHERE slug = ?', slug);
    return row ? this.hydrateClient(row) : null;
  }

  /** Get all clients */
  getClients(): Client[] {
    return this.db.all<ClientRow>('SELECT * FROM clients ORDER BY name').map(r => this.hydrateClient(r));
  }

  /** Record a charge (charge insert + balance update are atomic) */
  recordCharge(charge: {
    clientId: number;
    agentId?: number;
    amount: number;
    type: Charge['type'];
    description: string;
    conversationId?: number;
    metadata?: Record<string, unknown>;
  }): Charge {
    const balanceChange = charge.type === 'payment' ? charge.amount : -charge.amount;
    let id!: number;

    this.db.transaction(() => {
      const result = this.db.run(
        `INSERT INTO charges (client_id, agent_id, amount, type, description, conversation_id, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        charge.clientId,
        charge.agentId ?? null,
        charge.amount,
        charge.type,
        charge.description,
        charge.conversationId ?? null,
        charge.metadata ? JSON.stringify(charge.metadata) : null,
      );
      id = Number(result.lastInsertRowid);

      this.db.run(
        'UPDATE clients SET balance = balance + ? WHERE id = ?',
        balanceChange, charge.clientId,
      );
    });

    log.debug({ chargeId: id, clientId: charge.clientId, type: charge.type, amount: charge.amount }, 'Charge recorded');
    return this.getChargeById(id)!;
  }

  /** Get client balance */
  getBalance(clientId: number): number {
    const row = this.db.get<{ balance: number }>('SELECT balance FROM clients WHERE id = ?', clientId);
    return row?.balance ?? 0;
  }

  /** Get charges for a client */
  getCharges(clientId: number, options?: { since?: Date; type?: string }): Charge[] {
    let sql = 'SELECT * FROM charges WHERE client_id = ?';
    const params: unknown[] = [clientId];

    if (options?.since) {
      sql += ' AND created_at >= ?';
      params.push(options.since.toISOString());
    }
    if (options?.type) {
      sql += ' AND type = ?';
      params.push(options.type);
    }

    sql += ' ORDER BY created_at DESC';
    return this.db.all<ChargeRow>(sql, ...params).map(r => this.hydrateCharge(r));
  }

  /** Get monthly billing summary for a client */
  getSummary(clientId: number, month: string): BillingSummary {
    const client = this.db.get<ClientRow>('SELECT * FROM clients WHERE id = ?', clientId);
    if (!client) throw new Error(`Client ID ${clientId} not found`);

    const startDate = `${month}-01`;
    const [year, monthNum] = month.split('-').map(Number);
    const nextMonth = monthNum === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(monthNum + 1).padStart(2, '0')}-01`;

    const charges = this.db.all<ChargeRow>(
      `SELECT * FROM charges WHERE client_id = ? AND created_at >= ? AND created_at < ?
       ORDER BY created_at`,
      clientId, startDate, nextMonth,
    );

    const totalCharges = charges
      .filter(c => c.type !== 'payment')
      .reduce((sum, c) => sum + c.amount, 0);

    const totalPayments = charges
      .filter(c => c.type === 'payment')
      .reduce((sum, c) => sum + c.amount, 0);

    return {
      clientId,
      clientName: client.name,
      totalCharges,
      totalPayments,
      balance: client.balance,
      charges: charges.map(r => this.hydrateCharge(r)),
    };
  }

  private getChargeById(id: number): Charge | undefined {
    const row = this.db.get<ChargeRow>('SELECT * FROM charges WHERE id = ?', id);
    return row ? this.hydrateCharge(row) : undefined;
  }

  private hydrateClient(row: ClientRow): Client {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      contactInfo: row.contact_info ? JSON.parse(row.contact_info) : null,
      plan: row.plan,
      planConfig: row.plan_config ? JSON.parse(row.plan_config) : null,
      balance: row.balance,
      status: row.status,
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private hydrateCharge(row: ChargeRow): Charge {
    return {
      id: row.id,
      clientId: row.client_id,
      agentId: row.agent_id,
      amount: row.amount,
      type: row.type,
      description: row.description,
      status: row.status,
      conversationId: row.conversation_id,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
      createdAt: row.created_at,
    };
  }
}
