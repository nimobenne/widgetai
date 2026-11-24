export function domainAllowed(host: string, allowedDomains: string[]): boolean {
  return allowedDomains.some(entry => host.toLowerCase() === entry.toLowerCase().trim());
}
