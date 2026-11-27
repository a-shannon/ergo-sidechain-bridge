/**
 * Pure zero-dependency Node.js (`node:crypto`) X.509 v3 ECDSA P-256 PKI generator
 * for Bridge V1.2 multi-host mTLS ceremonies (private CA, server certs with SANs,
 * and client certs with clientAuth EKU).
 *
 * Works identically on Linux, macOS, Windows, Docker, and CI without requiring
 * an external `openssl` binary.
 */
import crypto from 'node:crypto';
import net from 'node:net';

function derLen(len: number): Buffer {
  if (len < 0x80) return Buffer.from([len]);
  const bytes: number[] = [];
  let n = len;
  while (n > 0) {
    bytes.unshift(n & 0xff);
    n >>= 8;
  }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

function derTag(tag: number, content: Buffer): Buffer {
  return Buffer.concat([Buffer.from([tag]), derLen(content.length), content]);
}

function derSequence(items: Buffer[]): Buffer {
  return derTag(0x30, Buffer.concat(items));
}

function derSet(items: Buffer[]): Buffer {
  return derTag(0x31, Buffer.concat(items));
}

function derInteger(bytes: Buffer): Buffer {
  // Strip leading 0x00 bytes while preserving positive sign bit
  let start = 0;
  while (start < bytes.length - 1 && bytes[start] === 0x00) start++;
  let trimmed = bytes.subarray(start);
  if (trimmed[0] & 0x80) {
    trimmed = Buffer.concat([Buffer.from([0x00]), trimmed]);
  }
  return derTag(0x02, trimmed);
}

function derSmallInt(n: number): Buffer {
  const hex = n.toString(16);
  const padded = hex.length % 2 === 0 ? hex : `0${hex}`;
  return derInteger(Buffer.from(padded, 'hex'));
}

function derBitString(bytes: Buffer, unusedBits = 0): Buffer {
  return derTag(0x03, Buffer.concat([Buffer.from([unusedBits]), bytes]));
}

function derOctetString(bytes: Buffer): Buffer {
  return derTag(0x04, bytes);
}

function derBoolean(value: boolean): Buffer {
  return derTag(0x01, Buffer.from([value ? 0xff : 0x00]));
}

function derUtf8String(value: string): Buffer {
  return derTag(0x0c, Buffer.from(value, 'utf8'));
}

function derOid(dotNotation: string): Buffer {
  const arcs = dotNotation.split('.').map((s) => Number(s));
  if (arcs.length < 2) throw new Error(`Invalid OID: ${dotNotation}`);
  const out: number[] = [arcs[0] * 40 + arcs[1]];
  for (let i = 2; i < arcs.length; i++) {
    let v = arcs[i];
    const enc: number[] = [v & 0x7f];
    v >>>= 7;
    while (v > 0) {
      enc.unshift((v & 0x7f) | 0x80);
      v >>>= 7;
    }
    out.push(...enc);
  }
  return derTag(0x06, Buffer.from(out));
}

/**
 * RFC 5280 §4.1.2.5: emit UTCTime (0x17, YYMMDDHHMMSSZ) for years <= 2049,
 * and GeneralizedTime (0x18, YYYYMMDDHHMMSSZ) for years >= 2050.
 */
function derTime(date: Date): Buffer {
  const pad = (n: number, width = 2) => String(n).padStart(width, '0');
  const year = date.getUTCFullYear();
  const rest =
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds()) +
    'Z';
  if (year >= 1950 && year <= 2049) {
    const yy = pad(year % 100);
    return derTag(0x17, Buffer.from(`${yy}${rest}`, 'ascii'));
  }
  const yyyy = pad(year, 4);
  return derTag(0x18, Buffer.from(`${yyyy}${rest}`, 'ascii'));
}

function derName(commonName: string, org = 'Ergo Sidechain Bridge'): Buffer {
  const cnAttr = derSet([derSequence([derOid('2.5.4.3'), derUtf8String(commonName)])]);
  const orgAttr = derSet([derSequence([derOid('2.5.4.10'), derUtf8String(org)])]);
  return derSequence([orgAttr, cnAttr]);
}

function derExtension(oid: string, critical: boolean, extnValue: Buffer): Buffer {
  const parts: Buffer[] = [derOid(oid)];
  if (critical) parts.push(derBoolean(true));
  parts.push(derOctetString(extnValue));
  return derSequence(parts);
}

function derSanExtension(dnsNames: string[], ipAddresses: string[]): Buffer {
  const entries: Buffer[] = [];
  for (const dns of dnsNames) {
    if (!/^[a-zA-Z0-9.*-]{1,253}$/.test(dns)) {
      throw new Error(`Invalid ASCII DNS SAN: ${dns}`);
    }
    entries.push(derTag(0x82, Buffer.from(dns, 'ascii')));
  }
  for (const ip of ipAddresses) {
    if (net.isIPv4(ip)) {
      const octets = ip.split('.').map((n) => Number(n));
      entries.push(derTag(0x87, Buffer.from(octets)));
    } else if (net.isIPv6(ip)) {
      const expanded = expandIpv6(ip);
      entries.push(derTag(0x87, expanded));
    } else {
      throw new Error(`Invalid IP SAN: ${ip}`);
    }
  }
  return derExtension('2.5.29.17', false, derSequence(entries));
}

function expandIpv6(ip: string): Buffer {
  // Handle IPv4-mapped IPv6 addresses (e.g., ::ffff:127.0.0.1) by converting trailing dotted quad to 2 hextets
  let normalized = ip;
  const lastColon = normalized.lastIndexOf(':');
  if (lastColon >= 0 && normalized.slice(lastColon + 1).includes('.')) {
    const v4Part = normalized.slice(lastColon + 1);
    if (!net.isIPv4(v4Part)) {
      throw new Error(`Invalid IPv4-mapped IPv6 SAN: ${ip}`);
    }
    const [a, b, c, d] = v4Part.split('.').map((n) => Number(n));
    const h1 = ((a << 8) | b).toString(16);
    const h2 = ((c << 8) | d).toString(16);
    normalized = `${normalized.slice(0, lastColon + 1)}${h1}:${h2}`;
  }

  const halves = normalized.split('::');
  if (halves.length > 2) {
    throw new Error(`Invalid IPv6 SAN (multiple ::): ${ip}`);
  }
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const groups =
    halves.length === 2
      ? [...left, ...Array<string>(8 - (left.length + right.length)).fill('0'), ...right]
      : left;
  if (groups.length !== 8) {
    throw new Error(`Invalid IPv6 SAN group count (${groups.length}): ${ip}`);
  }
  const out = Buffer.alloc(16);
  for (let i = 0; i < 8; i++) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(groups[i])) {
      throw new Error(`Invalid IPv6 hextet "${groups[i]}" in SAN: ${ip}`);
    }
    out.writeUInt16BE(parseInt(groups[i], 16), i * 2);
  }
  return out;
}

function derToPem(label: string, der: Buffer): string {
  const b64 = der.toString('base64');
  const wrapped = b64.match(/.{1,64}/g)?.join('\n') ?? b64;
  return `-----BEGIN ${label}-----\n${wrapped}\n-----END ${label}-----\n`;
}

// OID 1.2.840.10045.4.3.2 = ecdsa-with-SHA256
const ALG_ECDSA_SHA256 = derSequence([derOid('1.2.840.10045.4.3.2')]);

export interface X509CertBundle {
  certPem: string;
  keyPem: string;
  commonName: string;
}

export interface MtlsPkiBundle {
  ca: X509CertBundle;
  servers: Record<string, X509CertBundle>;
  client: X509CertBundle;
}

function signTbsCertificate(params: {
  subjectCn: string;
  issuerCn: string;
  subjectPublicKey: crypto.KeyObject;
  issuerPrivateKey: crypto.KeyObject;
  validDays: number;
  extensions: Buffer[];
}): string {
  if (!Number.isFinite(params.validDays) || params.validDays <= 0) {
    throw new Error(`Invalid certificate validDays: ${params.validDays}`);
  }
  const serial = crypto.randomBytes(16);
  serial[0] &= 0x7f; // ensure positive ASN.1 integer
  if (serial[0] === 0) serial[0] = 0x01;

  const now = new Date(Date.now() - 60_000); // 1 min backdate to avoid clock-skew flakiness
  const notAfter = new Date(now.getTime() + params.validDays * 86_400_000);
  const spkiDer = params.subjectPublicKey.export({ type: 'spki', format: 'der' });

  const tbs = derSequence([
    derTag(0xa0, derSmallInt(2)), // v3 (0-indexed = 2)
    derInteger(serial),
    ALG_ECDSA_SHA256,
    derName(params.issuerCn),
    derSequence([derTime(now), derTime(notAfter)]),
    derName(params.subjectCn),
    spkiDer,
    derTag(0xa3, derSequence(params.extensions)),
  ]);

  const sig = crypto.sign('sha256', tbs, params.issuerPrivateKey);
  const fullCert = derSequence([tbs, ALG_ECDSA_SHA256, derBitString(sig, 0)]);
  return derToPem('CERTIFICATE', fullCert);
}

/**
 * Generate a self-signed ECDSA P-256 private Certificate Authority.
 */
export function generatePrivateCa(commonName = 'Ergo Bridge Committee CA', validDays = 3650): X509CertBundle {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const basicConstraints = derExtension('2.5.29.19', true, derSequence([derBoolean(true)]));
  // keyUsage: keyCertSign (bit 5) + cRLSign (bit 6) => 0b00000110 = 0x06, unusedBits=1 -> 0x06
  const keyUsage = derExtension('2.5.29.15', true, derBitString(Buffer.from([0x06]), 1));
  const certPem = signTbsCertificate({
    subjectCn: commonName,
    issuerCn: commonName,
    subjectPublicKey: publicKey,
    issuerPrivateKey: privateKey,
    validDays,
    extensions: [basicConstraints, keyUsage],
  });
  const keyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  return { certPem, keyPem, commonName };
}

/**
 * Issue a server or client leaf certificate signed by `ca`.
 */
export function issueSignedLeafCert(params: {
  ca: X509CertBundle;
  commonName: string;
  role: 'server' | 'client';
  dnsNames?: string[];
  ipAddresses?: string[];
  validDays?: number;
}): X509CertBundle {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const caPrivKey = crypto.createPrivateKey(params.ca.keyPem);

  const basicConstraints = derExtension('2.5.29.19', true, derSequence([])); // CA: FALSE
  // keyUsage: digitalSignature (bit 0 = 0x80)
  const keyUsage = derExtension('2.5.29.15', true, derBitString(Buffer.from([0x80]), 7));
  // EKU: serverAuth = 1.3.6.1.5.5.7.3.1, clientAuth = 1.3.6.1.5.5.7.3.2
  const ekuOid = params.role === 'server' ? '1.3.6.1.5.5.7.3.1' : '1.3.6.1.5.5.7.3.2';
  const eku = derExtension('2.5.29.37', false, derSequence([derOid(ekuOid)]));

  const extensions: Buffer[] = [basicConstraints, keyUsage, eku];
  const dnsNames = params.dnsNames ?? [];
  const ipAddresses = params.ipAddresses ?? [];
  if (dnsNames.length > 0 || ipAddresses.length > 0) {
    extensions.push(derSanExtension(dnsNames, ipAddresses));
  }

  const certPem = signTbsCertificate({
    subjectCn: params.commonName,
    issuerCn: params.ca.commonName,
    subjectPublicKey: publicKey,
    issuerPrivateKey: caPrivKey,
    validDays: params.validDays ?? 365,
    extensions,
  });
  const keyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  return { certPem, keyPem, commonName: params.commonName };
}

/**
 * Generate a complete mTLS PKI bundle for a multi-host committee deployment:
 * 1 private CA + 1 server cert per signer host + 1 coordinator client cert.
 */
export function generateCommitteeMtlsPki(params?: {
  signerNames?: string[];
  extraIps?: string[];
  validDays?: number;
}): MtlsPkiBundle {
  const leafDays = params?.validDays ?? 365;
  const ca = generatePrivateCa('Ergo Bridge Committee CA', Math.max(3650, leafDays + 365));
  const signerNames = params?.signerNames ?? ['signer-1', 'signer-2', 'signer-3'];
  const extraIps = params?.extraIps ?? ['127.0.0.1', '::1'];
  const servers: Record<string, X509CertBundle> = {};

  for (const name of signerNames) {
    servers[name] = issueSignedLeafCert({
      ca,
      commonName: name,
      role: 'server',
      dnsNames: [name, 'localhost'],
      ipAddresses: extraIps,
      validDays: params?.validDays ?? 365,
    });
  }

  const client = issueSignedLeafCert({
    ca,
    commonName: 'bridge-relayer-coordinator',
    role: 'client',
    dnsNames: ['relayer', 'localhost'],
    ipAddresses: extraIps,
    validDays: params?.validDays ?? 365,
  });

  return { ca, servers, client };
}
