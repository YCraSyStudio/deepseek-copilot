const MAX_QUERY_CHARS = 500;
const MAX_URL_CHARS = 4096;
const MAX_PAGE_ID_CHARS = 512;

export function validateSearchQuery(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.trim().length > MAX_QUERY_CHARS) {
    throw new Error(`query must contain between 1 and ${MAX_QUERY_CHARS} characters`);
  }
  return value.trim();
}

export function validatePublicHttpsUrl(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_URL_CHARS) {
    throw new Error(`url must contain between 1 and ${MAX_URL_CHARS} characters`);
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("url must be an absolute HTTPS URL");
  }
  if (url.protocol !== "https:") {
    throw new Error("Only HTTPS URLs are allowed");
  }
  if (url.username || url.password) {
    throw new Error("URLs containing credentials are not allowed");
  }
  if (isPrivateHostname(url.hostname)) {
    throw new Error("Local, private, and link-local addresses are not allowed");
  }
  return url.toString();
}

export function validatePageId(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > MAX_PAGE_ID_CHARS) {
    throw new Error(`page_id must contain between 1 and ${MAX_PAGE_ID_CHARS} characters`);
  }
  return value.trim();
}

export function validateElementRef(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,256}$/.test(value)) {
    throw new Error("ref must be a browser element reference returned by read_web_page or search_web");
  }
  return value;
}

export function validateElementDescription(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.trim().length > 240) {
    throw new Error("element must contain between 1 and 240 characters");
  }
  return value.trim();
}

function isPrivateHostname(value: string): boolean {
  const hostname = value.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    return true;
  }
  // Reject IP-literal IPv6 destinations for the MVP. This also closes IPv4-mapped
  // loopback/private forms that are easy to express in multiple equivalent ways.
  if (hostname.includes(":")) {return true;}

  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  if (!ipv4) {return false;}
  const octets = ipv4.slice(1).map(Number);
  if (octets.some((part) => part > 255)) {return true;}
  const [first, second] = octets;
  return first === 0 || first === 10 || first === 127 ||
    (first === 100 && second! >= 64 && second! <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second! >= 16 && second! <= 31) ||
    (first === 192 && second === 0) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    first! >= 224;
}
