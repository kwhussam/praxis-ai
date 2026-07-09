export const MAX_AUDIT_SUBNET_HOSTS = 1024;

export function buildIpv4SubnetCandidates(ipAddress: string, subnetMask: string, gatewayIp = "", maxHosts = MAX_AUDIT_SUBNET_HOSTS) {
  const ip = ipv4ToNumber(ipAddress);
  const mask = ipv4ToNumber(subnetMask);
  if (ip === null || mask === null || !isContiguousMask(mask) || !isPrivateIp(ipAddress)) return null;

  const network = (ip & mask) >>> 0;
  const broadcast = (network | (~mask >>> 0)) >>> 0;
  const hostCount = Math.max(0, broadcast - network - 1);
  if (hostCount <= 0) return [];

  const cappedHostCount = Math.min(hostCount, maxHosts);
  const hosts: string[] = [];
  for (let offset = 1; offset <= cappedHostCount; offset += 1) {
    const candidate = numberToIpv4(network + offset);
    if (candidate !== ipAddress && isPrivateIp(candidate)) hosts.push(candidate);
  }

  if (gatewayIp && isPrivateIp(gatewayIp) && gatewayIp !== ipAddress && !hosts.includes(gatewayIp)) {
    hosts.unshift(gatewayIp);
  }

  return Array.from(new Set(hosts));
}

export function usableSubnetHostCount(ipAddress: string, subnetMask: string) {
  const ip = ipv4ToNumber(ipAddress);
  const mask = ipv4ToNumber(subnetMask);
  if (ip === null || mask === null || !isContiguousMask(mask)) return null;
  const network = (ip & mask) >>> 0;
  const broadcast = (network | (~mask >>> 0)) >>> 0;
  return Math.max(0, broadcast - network - 1);
}

function ipv4ToNumber(value: string) {
  const parts = value.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return (((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3]) >>> 0;
}

function numberToIpv4(value: number) {
  return [value >>> 24, (value >>> 16) & 255, (value >>> 8) & 255, value & 255].join(".");
}

function isContiguousMask(mask: number) {
  const inverted = ~mask >>> 0;
  return ((inverted + 1) & inverted) === 0;
}

function isPrivateIp(ipAddress: string) {
  const parts = ipAddress.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return false;
  const [first, second] = parts;
  return first === 10 || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168);
}
