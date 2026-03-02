'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { toast } from '@/components/ui/toaster';
import { OrchestratorSection } from './_sections/orchestrator-section';
import { AccountsSection } from './_sections/accounts-section';
import { BotsSection } from './_sections/bots-section';
import { WebhooksSection } from './_sections/webhooks-section';
import { HealthSection } from './_sections/health-section';
import type { Agent, Account, BotInstance, WebhookEntry, HealthData } from './_sections/types';

export default function SettingsPage() {
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [bots, setBots] = useState<BotInstance[] | null>(null);
  const [webhooks, setWebhooks] = useState<WebhookEntry[] | null>(null);
  const [conductorId, setConductorId] = useState<number | null>(null);
  const [savingConductor, setSavingConductor] = useState(false);
  const [health, setHealth] = useState<HealthData | null>(null);
  const [connectorStatus, setConnectorStatus] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    try {
      const [a, h, ag, cfg, conn, b, wh] = await Promise.all([
        fetch('/api/accounts').then((r) => r.json()),
        fetch('/api/health').then((r) => r.json()),
        fetch('/api/agents').then((r) => r.json()),
        fetch('/api/settings').then((r) => r.json()),
        fetch('/api/connectors').then((r) => r.json()).catch(() => ({ configured: {} })),
        fetch('/api/bots').then((r) => r.json()).catch(() => []),
        fetch('/api/webhooks').then((r) => r.json()).catch(() => []),
      ]);

      if (conn.configured) setConnectorStatus(conn.configured as Record<string, boolean>);
      setAccounts(a.accounts ?? []);
      setHealth(h);
      setBots(Array.isArray(b) ? b : []);
      setWebhooks(Array.isArray(wh) ? wh : []);

      const agentList: Agent[] = Array.isArray(ag) ? ag : [];
      setAgents(agentList);

      const existingConductor: number | null = cfg.conductorAgentId ?? null;
      setConductorId(existingConductor);

      // Auto-select conductor if not set
      if (existingConductor === null) {
        const active = agentList.filter((x) => x.status !== 'archived');
        const pick = active.find((x) => x.role === 'orchestrator') ?? (active.length === 1 ? active[0] : null);
        if (pick) {
          await fetch('/api/settings', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ conductorAgentId: pick.id }),
          });
          setConductorId(pick.id);
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function saveConductor(id: number | null) {
    setSavingConductor(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conductorAgentId: id }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setConductorId(id);
      toast.success(id ? 'Conductor updated' : 'Conductor cleared');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSavingConductor(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-base font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Accounts, connectors and system configuration</p>
      </div>

      <OrchestratorSection
        agents={agents}
        conductorId={conductorId}
        savingConductor={savingConductor}
        onSaveConductor={saveConductor}
        onReload={load}
      />

      <BotsSection
        bots={bots}
        agents={agents}
        onReload={load}
      />

      <WebhooksSection
        webhooks={webhooks}
        agents={agents}
        onReload={load}
      />

      <AccountsSection
        accounts={accounts}
        onReload={load}
      />

      <HealthSection
        health={health}
        connectorStatus={connectorStatus}
      />
    </div>
  );
}
