import { useState } from 'react';
import { wallets } from '../api/client';

function SolscanLink({ type, value, children }: { type: 'account' | 'tx' | 'token'; value: string; children: React.ReactNode }) {
  const url = `https://solscan.io/${type}/${value}`;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      style={{ color: '#7c4dff', textDecoration: 'none' }}
      onClick={e => e.stopPropagation()}
    >
      {children}
    </a>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = value;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <span
      onClick={handleCopy}
      title={copied ? 'Copied!' : 'Copy'}
      style={{
        cursor: 'pointer',
        marginLeft: '0.35rem',
        fontSize: '0.75rem',
        color: copied ? '#4caf50' : '#666',
        transition: 'color 0.2s',
        userSelect: 'none',
      }}
    >
      {copied ? '✓' : '⎘'}
    </span>
  );
}

interface Wallet {
  id: number;
  address: string;
  label: string | null;
  notifications_enabled: boolean;
}

export default function WalletList({
  wallets: walletList,
  selectedWallet,
  onSelect,
  onAdded,
}: {
  wallets: Wallet[];
  selectedWallet: number | null;
  onSelect: (id: number | null) => void;
  onAdded: () => void;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [address, setAddress] = useState('');
  const [label, setLabel] = useState('');
  const [error, setError] = useState('');
  const [expandedLabels, setExpandedLabels] = useState<Set<string>>(new Set());
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await wallets.create({ address, label: label || undefined });
      setAddress('');
      setLabel('');
      setShowAdd(false);
      onAdded();
    } catch (err: any) {
      setError(err.message || 'Failed to add wallet');
    }
  };

  const toggleNotifications = async (e: React.MouseEvent, wallet: Wallet) => {
    e.stopPropagation();
    setUpdatingId(wallet.id);
    try {
      await wallets.update(wallet.id, { notifications_enabled: !wallet.notifications_enabled });
      onAdded(); // triggers refresh
    } catch (err) {
      console.error('Failed to toggle notifications:', err);
    } finally {
      setUpdatingId(null);
    }
  };

  const toggleLabel = (label: string) => {
    setExpandedLabels(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  // Group wallets by label
  const grouped = walletList.reduce((acc, w) => {
    const key = w.label || 'Unlabeled';
    if (!acc[key]) acc[key] = [];
    acc[key].push(w);
    return acc;
  }, {} as Record<string, Wallet[]>);

  // Sort labels: Unlabeled last, then alphabetically
  const sortedLabels = Object.keys(grouped).sort((a, b) => {
    if (a === 'Unlabeled') return 1;
    if (b === 'Unlabeled') return -1;
    return a.localeCompare(b);
  });

  return (
    <div style={{ background: '#1a1a1a', borderRadius: '8px', padding: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 600 }}>Wallets</h2>
        <button
          onClick={() => setShowAdd(!showAdd)}
          style={{
            padding: '0.25rem 0.75rem',
            borderRadius: '4px',
            border: 'none',
            background: '#512da8',
            color: 'white',
            fontSize: '0.875rem',
            cursor: 'pointer',
          }}
        >
          {showAdd ? 'Cancel' : 'Add'}
        </button>
      </div>

      {showAdd && (
        <form onSubmit={handleAdd} style={{ marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <input
            placeholder="Solana address"
            value={address}
            onChange={e => setAddress(e.target.value)}
            style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #333', background: '#0f0f0f', color: '#e0e0e0' }}
          />
          <input
            placeholder="Label (e.g. person name, group)"
            value={label}
            onChange={e => setLabel(e.target.value)}
            style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #333', background: '#0f0f0f', color: '#e0e0e0' }}
          />
          {error && <span style={{ color: '#ff4444', fontSize: '0.75rem' }}>{error}</span>}
          <button type="submit" style={{ padding: '0.5rem', borderRadius: '4px', border: 'none', background: '#512da8', color: 'white', cursor: 'pointer' }}>
            Add Wallet
          </button>
        </form>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <button
          onClick={() => onSelect(null)}
          style={{
            padding: '0.5rem',
            borderRadius: '4px',
            border: 'none',
            textAlign: 'left',
            background: selectedWallet === null ? '#512da8' : 'transparent',
            color: selectedWallet === null ? 'white' : '#e0e0e0',
            cursor: 'pointer',
          }}
        >
          All Wallets
        </button>

        {sortedLabels.map(label => {
          const wallets = grouped[label];
          const isExpanded = expandedLabels.has(label);
          const isSelected = wallets.some(w => w.id === selectedWallet);

          return (
            <div key={label}>
              <button
                onClick={() => toggleLabel(label)}
                style={{
                  padding: '0.5rem',
                  borderRadius: '4px',
                  border: 'none',
                  textAlign: 'left',
                  background: isSelected ? '#512da833' : 'transparent',
                  color: '#e0e0e0',
                  cursor: 'pointer',
                  width: '100%',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '0.875rem',
                }}
              >
                <span>
                  <span style={{ marginRight: '0.5rem' }}>{isExpanded ? '▾' : '▸'}</span>
                  <strong>{label}</strong>
                  <span style={{ color: '#666', marginLeft: '0.5rem', fontSize: '0.75rem' }}>
                    {wallets.length} wallet{wallets.length !== 1 ? 's' : ''}
                  </span>
                </span>
              </button>

              {isExpanded && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginLeft: '0.75rem', marginTop: '0.25rem' }}>
                  {wallets.map(w => (
                    <button
                      key={w.id}
                      onClick={() => onSelect(w.id)}
                      style={{
                        padding: '0.5rem',
                        borderRadius: '4px',
                        border: 'none',
                        textAlign: 'left',
                        background: selectedWallet === w.id ? '#512da8' : '#252525',
                        color: selectedWallet === w.id ? 'white' : '#e0e0e0',
                        cursor: 'pointer',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                      title={w.address}
                    >
                      <span>
                        <SolscanLink type="account" value={w.address}>
                          {w.address.slice(0, 6)}...{w.address.slice(-4)}
                        </SolscanLink>
                        <CopyButton value={w.address} />
                      </span>
                      <span
                        onClick={e => toggleNotifications(e, w)}
                        title={w.notifications_enabled ? 'Notifications on' : 'Notifications off'}
                        style={{
                          cursor: 'pointer',
                          fontSize: '0.75rem',
                          color: w.notifications_enabled ? '#4caf50' : '#555',
                          opacity: updatingId === w.id ? 0.5 : 1,
                          transition: 'color 0.2s',
                        }}
                      >
                        {w.notifications_enabled ? '🔔' : '🔕'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
