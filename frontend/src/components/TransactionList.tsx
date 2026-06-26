import { useState, useEffect } from 'react';
import { transactions as txApi } from '../api/client';

interface Transaction {
  id: number;
  signature: string;
  type: string;
  token_symbol: string;
  token_name: string;
  amount: string;
  usd_value: string | null;
  counterparty_symbol: string | null;
  counterparty_amount: string | null;
  from_address: string;
  to_address: string;
  timestamp: string;
  wallet_label: string | null;
}

export default function TransactionList({ walletId }: { walletId: number | null }) {
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [filter, setFilter] = useState('');
  const [showSpam, setShowSpam] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    txApi.list({ wallet_id: walletId || undefined, type: filter || undefined, show_spam: showSpam })
      .then(setTxs)
      .finally(() => setLoading(false));
  }, [walletId, filter, showSpam]);

  const formatAmount = (amount: string, decimals: number = 6) => {
    const num = parseFloat(amount);
    if (num === 0) return '0';
    if (num < 0.001) return num.toExponential(2);
    return num.toLocaleString('en-US', { maximumFractionDigits: decimals });
  };

  const formatAddress = (addr: string) => addr.slice(0, 6) + '...' + addr.slice(-4);

  const getTypeStyle = (type: string) => {
    switch (type) {
      case 'buy': return { color: '#4caf50', bg: '#1b5e20' };
      case 'sell': return { color: '#f44336', bg: '#b71c1c' };
      case 'transfer_in': return { color: '#2196f3', bg: '#0d47a1' };
      case 'transfer_out': return { color: '#ff9800', bg: '#e65100' };
      case 'internal_transfer': return { color: '#9c27b0', bg: '#4a148c' };
      default: return { color: '#888', bg: '#333' };
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <select
          value={filter}
          onChange={e => setFilter(e.target.value)}
          style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #333', background: '#1a1a1a', color: '#e0e0e0' }}
        >
          <option value="">All Types</option>
          <option value="buy">Buy</option>
          <option value="sell">Sell</option>
          <option value="transfer_in">Transfer In</option>
          <option value="transfer_out">Transfer Out</option>
          <option value="internal_transfer">Internal</option>
        </select>

        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.875rem' }}>
          <input
            type="checkbox"
            checked={showSpam}
            onChange={e => setShowSpam(e.target.checked)}
          />
          Show spam
        </label>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>Loading...</div>
      ) : txs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>No transactions found</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {txs.map(tx => {
            const style = getTypeStyle(tx.type);
            return (
              <div
                key={tx.id}
                style={{
                  background: '#1a1a1a',
                  borderRadius: '8px',
                  padding: '1rem',
                  display: 'grid',
                  gridTemplateColumns: '100px 1fr 150px 120px 100px',
                  gap: '1rem',
                  alignItems: 'center',
                }}
              >
                <span style={{
                  padding: '0.25rem 0.5rem',
                  borderRadius: '4px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  background: style.bg,
                  color: style.color,
                  textAlign: 'center',
                }}>
                  {tx.type.replace('_', ' ')}
                </span>

                <div style={{ overflow: 'hidden' }}>
                  <div style={{ fontWeight: 500 }}>
                    {formatAmount(tx.amount)} {tx.token_symbol}
                    {tx.token_name && tx.token_name !== tx.token_symbol && (
                      <span style={{ color: '#666', marginLeft: '0.5rem', fontSize: '0.875rem' }}>({tx.token_name})</span>
                    )}
                  </div>
                  {tx.counterparty_symbol && (
                    <div style={{ fontSize: '0.75rem', color: '#888', marginTop: '0.25rem' }}>
                      for {tx.counterparty_amount ? formatAmount(tx.counterparty_amount) : '?'} {tx.counterparty_symbol}
                    </div>
                  )}
                  <div style={{ fontSize: '0.75rem', color: '#666', marginTop: '0.25rem' }}>
                    {formatAddress(tx.from_address)} → {formatAddress(tx.to_address)}
                  </div>
                </div>

                <div style={{ textAlign: 'right', fontSize: '0.875rem' }}>
                  {tx.usd_value ? `$${parseFloat(tx.usd_value).toFixed(2)}` : '-'}
                </div>

                <div style={{ textAlign: 'right', fontSize: '0.75rem', color: '#888' }}>
                  {tx.wallet_label || 'Unknown'}
                </div>

                <div style={{ textAlign: 'right', fontSize: '0.75rem', color: '#666' }}>
                  {new Date(tx.timestamp).toLocaleDateString()}
                  <br />
                  {new Date(tx.timestamp).toLocaleTimeString()}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
