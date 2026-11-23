export type SignedFields = { version: string; url: string; checksum: string; sig?: string };
export const OTA_RESERVE: boolean;
export const OTA_KEY: string;
export const RESERVE_TODO: string;
export function otaMessage(m: SignedFields): string;
export function signManifest<T extends SignedFields>(m: T, pem: string): T & { sig: string };
export function verifyManifest(m: SignedFields, spkiB64: string): boolean;
export function distKeys(distDir: string): { keys: string[]; todo: boolean };
export function pairProblem(pem: string, distDir: string): string | null;
