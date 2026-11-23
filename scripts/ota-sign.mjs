// OTA 판 목록(ota/manifest.json) 서명 (2026-11-18 어뷰징 점검, 냥수제비 S5 이식).
// Vercel 계정이 털려 manifest·zip을 같이 바꿔도 개인 키가 없으면 서명을 못 만든다 → 앱이 안 받는다.
// 개인 키 = 레포 밖 D:\keys\levain\ota-sign.pem(P-256, 평시). 예비 키는 다른 매체(RELEASE.md §8) — 둘 다 잃으면 새 AAB로만 고친다.
// 공개 키 = src/platform/ota.ts otaKeys([평시, 예비]). 서명 글 형식은 그 파일의 otaMessage와 같아야 한다(tests/otaStage.test.ts가 맞대 본다).
import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { collectFiles } from './lib/zip.mjs';

/** 예비 키로 서명하는 길은 이 환경 변수로만 연다(평시 키를 잃었을 때). 없으면 평시 키 LEVAIN_OTA_KEY → 기본 경로 */
export const OTA_RESERVE = Boolean(process.env.LEVAIN_OTA_RESERVE_KEY);
export const OTA_KEY = process.env.LEVAIN_OTA_RESERVE_KEY || process.env.LEVAIN_OTA_KEY || 'D:/keys/levain/ota-sign.pem';
/** src/platform/ota.ts OTA_RESERVE_TODO와 같은 글자 — 예비 키 자리가 비어 있다는 표지 */
export const RESERVE_TODO = 'OTA_RESERVE_KEY_TODO';
/** P-256 SPKI(91바이트)의 base64 — 앞 36자는 곡선 식별자라 모든 키가 같다 */
const SPKI_P256 = /MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE[A-Za-z0-9+/]{86}==/g;

export const otaMessage = ({ version, url, checksum }) => `levain-ota\n${version}\n${url}\n${checksum}`;

/** manifest에 sig(ECDSA P-256 · SHA-256 · r‖s base64 = 웹 crypto.subtle 형식)를 붙여 돌려준다 */
export function signManifest(m, pem) {
  const sig = sign('sha256', Buffer.from(otaMessage(m)), { key: createPrivateKey(pem), dsaEncoding: 'ieee-p1363' });
  return { ...m, sig: sig.toString('base64') };
}

/** 앱에 박힌 공개 키(SPKI base64)로 맞는지 — 짝이 어긋난 판이 나가면 모든 앱이 OTA를 못 받는다 → 쓰기 전에 막는다 */
export function verifyManifest(m, spkiB64) {
  if (!spkiB64) return false;
  const key = createPublicKey({ key: Buffer.from(spkiB64, 'base64'), format: 'der', type: 'spki' });
  return verify('sha256', Buffer.from(otaMessage(m)), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(m.sig ?? '', 'base64'));
}

/** 빌드된 묶음(dist)의 JS에서 박힌 공개 키 목록과 자리표시 여부를 꺼낸다 — 폰이 갖는 건 소스가 아니라 이것이다 */
export function distKeys(distDir) {
  const keys = new Set();
  let todo = false;
  for (const f of collectFiles(distDir)) {
    if (!f.name.endsWith('.js')) continue;
    const s = f.data.toString('utf8');
    if (s.includes(RESERVE_TODO)) todo = true;
    for (const k of s.match(SPKI_P256) ?? []) keys.add(k);
  }
  return { keys: [...keys], todo };
}

/** 발행 직전 짝 확인: 문제가 있으면 멈출 사유, 없으면 null. 키 = 묶음 안 목록(평시 · 예비) 중 하나와 짝이면 된다 */
export function pairProblem(pem, distDir) {
  const { keys, todo } = distKeys(distDir);
  if (todo) return `예비 키 자리표시(${RESERVE_TODO})가 묶음에 남아 있다 → node scripts/ota-keygen.mjs <레포 밖 경로>로 만든 공개 키를 src/platform/ota.ts otaKeys에 넣는다`;
  if (keys.length < 2) return `묶음에서 공개 키를 ${keys.length}개만 찾았다 — 평시 · 예비 둘이어야 한다`;
  const probe = signManifest({ version: '0.0.0', url: 'pair-check', checksum: '0'.repeat(64) }, pem);
  if (!keys.some((k) => verifyManifest(probe, k))) return '서명 키가 묶음 안 어느 공개 키와도 짝이 아니다(키를 바꾸고 다시 빌드했나?)';
  return null;
}
