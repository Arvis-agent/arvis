import { createLogger } from '../logger.js';
const log = createLogger('billing');
/**
 * Tracks client usage, manages plans, records charges.
 */
export class BillingManager {
    db;
    constructor(db) {
        this.db = db;
    }
    /** Create a new client */
    createClient(config) {
        const existing = this.getClient(config.slug);
        if (existing)
            throw new Error(`Client "${config.slug}" already exists`);
        const result = this.db.run(`INSERT INTO clients (name, slug, contact_info, plan, plan_config, notes)
       VALUES (?, ?, ?, ?, ?, ?)`, config.name, config.slug, config.contactInfo ? JSON.stringify(config.contactInfo) : null, config.plan ?? 'per_task', config.planConfig ? JSON.stringify(config.planConfig) : null, config.notes ?? null);
        log.info({ slug: config.slug }, 'Client created');
        return this.getClient(config.slug);
    }
    /** Update an existing client */
    updateClient(slug, changes) {
        const client = this.getClient(slug);
        if (!client)
            throw new Error(`Client "${slug}" not found`);
        const sets = [];
        const params = [];
        if (changes.name !== undefined) {
            sets.push('name = ?');
            params.push(changes.name);
        }
        if (changes.plan !== undefined) {
            sets.push('plan = ?');
            params.push(changes.plan);
        }
        if (changes.contactInfo !== undefined) {
            sets.push('contact_info = ?');
            params.push(JSON.stringify(changes.contactInfo));
        }
        if (changes.planConfig !== undefined) {
            sets.push('plan_config = ?');
            params.push(JSON.stringify(changes.planConfig));
        }
        if (changes.notes !== undefined) {
            sets.push('notes = ?');
            params.push(changes.notes);
        }
        if (sets.length > 0) {
            sets.push("updated_at = datetime('now')");
            params.push(client.id);
            this.db.run(`UPDATE clients SET ${sets.join(', ')} WHERE id = ?`, ...params);
        }
        return this.getClient(slug);
    }
    /** Get a client by slug */
    getClient(slug) {
        const row = this.db.get('SELECT * FROM clients WHERE slug = ?', slug);
        return row ? this.hydrateClient(row) : null;
    }
    /** Get all clients */
    getClients() {
        return this.db.all('SELECT * FROM clients ORDER BY name').map(r => this.hydrateClient(r));
    }
    /** Record a charge */
    recordCharge(charge) {
        const result = this.db.run(`INSERT INTO charges (client_id, agent_id, amount, type, description, conversation_id, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?)`, charge.clientId, charge.agentId ?? null, charge.amount, charge.type, charge.description, charge.conversationId ?? null, charge.metadata ? JSON.stringify(charge.metadata) : null);
        // Update client balance
        const balanceChange = charge.type === 'payment' ? charge.amount : -charge.amount;
        this.db.run('UPDATE clients SET balance = balance + ? WHERE id = ?', balanceChange, charge.clientId);
        const id = Number(result.lastInsertRowid);
        log.debug({ chargeId: id, clientId: charge.clientId, type: charge.type, amount: charge.amount }, 'Charge recorded');
        return this.getChargeById(id);
    }
    /** Get client balance */
    getBalance(clientId) {
        const row = this.db.get('SELECT balance FROM clients WHERE id = ?', clientId);
        return row?.balance ?? 0;
    }
    /** Get charges for a client */
    getCharges(clientId, options) {
        let sql = 'SELECT * FROM charges WHERE client_id = ?';
        const params = [clientId];
        if (options?.since) {
            sql += ' AND created_at >= ?';
            params.push(options.since.toISOString());
        }
        if (options?.type) {
            sql += ' AND type = ?';
            params.push(options.type);
        }
        sql += ' ORDER BY created_at DESC';
        return this.db.all(sql, ...params).map(r => this.hydrateCharge(r));
    }
    /** Get monthly billing summary for a client */
    getSummary(clientId, month) {
        const client = this.db.get('SELECT * FROM clients WHERE id = ?', clientId);
        if (!client)
            throw new Error(`Client ID ${clientId} not found`);
        const startDate = `${month}-01`;
        const endDate = `${month}-31`;
        const charges = this.db.all(`SELECT * FROM charges WHERE client_id = ? AND created_at >= ? AND created_at <= ?
       ORDER BY created_at`, clientId, startDate, endDate);
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
    getChargeById(id) {
        const row = this.db.get('SELECT * FROM charges WHERE id = ?', id);
        return row ? this.hydrateCharge(row) : undefined;
    }
    hydrateClient(row) {
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
    hydrateCharge(row) {
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
//# sourceMappingURL=billing-manager.js.map