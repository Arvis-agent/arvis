'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Terminal, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.ok) { router.push('/'); router.refresh(); }
      else { setError('Invalid password'); setLoading(false); }
    } catch {
      setError('Connection failed');
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-[320px] space-y-8">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md border border-primary/20 bg-primary/10">
            <Terminal className="h-5 w-5 text-primary" />
          </div>
          <div className="text-center">
            <h1 className="font-pixel text-lg">ARVIS</h1>
            <p className="mt-1 text-sm text-muted-foreground">Enter dashboard password</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <label htmlFor="password" className="sr-only">Password</label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoFocus
            aria-describedby={error ? 'login-error' : undefined}
          />
          {error && <p id="login-error" role="alert" className="text-sm text-red-400">{error}</p>}
          <Button type="submit" variant="primary" disabled={loading || !password} className="w-full">
            {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Authenticating...</> : 'Continue'}
          </Button>
        </form>

        <p className="text-center text-xs text-muted-foreground">
          Protected access
        </p>
      </div>
    </div>
  );
}
