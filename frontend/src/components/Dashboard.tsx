import { useState, useEffect } from 'react';
import { auth, wallets as walletsApi, transactions as txApi } from '../api/client';
import WalletList from './WalletList';
import TransactionList from './TransactionList';
import Holdings from './Holdings';

interface Wallet {
  id: number;
  address: string;
  label: string | null;
  is_active: boolean;
}

interface TxStats {
  type: string;
  count: string;
  total_usd: string;
}

export default function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [stats, setStats] = useState<TxStats[]>([]);
  const [selectedWallet, setSelectedWallet] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'transactions' | 'holdings'>('transactions');
  const [refreshKey, setRefreshKey] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const doRefresh = () => {
    setRefreshKey(k => k + 1);
    setLastUpdated(new Date());
  };

  useEffect(() => {
    walletsApi.list().then(setWallets);
  }, [refreshKey]);

  useEffect(() => {
    txApi.stats(selectedWallet || undefined).then(setStats);
  }, [selectedWallet, refreshKey]);

  // Auto-poll every 5 minutes (300s)
  useEffect(() => {
    const interval = setInterval(() => {
      doRefresh();
    }, 300000);
    return () => clearInterval(interval);
  }, [selectedWallet]);

  const handleLogout = async () => {
    await auth.logout();
    onLogout();
  };

  const handleWalletAdded = () => doRefresh();

  const timeAgo = (date: Date) => {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    return `${Math.floor(seconds / 3600)}h ago`;
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem 1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 600 }}>Solana Wallet Tracker</h1>
          <div style={{ fontSize: '0.75rem', color: '#666', marginTop: '0.25rem' }}>
            v1.1 — Wallet Analysis Enabled | Last updated: {timeAgo(lastUpdated)}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={doRefresh}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              border: '1px solid #444',
              background: 'transparent',
              color: '#e0e0e0',
              cursor: 'pointer',
              fontSize: '0.875rem',
            }}
          >
            ↻ Refresh
          </button>
          <button
            onClick={handleLogout}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              border: '1px solid #444',
              background: 'transparent',
              color: '#e0e0e0',
              cursor: 'pointer',
              fontSize: '0.875rem',
            }}
          >
            Logout
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '2rem' }}>
        <div>
          <WalletList
            wallets={wallets}
            selectedWallet={selectedWallet}
            onSelect={setSelectedWallet}
            onAdded={handleWalletAdded}
          />

          <div style={{ marginTop: '1.5rem', padding: '1rem', background: '#1a1a1a', borderRadius: '8px' }}>
            <h3 style={{ fontSize: '0.875rem', textTransform: 'uppercase', color: '#888', marginBottom: '0.75rem' }}>Stats</h3>
            {stats.length === 0 && <p style={{ color: '#666', fontSize: '0.875rem' }}>No transactions yet</p>}
            {stats.map(s => (
              <div key={s.type} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
                <span style={{ textTransform: 'capitalize', color: getTypeColor(s.type) }}>{s.type.replace('_', ' ')}</span>
                <span>{s.count} (${parseFloat(s.total_usd).toFixed(2)})</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
            <TabButton active={activeTab === 'transactions'} onClick={() => setActiveTab('transactions')}>
              Transactions
            </TabButton>
            <TabButton active={activeTab === 'holdings'} onClick={() => setActiveTab('holdings')}>
              Holdings
            </TabButton>
          </div>

          {activeTab === 'transactions' ? (
            <TransactionList walletId={selectedWallet} refreshKey={refreshKey} />
          ) : (
            <Holdings walletId={selectedWallet} />
          )}
        </div>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '0.5rem 1rem',
        borderRadius: '6px',
        border: '1px solid #444',
        background: active ? '#512da8' : 'transparent',
        color: '#e0e0e0',
        cursor: 'pointer',
        fontSize: '0.875rem',
        fontWeight: active ? 600 : 400,
        transition: 'background 0.2s',
      }}
    >
      {children}
    </button>
  );
}

function getTypeColor(type: string): string {
  switch (type) {
    case 'buy': return '#4caf50';
    case 'sell': return '#f44336';
    case 'transfer_in': return '#2196f3';
    case 'transfer_out': return '#ff9800';
    case 'internal_transfer': return '#9c27b0';
    default: return '#888';
  }
}
