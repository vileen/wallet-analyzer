import { useState, useEffect, useMemo } from 'react';
import { holdings as holdingsApi } from '../api/client';

interface HoldingItem {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  amount: number | string;
  price_usd: number | string | null;
  value_usd: number | string | null;
  pool_address?: string;
}

interface HoldingChange {
  mint: string;
  symbol: string;
  change_amount: number | string;
  change_value_usd: number | string | null;
  direction: 'inflow' | 'outflow' | 'new' | 'removed';
  previous_amount: number | string | null;
  current_amount: number | string;
}

interface HoldingsResponse {
  id: number;
  wallet_id: number;
  snapshot_at: string;
  total_value_usd: number | string | null;
  sol_balance: number | string | null;
  items: HoldingItem[];
  changes: HoldingChange[];
  baseline_changes: HoldingChange[];
  baseline_days: number;
  baseline_snapshot_at: string | null;
  previous_snapshot_at: string | null;
}

function AxiomLink({ mint, children }: { mint: string; children: React.ReactNode }) {
  const url = `https://axiom.trade/meme/${mint}?chain=sol`;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: '#7c4dff', textDecoration: 'none' }} onClick={e => e.stopPropagation()}>
      {children}
    </a>
  );
}

function SolscanLink({ mint, children }: { mint: string; children: React.ReactNode }) {
  const url = `https://solscan.io/token/${mint}`;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: '#14f195', textDecoration: 'none' }} onClick={e => e.stopPropagation()}>
      {children}
    </a>
  );
}

function toNum(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'string') return parseFloat(v);
  return v;
}

export default function Holdings({ walletId }: { walletId: number | null }) {
  const [data, setData] = useState<HoldingsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedMint, setExpandedMint] = useState<string | null>(null);
  const [compareDays, setCompareDays] = useState(1);

  const fetchData = async (forceRefresh = false) => {
    if (!walletId) return;
    setLoading(true);
    try {
      const params: { refresh?: string; compare?: string } = {};
      if (forceRefresh) params.refresh = 'true';
      params.compare = String(compareDays);
      const result = await holdingsApi.get(walletId, params);
      setData(result);
    } catch (err) {
      console.error('Failed to fetch holdings:', err);
    } finally {
      setLoading(false);
    }
  };

  const doRefresh = async () => {
    if (!walletId) return;
    setRefreshing(true);
    try {
      const result = await holdingsApi.refresh(walletId, { compare: String(compareDays) });
      setData(result);
    } catch (err) {
      console.error('Refresh failed:', err);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [walletId, compareDays]);

  // Build a map of baseline changes by mint for New/Sold badges
  const changesByMint = useMemo(() => {
    const map = new Map<string, HoldingChange>();
    data?.baseline_changes?.forEach(c => map.set(c.mint, c));
    return map;
  }, [data]);

  // Group changes by direction for summary
  const changeSummary = useMemo(() => {
    if (!data?.baseline_changes) return null;
    const inflow = data.baseline_changes.filter(c => c.direction === 'inflow' || c.direction === 'new');
    const outflow = data.baseline_changes.filter(c => c.direction === 'outflow' || c.direction === 'removed');
    const totalIn = inflow.reduce((s, c) => s + toNum(c.change_value_usd), 0);
    const totalOut = outflow.reduce((s, c) => s + toNum(c.change_value_usd), 0);
    const netChange = totalIn - totalOut;
    return { inflow: inflow.length, outflow: outflow.length, totalIn, totalOut, netChange };
  }, [data]);

  const displayHoldings = useMemo(() => {
    if (!data || !Array.isArray(data.items)) return [];
    return data.items.filter(h => h.mint === 'So11111111111111111111111111111111111111112' || toNum(h.value_usd) >= 1);
  }, [data]);

  const filteredHoldings = useMemo(() => {
    if (!searchTerm) return displayHoldings;
    const term = searchTerm.toLowerCase();
    return displayHoldings.filter(h =>
      h.symbol.toLowerCase().includes(term) ||
      h.name.toLowerCase().includes(term) ||
      h.mint.toLowerCase().includes(term)
    );
  }, [displayHoldings, searchTerm]);

  const totalValue = displayHoldings.reduce((sum, h) => sum + toNum(h.value_usd), 0);
  const solHolding = displayHoldings.find(h => h.mint === 'So11111111111111111111111111111111111111112');
  const tokenHoldings = displayHoldings.filter(h => h.mint !== 'So11111111111111111111111111111111111111112');
  const tokenCount = tokenHoldings.length;
  const tokensWithValue = tokenHoldings.filter(h => toNum(h.value_usd) > 0).length;

  const topHoldings = [...displayHoldings]
    .filter(h => toNum(h.value_usd) > 0)
    .sort((a, b) => toNum(b.value_usd) - toNum(a.value_usd))
    .slice(0, 5);

  const formatAmount = (amount: number | string | null | undefined, decimals: number = 6) => {
    const num = toNum(amount);
    const abs = Math.abs(num);
    if (num === 0) return '0';
    if (abs < 0.001) return num.toExponential(2);
    if (abs < 1000) return num.toLocaleString('en-US', { maximumFractionDigits: decimals });
    if (abs < 1_000_000) return compact(num, 1_000, 'K');
    if (abs < 1_000_000_000) return compact(num, 1_000_000, 'M');
    if (abs < 1_000_000_000_000) return compact(num, 1_000_000_000, 'B');
    return compact(num, 1_000_000_000_000, 'T');
  };

  const compact = (n: number, div: number, suffix: string) => {
    const val = n / div;
    const str = val.toFixed(1).replace(/\.0$/, '');
    return str + suffix;
  };

  const formatUsd = (value: number | string | null | undefined) => {
    const num = toNum(value);
    if (value === null || value === undefined) return '-';
    if (num === 0) return '$0';
    if (num < 0.01) return '$' + num.toExponential(2);
    if (num < 1) return '$' + num.toFixed(4);
    if (num < 1000) return '$' + num.toFixed(2);
    if (num < 1000000) return '$' + (num / 1000).toFixed(1) + 'K';
    return '$' + (num / 1000000).toFixed(1) + 'M';
  };

  const getAllocationColor = (index: number) => {
    const colors = ['#7c4dff', '#4caf50', '#ff9800', '#f44336', '#2196f3', '#9c27b0', '#00bcd4'];
    return colors[index % colors.length];
  };

  const getChangeColor = (direction: string) => {
    switch (direction) {
      case 'inflow':
      case 'new': return '#4caf50';
      case 'outflow':
      case 'removed': return '#f44336';
      default: return '#888';
    }
  };

  const getChangeLabel = (direction: string) => {
    switch (direction) {
      case 'inflow': return 'Increased';
      case 'outflow': return 'Decreased';
      case 'new': return 'New Position';
      case 'removed': return 'Sold';
      default: return 'Changed';
    }
  };

  if (!walletId) {
    return <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>Select a wallet to view holdings</div>;
  }

  if (loading && !data) {
    return <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>Loading holdings...</div>;
  }

  const isEmpty = !data || !Array.isArray(data.items) || data.items.length === 0;

  const compareLabel = compareDays === 1 ? 'Today' : `${compareDays} days`;

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div>
          <div style={{ fontSize: '0.75rem', color: '#888' }}>
            {data && (
              <>
                Last snapshot: {new Date(data.snapshot_at).toLocaleString()}
                {data.baseline_snapshot_at && (
                  <span style={{ marginLeft: '0.5rem', color: '#555' }}>
                    (vs {new Date(data.baseline_snapshot_at).toLocaleString()})
                  </span>
                )}
              </>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <span style={{ fontSize: '0.75rem', color: '#666' }}>Compare:</span>
          <div style={{ display: 'flex', borderRadius: '6px', overflow: 'hidden', border: '1px solid #333' }}>
            {[1, 3, 7].map(days => (
              <button
                key={days}
                onClick={() => setCompareDays(days)}
                style={{
                  padding: '0.375rem 0.75rem',
                  border: 'none',
                  borderLeft: days !== 1 ? '1px solid #333' : 'none',
                  background: compareDays === days ? '#7c4dff33' : '#1a1a1a',
                  color: compareDays === days ? '#7c4dff' : '#888',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                }}
              >
                {days === 1 ? 'Today' : `${days}d`}
              </button>
            ))}
          </div>
          <button
            onClick={doRefresh}
            disabled={refreshing}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              border: '1px solid #333',
              background: '#1a1a1a',
              color: refreshing ? '#555' : '#e0e0e0',
              cursor: refreshing ? 'not-allowed' : 'pointer',
              fontSize: '0.875rem',
            }}
          >
            {refreshing ? 'Refreshing...' : '⟳ Refresh'}
          </button>
        </div>
      </div>

      {/* Change Summary Bar */}
      {data?.baseline_changes && data.baseline_changes.length > 0 && changeSummary && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: '0.75rem',
          marginBottom: '1.5rem',
        }}>
          <SummaryCard
            label={`Net Change (${compareLabel})`}
            value={formatUsd(changeSummary.netChange)}
            color={changeSummary.netChange >= 0 ? '#4caf50' : '#f44336'}
          />
          <SummaryCard
            label="Gained / New"
            value={`+${formatUsd(changeSummary.totalIn)} (${changeSummary.inflow})`}
            color="#4caf50"
          />
          <SummaryCard
            label="Lost / Sold"
            value={`-${formatUsd(changeSummary.totalOut)} (${changeSummary.outflow})`}
            color="#f44336"
          />
        </div>
      )}

      {isEmpty && (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#666', background: '#1a1a1a', borderRadius: '8px', marginBottom: '1.5rem' }}>
          No current holdings — portfolio is empty
          {data && (
            <div style={{ fontSize: '0.75rem', color: '#555', marginTop: '0.5rem' }}>
              Last snapshot: {new Date(data.snapshot_at).toLocaleString()}
            </div>
          )}
        </div>
      )}

      {!isEmpty && (
        <>
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
          <div style={{ fontSize: '0.75rem', color: '#666', marginBottom: '0.5rem' }}>
            Showing {displayHoldings.length} of {data!.items.length} tokens (skipping sub-$1)
          </div>
          {topHoldings.length > 0 && (
            <div style={{ background: '#1a1a1a', borderRadius: '8px', padding: '1rem', marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.875rem', color: '#888', marginBottom: '0.5rem' }}>Top Holdings</div>
              <div style={{ display: 'flex', height: '24px', borderRadius: '4px', overflow: 'hidden' }}>
                {topHoldings.map((h, i) => {
                  const pct = totalValue > 0 ? (toNum(h.value_usd) / totalValue) * 100 : 0;
                  return (
                    <div
                      key={h.mint}
                      style={{ width: `${pct}%`, background: getAllocationColor(i), transition: 'width 0.3s' }}
                      title={`${h.symbol}: ${formatUsd(h.value_usd)} (${pct.toFixed(1)}%)`}
                    />
                  );
                })}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginTop: '0.5rem' }}>
                {topHoldings.map((h, i) => {
                  const pct = totalValue > 0 ? (toNum(h.value_usd) / totalValue) * 100 : 0;
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
              const pct = totalValue > 0 && toNum(h.value_usd) ? (toNum(h.value_usd) / totalValue) * 100 : 0;
              const isExpanded = expandedMint === h.mint;
              const isSol = h.mint === 'So11111111111111111111111111111111111111112';
              const change = changesByMint.get(h.mint);

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
                        {change && (change.direction === 'new' || change.direction === 'inflow') && (
                          <span style={{
                            fontSize: '0.7rem',
                            padding: '1px 6px',
                            borderRadius: '4px',
                            background: '#4caf5022',
                            color: '#4caf50',
                          }}>
                            New
                          </span>
                        )}
                        {change && (change.direction === 'removed' || change.direction === 'outflow') && (
                          <span style={{
                            fontSize: '0.7rem',
                            padding: '1px 6px',
                            borderRadius: '4px',
                            background: '#f4433622',
                            color: '#f44336',
                          }}>
                            Sold
                          </span>
                        )}
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
                      <div style={{ fontWeight: 600, color: toNum(h.value_usd) > 0 ? '#4caf50' : '#e0e0e0' }}>
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
                      {/* Position Changes */}
                      {change && (
                        <div style={{ padding: '1rem 0', borderBottom: '1px solid #333', marginBottom: '1rem' }}>
                          <div style={{ fontSize: '0.75rem', color: '#888', textTransform: 'uppercase', marginBottom: '0.75rem' }}>
                            Position Changes ({compareLabel})
                            <span style={{
                              marginLeft: '0.5rem',
                              fontSize: '0.7rem',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              background: `${getChangeColor(change.direction)}22`,
                              color: getChangeColor(change.direction),
                              fontWeight: 600,
                            }}>
                              {getChangeLabel(change.direction)}
                            </span>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem' }}>
                            <div>
                              <div style={{ fontSize: '0.75rem', color: '#888' }}>Previous</div>
                              <div style={{ fontSize: '0.875rem', color: '#ccc' }}>
                                {toNum(change.previous_amount) > 0 ? formatAmount(change.previous_amount) : '-'}
                              </div>
                            </div>
                            <div>
                              <div style={{ fontSize: '0.75rem', color: '#888' }}>Current</div>
                              <div style={{ fontSize: '0.875rem', color: '#ccc' }}>{formatAmount(change.current_amount)}</div>
                            </div>
                            <div>
                              <div style={{ fontSize: '0.75rem', color: '#888' }}>Change</div>
                              <div style={{ fontSize: '0.875rem', color: getChangeColor(change.direction) }}>
                                {toNum(change.change_amount) > 0 ? '+' : ''}{formatAmount(change.change_amount)}
                              </div>
                            </div>
                            <div>
                              <div style={{ fontSize: '0.75rem', color: '#888' }}>Value Impact</div>
                              <div style={{ fontSize: '0.875rem', color: getChangeColor(change.direction), fontWeight: 600 }}>
                                {toNum(change.change_value_usd) > 0 ? '+' : ''}{formatUsd(change.change_value_usd)}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                        <div>
                          <div style={{ fontSize: '0.75rem', color: '#888', marginBottom: '0.25rem' }}>Full Mint Address</div>
                          <div style={{ fontSize: '0.875rem', color: '#ccc', wordBreak: 'break-all' }}>{h.mint}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '0.75rem', color: '#888', marginBottom: '0.25rem' }}>Raw Amount</div>
                          <div style={{ fontSize: '0.875rem', color: '#ccc' }}>{toNum(h.amount).toLocaleString('en-US', { maximumFractionDigits: h.decimals })}</div>
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
        </>
      )}
    </div>
  );
}

function StatCard({ title, value, color }: { title: string; value: string; color: string }) {
  return (
    <div style={{ background: '#1a1a1a', borderRadius: '8px', padding: '1rem', borderLeft: `3px solid ${color}` }}>
      <div style={{ fontSize: '0.75rem', color: '#888', textTransform: 'uppercase', marginBottom: '0.25rem' }}>{title}</div>
      <div style={{ fontSize: '1.25rem', fontWeight: 600, color }}>{value}</div>
    </div>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: '#1a1a1a', borderRadius: '8px', padding: '0.75rem 1rem', border: `1px solid ${color}33` }}>
      <div style={{ fontSize: '0.75rem', color: '#888', marginBottom: '0.25rem' }}>{label}</div>
      <div style={{ fontSize: '1.1rem', fontWeight: 600, color }}>{value}</div>
    </div>
  );
}
