import { Cable, Network as NetIcon, Wifi } from 'lucide-react';
import { useRef } from 'react';
import { Chip } from '@renderer/components/panels/Chip';
import { Panel } from '@renderer/components/panels/Panel';
import { SegmentBar } from '@renderer/components/panels/SegmentBar';
import { Sparkline } from '@renderer/components/panels/Sparkline';
import { KeyValue, Stat } from '@renderer/components/panels/Stat';
import { usePoll } from '@renderer/hooks/usePoll';
import { useTween } from '@renderer/hooks/useTween';
import { fmtBytes, fmtRate } from '@renderer/lib/format';
import { useSystemStore } from '@renderer/stores/systemStore';
import { Columns } from './Columns';

const IFACE_ICON = { wired: Cable, wireless: Wifi, virtual: NetIcon };

function ThroughputPanel() {
  const stats = useSystemStore((s) => s.stats);
  const h = useSystemStore((s) => s.history);
  const down = useTween(stats?.network.down ?? 0);
  const up = useTween(stats?.network.up ?? 0);
  const peak = Math.max(0, ...h.down);
  return (
    <Panel
      code="NET.03"
      title="Throughput"
      chip={<Chip tone="muted">{stats?.network.iface || 'Default adapter'}</Chip>}
      className="flex-1"
      bodyClassName="flex flex-col"
    >
      <div className="grid grid-cols-3 gap-4">
        <div>
          <div className="micro-label">Download</div>
          <div className="numeric text-[26px] font-extralight leading-tight text-ice text-glow">
            {fmtRate(down)}
          </div>
        </div>
        <div>
          <div className="micro-label">Upload</div>
          <div className="numeric text-[26px] font-extralight leading-tight text-text-primary">
            {fmtRate(up)}
          </div>
        </div>
        <div>
          <div className="micro-label">Peak (2 min)</div>
          <div className="numeric text-[26px] font-extralight leading-tight text-text-muted">
            {fmtRate(peak)}
          </div>
        </div>
      </div>
      <div className="relative mt-3 min-h-0 flex-1">
        <div className="absolute inset-0">
          <Sparkline data={h.down} secondary={h.up} height={200} grid className="!h-full" />
        </div>
      </div>
      <div className="micro-label mt-2">── download · - - upload</div>
    </Panel>
  );
}

function LatencyPanel() {
  const results = usePoll(() => window.arc.network.latency(), 15_000);
  const worst = Math.max(0, ...(results ?? []).map((r) => r.ms ?? 0));
  const allDown = results !== null && results.length > 0 && results.every((r) => r.ms === null);
  return (
    <Panel
      code="NET.04"
      title="Latency"
      chip={
        results === null ? (
          <Chip tone="muted">Measuring…</Chip>
        ) : allDown ? (
          <Chip tone="alert">No response</Chip>
        ) : (
          <Chip tone={worst > 100 ? 'amber' : 'ok'}>{worst > 100 ? 'Slow' : 'Good'}</Chip>
        )
      }
      className="shrink-0"
    >
      <ul className="space-y-2">
        {(results ?? []).map((t) => (
          <li key={t.host} className="grid grid-cols-[1fr_5.5rem_3.5rem] items-center gap-3">
            <div className="min-w-0">
              <div className="truncate text-[13px]">{t.name}</div>
              <div className="micro-label truncate normal-case">{t.host}</div>
            </div>
            <SegmentBar
              value={t.ms === null ? 0 : Math.min(100, (t.ms / 150) * 100)}
              segments={12}
              tone={t.ms !== null && t.ms > 100 ? 'amber' : 'accent'}
              label={`${t.name} latency`}
            />
            <span
              className={`numeric text-right text-[12px] ${t.ms === null ? 'text-text-muted' : 'text-accent'}`}
            >
              {t.ms === null ? 'no reply' : `${Math.round(t.ms)} ms`}
            </span>
          </li>
        ))}
        {results === null && (
          <li className="text-[12px] text-text-muted">
            Pinging your router and a few public hosts…
          </li>
        )}
      </ul>
    </Panel>
  );
}

function TrafficPanel() {
  const net = useSystemStore((s) => s.stats?.network);
  // Totals when this view first opened, to show "this session".
  const base = useRef<{ rx: number; tx: number } | null>(null);
  if (net && !base.current && net.rxTotal > 0) base.current = { rx: net.rxTotal, tx: net.txTotal };
  const sessRx = net && base.current ? net.rxTotal - base.current.rx : 0;
  const sessTx = net && base.current ? net.txTotal - base.current.tx : 0;
  return (
    <Panel
      code="USE.05"
      title="Traffic"
      chip={<Chip tone="muted">Default adapter</Chip>}
      className="shrink-0"
    >
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="micro-label">Received since boot</div>
          <div className="numeric text-[22px] font-extralight text-ice">
            {fmtBytes(net?.rxTotal ?? 0)}
          </div>
        </div>
        <div>
          <div className="micro-label">Sent since boot</div>
          <div className="numeric text-[22px] font-extralight text-text-primary">
            {fmtBytes(net?.txTotal ?? 0)}
          </div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Stat label="↓ While viewing" value={fmtBytes(sessRx)} accent />
        <Stat label="↑ While viewing" value={fmtBytes(sessTx)} />
      </div>
    </Panel>
  );
}

export function NetworkTab() {
  const details = usePoll(() => window.arc.network.details(), 30_000);
  const wifi = details?.wifi;
  return (
    <Columns
      left={
        <>
          <Panel
            code="IFC.01"
            title="Interfaces"
            chip={
              <Chip>{details ? `${details.interfaces.filter((i) => i.up).length} up` : '…'}</Chip>
            }
            className="flex-1"
            bodyClassName="!py-1 overflow-y-auto"
          >
            <ul>
              {(details?.interfaces ?? []).map((i) => {
                const I = IFACE_ICON[i.type];
                return (
                  <li
                    key={`${i.name}-${i.mac}`}
                    className="border-b border-line/30 py-2.5 last:border-0"
                  >
                    <div className="flex items-center gap-2">
                      <I
                        size={15}
                        strokeWidth={1.5}
                        className={i.up ? 'text-accent' : 'text-text-muted'}
                      />
                      <span className="flex-1 truncate text-[13px]" title={i.name}>
                        {i.name}
                        {i.isDefault && (
                          <span className="ml-1.5 font-mono text-[10px] text-accent">DEFAULT</span>
                        )}
                      </span>
                      <Chip tone={i.up ? 'ok' : 'muted'}>{i.up ? 'Up' : 'Down'}</Chip>
                    </div>
                    <div className="mt-1.5 grid grid-cols-2 gap-2 pl-6">
                      <Stat label="IPv4" value={i.ip4 ?? '—'} />
                      <Stat
                        label="Link"
                        value={
                          i.speedMbps
                            ? i.speedMbps >= 1000
                              ? `${i.speedMbps / 1000} Gbps`
                              : `${i.speedMbps} Mbps`
                            : '—'
                        }
                      />
                    </div>
                  </li>
                );
              })}
              {!details && <li className="py-2 text-[12px] text-text-muted">Reading adapters…</li>}
            </ul>
          </Panel>
          <Panel code="CON.02" title="Connection" className="shrink-0">
            <KeyValue k="Computer" v={details?.hostname ?? '—'} />
            <KeyValue k="Gateway" v={details?.gateway ?? '—'} />
            <KeyValue k="DNS" v={details?.dns.length ? details.dns.slice(0, 2).join(', ') : '—'} />
          </Panel>
        </>
      }
      center={
        <>
          <ThroughputPanel />
          <LatencyPanel />
        </>
      }
      right={
        <>
          <TrafficPanel />
          <Panel code="WFI.06" title="Wi-Fi" className="flex-1">
            {wifi ? (
              <div className="space-y-3">
                <div className="text-[15px] text-text-primary">{wifi.ssid || 'Hidden network'}</div>
                {wifi.signal !== null && (
                  <div>
                    <div className="flex justify-between">
                      <span className="micro-label">Signal</span>
                      <span className="numeric text-[11px] text-accent">
                        {Math.round(wifi.signal)}%
                      </span>
                    </div>
                    <SegmentBar
                      value={wifi.signal}
                      segments={20}
                      tone={wifi.signal < 40 ? 'amber' : 'accent'}
                      label="Wi-Fi signal"
                    />
                  </div>
                )}
              </div>
            ) : (
              <p className="text-[13px] text-text-muted">
                {details ? 'Connected by cable (no Wi-Fi in use).' : '…'}
              </p>
            )}
          </Panel>
        </>
      }
    />
  );
}
