/**
 * Splits a comma/newline-separated string of IPs/CIDRs into trimmed entries.
 * Mirrors the backend's `parse_ip_list` (server/apps/attendance/models.py) so
 * the same office-IP value parses identically on both sides.
 */
export function parseIpList(raw: string): string[] {
  return raw
    .split(/[,\n]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * Checks if a given IP address belongs to a CIDR network mask or matches an IP exactly.
 * Supports IPv4 addresses and CIDR subnets (e.g. 192.168.1.0/24).
 * Fallbacks to exact match for invalid/unsupported formats or IPv6.
 */
export function isIpInCidr(ip: string, cidr: string): boolean {
  const trimmedCidr = cidr.trim();
  const trimmedIp = ip.trim();

  // If there's no mask, do a simple exact match
  if (!trimmedCidr.includes("/")) {
    return trimmedIp === trimmedCidr;
  }

  const [subnetIp, maskStr] = trimmedCidr.split("/");
  const maskBits = parseInt(maskStr, 10);

  // Check if they are both IPv4
  const isIpv4 = (str: string) => /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(str);

  if (isIpv4(trimmedIp) && isIpv4(subnetIp)) {
    if (isNaN(maskBits) || maskBits < 0 || maskBits > 32) {
      return false;
    }
    
    const ip4ToInt = (addr: string) => {
      const parts = addr.split(".").map(Number);
      return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
    };

    const ipInt = ip4ToInt(trimmedIp);
    const subnetInt = ip4ToInt(subnetIp);
    if (maskBits === 0) return true;
    
    const mask = (0xffffffff << (32 - maskBits)) >>> 0;
    return (ipInt & mask) === (subnetInt & mask);
  }

  // Fallback for IPv6 or other formats: exact match on IP (without mask)
  return trimmedIp === subnetIp;
}
