import { useState, useEffect } from 'react';
import { holdings as holdingsApi } from '../api/client';

function AxiomLink({ mint, children }: { mint: string; children: React.ReactNode }) {
  const url = `https://axiom.trade/meme/${mint}?chain=sol`;
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

interface Holding {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  amount: number;
  price_usd: number | null;
  value_usd: number | null;
  pool_address?: string;
}

export default function Holdings({ walletId }: { walletId: number | null }) {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!walletId) {
      setHoldings([]);
      return;
    }
    setLoading(true);
    holdingsApi.get(walletId)
      .then(setHoldings)
      .catch(() => setHoldings([]))
      .finally(() => setLoading(false));
  }, [walletId]);

  const totalValue = holdings.reduce((sum, h) => sum + (h.value_usd ?? 0), 0);

  const formatAmount = (amount: number, decimals: number = 6) => {
    if (amount === 0) return '0';
    if (amount < 0.001) return amount.toExponential(2);
    return amount.toLocaleString('en-US', { maximumFractionDigits: decimals });
  };

  const formatUsd = (value: number | null) => {
    if (value === null) return '-';
    if (value === 0) return '$0';
    if (value < 0.01) return '$' + value.toExponential(2);
    if (value < 1) return '$' + value.toFixed(4);
    if (value < 1000) return '$' + value.toFixed(2);
    if (value < 1000000) return '$' + (value / 1000).toFixed(1) + 'K';
    return '$' + (value / 1000000).toFixed(1) + 'M';
  };

  if (!walletId) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
        Select a wallet to view holdings
      </div>
    );
  }

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>Loading holdings...</div>;
  }

  if (holdings.length === 0) {
    return <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>No holdings found</div>;
  }

  return (
    <div>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '1rem',
        background: '#1a1a1a',
        borderRadius: '8px',
        marginBottom: '1rem',
      }}>
        <span style={{ fontSize: '0.875rem', color: '#888' }}>Total Portfolio Value</span>
        <span style={{ fontSize: '1.5rem', fontWeight: 600, color: '#4caf50' }}>
          {formatUsd(totalValue)}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {holdings.map(h => {
          const pct = totalValue > 0 && h.value_usd ? (h.value_usd / totalValue) * 100 : 0;
          return (
            <div
              key={h.mint}
              style={{
                background: '#1a1a1a',
                borderRadius: '8px',
                padding: '1rem',
                display: 'grid',
                gridTemplateColumns: '2fr 1fr 1fr 1fr 80px',
                gap: '1rem',
                alignItems: 'center',
              }}
            >
              <div>
                <div style={{ fontWeight: 500 }}>
                  <AxiomLink mint={h.pool_address || h.mint}>
                    {h.symbol}
                  </AxiomLink>
                  <span style={{ color: '#666', marginLeft: '0.5rem', fontSize: '0.875rem' }}>
                    {h.name}
                  </span>
                </div>
                <div style={{ fontSize: '0.75rem', color: '#555', marginTop: '0.25rem' }}>
                  {h.mint.slice(0, 6)}...{h.mint.slice(-4)}
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 500 }}>{formatAmount(h.amount, h.decimals)}</div>
                <div style={{ fontSize: '0.75rem', color: '#666' }}>{h.symbol}</div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 500 }}>{formatUsd(h.price_usd)}</div>
                <div style={{ fontSize: '0.75rem', color: '#666' }}>per token</div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 600, color: h.value_usd && h.value_usd > 0 ? '#4caf50' : '#e0e0e0' }}>
                  {formatUsd(h.value_usd)}
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                {pct > 0 && (
                  <div style={{ fontSize: '0.875rem', color: '#888' }}>{pct.toFixed(1)}%</div>
                )}
                <div style={{
                  height: '4px',
                  background: '#333',
                  borderRadius: '2px',
                  marginTop: '0.25rem',
                  overflow: 'hidden',
                }}>
                  <div style={{
                    width: `${Math.min(pct, 100)}%`,
                    height: '100%',
                    background: '#7c4dff',
                    borderRadius: '2px',
                  }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
