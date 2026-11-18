/** On-demand network details for the Network tab (only polled while it's open). */
import dns from 'node:dns';
import os from 'node:os';
import type si from 'systeminformation';
import type { LatencyResult, NetworkDetails } from '@shared/types';

type Si = Pick<
  typeof si,
  'networkInterfaces' | 'networkGatewayDefault' | 'wifiConnections' | 'inetLatency'
>;

export async function networkDetails(s: Si): Promise<NetworkDetails> {
  const [ifaces, gateway] = await Promise.all([
    s.networkInterfaces(),
    s.networkGatewayDefault().catch(() => ''),
  ]);
  const list = (Array.isArray(ifaces) ? ifaces : [ifaces]).filter((i) => !i.internal);
  const wifiIface = list.find((i) => i.default && i.type === 'wireless');
  const wifi = wifiIface ? (await s.wifiConnections().catch(() => []))[0] : undefined;
  return {
    hostname: os.hostname(),
    gateway: gateway || null,
    dns: dns.getServers().filter((d) => !d.startsWith('127.')),
    interfaces: list
      .map((i) => ({
        name: i.ifaceName || i.iface,
        type:
          i.type === 'wireless'
            ? ('wireless' as const)
            : i.virtual ||
                /virtual|vethernet|wsl|hyper-v|vmware|vbox|loopback|tap|tun/i.test(
                  i.ifaceName || i.iface,
                )
              ? ('virtual' as const)
              : ('wired' as const),
        ip4: i.ip4 || null,
        mac: i.mac || null,
        speedMbps: typeof i.speed === 'number' && i.speed > 0 ? i.speed : null,
        up: i.operstate === 'up' || (!!i.ip4 && i.operstate !== 'down'),
        isDefault: i.default,
      }))
      .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || Number(b.up) - Number(a.up)),
    wifi: wifi
      ? { ssid: wifi.ssid, signal: typeof wifi.quality === 'number' ? wifi.quality : null }
      : null,
  };
}

/** Latency to a few well-known hosts (plus your router). Uses the system ping. */
export async function latencyChecks(s: Si, gateway: string | null): Promise<LatencyResult[]> {
  const targets = [
    ...(gateway ? [{ name: 'Router', host: gateway }] : []),
    { name: 'Cloudflare DNS', host: '1.1.1.1' },
    { name: 'Google DNS', host: '8.8.8.8' },
    { name: 'google.com', host: 'google.com' },
  ];
  return Promise.all(
    targets.map(async (t) => {
      const ms = await s.inetLatency(t.host).catch(() => null);
      return { ...t, ms: typeof ms === 'number' && Number.isFinite(ms) ? ms : null };
    }),
  );
}
