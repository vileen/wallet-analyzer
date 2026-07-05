import { useState, useEffect, useMemo } from 'react';
import { holdings as holdingsApi } from '../api/client';

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

function SolscanLink({ mint, children }: { mint: string; children: React.ReactNode }) {
  const url = `https://solscan.io/token/${mint}`;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      style={{ color: '#14f195', textDecoration: 'none' }}
      onClick={e => e.stopPropagation()}
    >
      {children}
    </a>
  );
}

export default function Holdings({ walletId }: { walletId: number | null }) {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedMint, setExpandedMint] = useState<string | null>(null);

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

  const filteredHoldings = useMemo(() => {
    if (!searchTerm) return holdings;
    const term = searchTerm.toLowerCase();
    return holdings.filter(h =>
      h.symbol.toLowerCase().includes(term) ||
      h.name.toLowerCase().includes(term) ||
      h.mint.toLowerCase().includes(term)
    );
  }, [holdings, searchTerm]);

  const totalValue = holdings.reduce((sum, h) => sum + (h.value_usd ?? 0), 0);
  const solHolding = holdings.find(h => h.mint === 'So11111111111111111111111111111111111111112');
  const tokenHoldings = holdings.filter(h => h.mint !== 'So11111111111111111111111111111111111111112');
  const tokenCount = tokenHoldings.length;
  const tokensWithValue = tokenHoldings.filter(h => (h.value_usd ?? 0) > 0).length;

  // Top 5 holdings for allocation bar
  const topHoldings = [...holdings]
    .filter(h => (h.value_usd ?? 0) > 0)
    .sort((a, b) => (b.value_usd ?? 0) - (a.value_usd ?? 0))
    .slice(0, 5);

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

  const getAllocationColor = (index: number) => {
    const colors = ['#7c4dff', '#4caf50', '#ff9800', '#f44336', '#2196f3', '#9c27b0', '#00bcd4'];
    return colors[index % colors.length];
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
      {/* Portfolio Overview */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '1rem',
        marginBottom: '1.5rem',
      }}>
        <StatCard title="Total Value" value={formatUsd(totalValue)} color="#4caf50" />
        <StatCard title="SOL Balance" value={solHolding ? formatAmount(solHolding.amount, 9) + ' SOL' : '0 SOL'} color="#14f195" />
        <StatCard title="Token Count" value={`${tokenCount} tokens`} color="#7c4dff" />
        <StatCard title="Tracked Value" value={`${tokensWithValue} priced`} color="#ff9800" />
      </div>

      {/* Allocation Bar */}
      {topHoldings.length > 0 && (
        <div style={{ background: '#1a1a1a', borderRadius: '8px', padding: '1rem', marginBottom: '1rem' }}>
          <div style={{ fontSize: '0.875rem', color: '#888', marginBottom: '0.5rem' }}>Top Holdings</div>
          <div style={{ display: 'flex', height: '24px', borderRadius: '4px', overflow: 'hidden' }}>
            {topHoldings.map((h, i) => {
              const pct = totalValue > 0 ? ((h.value_usd ?? 0) / totalValue) * 100 : 0;
              return (
                <div
                  key={h.mint}
                  style={{
                    width: `${pct}%`,
                    background: getAllocationColor(i),
                    transition: 'width 0.3s',
                  }}
                  title={`${h.symbol}: ${formatUsd(h.value_usd)} (${pct.toFixed(1)}%)`}
                />
              );
            })}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginTop: '0.5rem' }}>
            {topHoldings.map((h, i) => {
              const pct = totalValue > 0 ? ((h.value_usd ?? 0) / totalValue) * 100 : 0;
              return (
                <div key={h.mint} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: getAllocationColor(i) }} />
                  <span style={{ color: '#ccc' }}>{h.symbol}</span>
                  <span style={{ color: '#888' }}>{pct.toFixed(1)}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Search Bar */}
      <div style={{ marginBottom: '1rem' }}>
        <input
          type="text"
          placeholder="Search tokens by name, symbol, or mint..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          style={{
            width: '100%',
            padding: '0.75rem 1rem',
            borderRadius: '8px',
            border: '1px solid #333',
            background: '#1a1a1a',
            color: '#e0e0e0',
            fontSize: '0.875rem',
            outline: 'none',
          }}
        />
      </div>

      {/* Holdings List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {filteredHoldings.map(h => {
          const pct = totalValue > 0 && h.value_usd ? (h.value_usd / totalValue) * 100 : 0;
          const isExpanded = expandedMint === h.mint;
          const isSol = h.mint === 'So11111111111111111111111111111111111111112';

          return (
            <div
              key={h.mint}
              style={{
                background: '#1a1a1a',
                borderRadius: '8px',
                overflow: 'hidden',
                border: isExpanded ? '1px solid #444' : '1px solid transparent',
              }}
            >
              {/* Main Row */}
              <div
                onClick={() => setExpandedMint(isExpanded ? null : h.mint)}
                style={{
                  padding: '1rem',
                  display: 'grid',
                  gridTemplateColumns: '2fr 1fr 1fr 1fr 80px',
                  gap: '1rem',
                  alignItems: 'center',
                  cursor: 'pointer',
                }}
              >
                <div>
                  <div style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <AxiomLink mint={h.pool_address || h.mint}>
                      {h.symbol}
                    </AxiomLink>
                    <span style={{ color: '#666', fontSize: '0.875rem', fontWeight: 400 }}>
                      {h.name}
                    </span>
                    {isSol && <span style={{ fontSize: '0.625rem', background: '#14f19533', color: '#14f195', padding: '1px 6px', borderRadius: '4px' }}>SOL</span>}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#555', marginTop: '0.25rem' }}>
                    <SolscanLink mint={h.mint}>
                      {h.mint.slice(0, 8)}...{h.mint.slice(-4)}
                    </SolscanLink>
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
                      background: isSol ? '#14f195' : '#7c4dff',
                      borderRadius: '2px',
                    }} />
                  </div>
                </div>
              </div>

              {/* Expanded Details */}
              {isExpanded && (
                <div style={{ padding: '0 1rem 1rem', borderTop: '1px solid #333' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', paddingTop: '1rem' }}>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: '#888', marginBottom: '0.25rem' }}>Full Mint Address</div>
                      <div style={{ fontSize: '0.875rem', color: '#ccc', wordBreak: 'break-all' }}>{h.mint}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: '#888', marginBottom: '0.25rem' }}>Raw Amount</div>
                      <div style={{ fontSize: '0.875rem', color: '#ccc' }}>{h.amount.toLocaleString('en-US', { maximumFractionDigits: h.decimals })}</div>
                    </div>
                    {h.pool_address && (
                      <div>
                        <div style={{ fontSize: '0.75rem', color: '#888', marginBottom: '0.25rem' }}>Pool Address</div>
                        <div style={{ fontSize: '0.875rem', color: '#ccc', wordBreak: 'break-all' }}>
                          <AxiomLink mint={h.pool_address}>{h.pool_address}</AxiomLink>
                        </div>
                      </div>
                    )}
                    <div>
                      <div style={{ fontSize: '0.75rem', color: '#888', marginBottom: '0.25rem' }}>Links</div>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <AxiomLink mint={h.pool_address || h.mint}>
                          <span style={{ fontSize: '0.75rem', padding: '2px 8px', background: '#7c4dff33', borderRadius: '4px' }}>Axiom</span>
                        </AxiomLink>
                        <SolscanLink mint={h.mint}>
                          <span style={{ fontSize: '0.75rem', padding: '2px 8px', background: '#14f19533', borderRadius: '4px' }}>Solscan</span>
                        </SolscanLink>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filteredHoldings.length === 0 && searchTerm && (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
          No tokens match "{searchTerm}"
        </div>
      )}
    </div>
  );
}

function StatCard({ title, value, color }: { title: string; value: string; color: string }) {
  return (
    <div style={{
      background: '#1a1a1a',
      borderRadius: '8px',
      padding: '1rem',
      borderLeft: `3px solid ${color}`,
    }}>
      <div style={{ fontSize: '0.75rem', color: '#888', textTransform: 'uppercase', marginBottom: '0.25rem' }}>{title}</div>
      <div style={{ fontSize: '1.25rem', fontWeight: 600, color }}>{value}</div>
    </div>
  );
}
