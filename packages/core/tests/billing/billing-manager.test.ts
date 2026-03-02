import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BillingManager } from '../../src/billing/billing-manager.js';
import { setupTestDb, cleanupTestDb } from '../helpers.js';
import type { ArvisDatabase } from '../../src/db/database.js';
import type { ArvisConfig } from '../../src/config.js';

describe('BillingManager', () => {
  let db: ArvisDatabase;
  let config: ArvisConfig;
  let billing: BillingManager;

  beforeEach(() => {
    const setup = setupTestDb();
    db = setup.db;
    config = setup.config;
    billing = new BillingManager(db);
  });

  afterEach(() => cleanupTestDb(db, config));

  it('creates a client', () => {
    const client = billing.createClient({ name: 'Acme Corp', slug: 'acme' });
    expect(client.name).toBe('Acme Corp');
    expect(client.slug).toBe('acme');
    expect(client.plan).toBe('per_task');
    expect(client.balance).toBe(0);
  });

  it('prevents duplicate client slugs', () => {
    billing.createClient({ name: 'Acme', slug: 'acme' });
    expect(() => billing.createClient({ name: 'Acme 2', slug: 'acme' })).toThrow('already exists');
  });

  it('updates a client', () => {
    billing.createClient({ name: 'Acme', slug: 'acme' });
    const updated = billing.updateClient('acme', { name: 'Acme Corp', plan: 'monthly' });
    expect(updated.name).toBe('Acme Corp');
    expect(updated.plan).toBe('monthly');
  });

  it('records charges and updates balance', () => {
    const client = billing.createClient({ name: 'Test', slug: 'test' });
    billing.recordCharge({
      clientId: client.id,
      amount: 50,
      type: 'task',
      description: 'Built login page',
    });

    const balance = billing.getBalance(client.id);
    expect(balance).toBe(-50); // Charges decrease balance
  });

  it('payments increase balance', () => {
    const client = billing.createClient({ name: 'Test', slug: 'test' });
    billing.recordCharge({ clientId: client.id, amount: 100, type: 'task', description: 'Work' });
    billing.recordCharge({ clientId: client.id, amount: 100, type: 'payment', description: 'Payment received' });

    expect(billing.getBalance(client.id)).toBe(0);
  });

  it('gets charges filtered by type', () => {
    const client = billing.createClient({ name: 'Test', slug: 'test' });
    billing.recordCharge({ clientId: client.id, amount: 50, type: 'task', description: 'Task 1' });
    billing.recordCharge({ clientId: client.id, amount: 100, type: 'payment', description: 'Payment' });
    billing.recordCharge({ clientId: client.id, amount: 30, type: 'task', description: 'Task 2' });

    const tasks = billing.getCharges(client.id, { type: 'task' });
    expect(tasks).toHaveLength(2);

    const payments = billing.getCharges(client.id, { type: 'payment' });
    expect(payments).toHaveLength(1);
  });

  it('gets all clients', () => {
    billing.createClient({ name: 'A', slug: 'a' });
    billing.createClient({ name: 'B', slug: 'b' });
    expect(billing.getClients()).toHaveLength(2);
  });

  it('monthly summary aggregates correctly', () => {
    const client = billing.createClient({ name: 'Test', slug: 'test' });
    billing.recordCharge({ clientId: client.id, amount: 50, type: 'task', description: 'Task 1' });
    billing.recordCharge({ clientId: client.id, amount: 30, type: 'task', description: 'Task 2' });
    billing.recordCharge({ clientId: client.id, amount: 40, type: 'payment', description: 'Payment' });

    // Use current month format
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const summary = billing.getSummary(client.id, month);

    expect(summary.totalCharges).toBe(80);
    expect(summary.totalPayments).toBe(40);
    expect(summary.charges).toHaveLength(3);
  });
});
