import { useState } from 'react';
import { wallets } from '../api/client';

interface Wallet {
  id: number;
  address: string;
  label: string | null;
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
            placeholder="Label (optional)"
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
        {walletList.map(w => (
          <button
            key={w.id}
            onClick={() => onSelect(w.id)}
            style={{
              padding: '0.5rem',
              borderRadius: '4px',
              border: 'none',
              textAlign: 'left',
              background: selectedWallet === w.id ? '#512da8' : 'transparent',
              color: selectedWallet === w.id ? 'white' : '#e0e0e0',
              cursor: 'pointer',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={w.address}
          >
            {w.label || w.address.slice(0, 8) + '...' + w.address.slice(-4)}
          </button>
        ))}
      </div>
    </div>
  );
}
