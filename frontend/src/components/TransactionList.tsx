import { useState, useEffect } from 'react';
import { transactions as txApi } from '../api/client';

function AxiomLink({ mint, children, style: customStyle }: { mint: string; children: React.ReactNode; style?: React.CSSProperties }) {
  const url = `https://axiom.trade/meme/${mint}?chain=sol`;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      style={{ color: '#7c4dff', textDecoration: 'none', ...customStyle }}
      onClick={e => e.stopPropagation()}
    >
      {children}
    </a>
  );
}

function SolscanLink({ type, value, children, style: customStyle }: { type: 'account' | 'tx'; value: string; children: React.ReactNode; style?: React.CSSProperties }) {
  const url = `https://solscan.io/${type}/${value}`;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      style={{ color: '#7c4dff', textDecoration: 'none', ...customStyle }}
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
        marginLeft: '0.25rem',
        fontSize: '0.7rem',
        color: copied ? '#4caf50' : '#555',
        transition: 'color 0.2s',
        userSelect: 'none',
      }}
    >
      {copied ? '✓' : '⎘'}
    </span>
  );
}

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
  token_mint: string;
  token_pool_address?: string;
}

export default function TransactionList({ walletId, refreshKey }: { walletId: number | null; refreshKey?: number }) {
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [filter, setFilter] = useState('');
  const [showSpam, setShowSpam] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  const fetchTxs = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await txApi.list({
        wallet_id: walletId || undefined,
        type: filter || undefined,
        show_spam: showSpam,
      });
      setTxs(data);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // Initial load + filter/wallet change (shows spinner)
  useEffect(() => {
    fetchTxs(false);
    setIsInitialLoad(false);
  }, [walletId, filter, showSpam]);

  // Silent refresh from polling (no spinner, no UI shift)
  useEffect(() => {
    if (!isInitialLoad && refreshKey !== undefined) {
      fetchTxs(true);
    }
  }, [refreshKey]);

  const formatAmount = (amount: string, decimals: number = 6) => {
    const num = parseFloat(amount);
    if (num === 0) return '0';
    if (num < 0.001) return num.toExponential(2);
    return num.toLocaleString('en-US', { maximumFractionDigits: decimals });
  };

  const formatAddress = (addr: string) => addr.slice(0, 6) + '...' + addr.slice(-4);

  const formatUsd = (value: string | null) => {
    if (!value) return '-';
    const num = parseFloat(value);
    if (num === 0) return '$0';
    if (num < 0.01) return '$' + num.toExponential(2);
    if (num < 1) return '$' + num.toFixed(4);
    if (num < 1000) return '$' + num.toFixed(2);
    if (num < 1000000) return '$' + (num / 1000).toFixed(1) + 'K';
    return '$' + (num / 1000000).toFixed(1) + 'M';
  };

  const getTypeStyle = (type: string) => {
    switch (type) {
      case 'buy': return { color: '#4caf50', bg: '#1b5e20' };
      case 'sell': return { color: '#f44336', bg: '#b71c1c' };
      case 'transfer_in': return { color: '#2196f3', bg: '#0d47a1' };
      case 'transfer_out': return { color: '#ff9800', bg: '#e65100' };
      case 'internal_transfer': return { color: '#9c27b0', bg: '#4a148c' };
      case 'liquidity_add': return { color: '#00bcd4', bg: '#006064' };
      case 'liquidity_remove': return { color: '#e91e63', bg: '#880e4f' };
      default: return { color: '#888', bg: '#333' };
    }
  };

  // Group by date (descending)
  const groupedByDate = txs.reduce((groups, tx) => {
    const date = new Date(tx.timestamp).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    if (!groups[date]) groups[date] = [];
    groups[date].push(tx);
    return groups;
  }, {} as Record<string, Transaction[]>);

  const sortedDates = Object.keys(groupedByDate).sort(
    (a, b) =>
      new Date(groupedByDate[b][0].timestamp).getTime() -
      new Date(groupedByDate[a][0].timestamp).getTime()
  );

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
          <option value="liquidity_add">Add Liquidity</option>
          <option value="liquidity_remove">Remove Liquidity</option>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {sortedDates.map(date => {
            const dateTxs = groupedByDate[date];
            const buyTotal = dateTxs
              .filter(t => t.type === 'buy')
              .reduce((s, t) => s + (parseFloat(t.usd_value || '0')), 0);
            const sellTotal = dateTxs
              .filter(t => t.type === 'sell')
              .reduce((s, t) => s + (parseFloat(t.usd_value || '0')), 0);
            const pnl = sellTotal - buyTotal;

            return (
              <div key={date}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.75rem 1rem',
                  background: '#2a2a2a',
                  borderRadius: '8px',
                  marginBottom: '0.5rem',
                }}>
                  <span style={{ fontWeight: 600, fontSize: '1rem' }}>{date}</span>
                  <span style={{ fontSize: '0.875rem', color: '#888' }}>
                    {dateTxs.length} txs
                    {buyTotal > 0 && (
                      <span style={{ color: '#f44336', marginLeft: '0.75rem' }}>
                        -${buyTotal.toFixed(2)}
                      </span>
                    )}
                    {sellTotal > 0 && (
                      <span style={{ color: '#4caf50', marginLeft: '0.75rem' }}>
                        +${sellTotal.toFixed(2)}
                      </span>
                    )}
                    {pnl !== 0 && (
                      <span style={{ color: pnl >= 0 ? '#4caf50' : '#f44336', marginLeft: '0.75rem', fontWeight: 600 }}>
                        PnL: {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
                      </span>
                    )}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {dateTxs.map(tx => {
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
                          <div style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span>{formatAmount(tx.amount)}</span>
                            {tx.token_mint ? (
                              <>
                                <AxiomLink mint={tx.token_pool_address || tx.token_mint}>
                                  {tx.token_symbol}
                                </AxiomLink>
                                <CopyButton value={tx.token_mint} />
                              </>
                            ) : (
                              tx.token_symbol
                            )}
                            {tx.token_name && tx.token_name !== tx.token_symbol && (
                              <span style={{ color: '#666', fontSize: '0.875rem' }}>({tx.token_name})</span>
                            )}
                          </div>
                          {tx.counterparty_symbol && (
                            <div style={{ fontSize: '0.75rem', color: '#888', marginTop: '0.25rem' }}>
                              for {tx.counterparty_amount ? formatAmount(tx.counterparty_amount) : '?'} {tx.counterparty_symbol}
                            </div>
                          )}
                          <div style={{ fontSize: '0.75rem', color: '#666', marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <SolscanLink type="account" value={tx.from_address}>
                              {formatAddress(tx.from_address)}
                            </SolscanLink>
                            <CopyButton value={tx.from_address} />
                            <span>→</span>
                            <SolscanLink type="account" value={tx.to_address}>
                              {formatAddress(tx.to_address)}
                            </SolscanLink>
                            <CopyButton value={tx.to_address} />
                          </div>
                          <div style={{ fontSize: '0.75rem', marginTop: '0.25rem', display: 'flex', alignItems: 'center' }}>
                            <SolscanLink type="tx" value={tx.signature} style={{ fontSize: '0.7rem', color: '#555' }}>
                              {tx.signature.slice(0, 16)}...{tx.signature.slice(-8)}
                            </SolscanLink>
                            <CopyButton value={tx.signature} />
                          </div>
                        </div>

                        <div style={{ textAlign: 'right', fontSize: '0.875rem' }}>
                          {formatUsd(tx.usd_value)}
                        </div>

                        <div style={{ textAlign: 'right', fontSize: '0.75rem', color: '#888' }}>
                          {tx.wallet_label || 'Unknown'}
                        </div>

                        <div style={{ textAlign: 'right', fontSize: '0.75rem', color: '#666' }}>
                          {new Date(tx.timestamp).toLocaleTimeString()}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
