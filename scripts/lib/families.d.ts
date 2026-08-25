// families.mjs의 타입 선언 — 브라우저 소비자(breadlab.ts·thumbsHarness.ts)가 TS로 읽는다.
// 값의 정본은 families.mjs다. 필드를 늘리면 양쪽을 같이 고칠 것.

export type FamilyKey = 'bread' | 'ingredient';

export interface Family {
  key: FamilyKey;
  /** public/<outDir>/ — GLB와 thumbs/ 출력 위치 */
  outDir: string;
  /** assets/<refDir>/src/ — 레퍼런스 이미지(형태·비율 정본) */
  refDir: string;
  /** assets/prompts/<promptDir>/ — 프롬프트 JSON(색 정본) */
  promptDir: string;
  /** 개당 GLB 상한(KB) */
  perKB: number;
  /** 개당 삼각형 상한 */
  maxTri: number;
  /** 고정 합계 상한(KB). 개수가 닫힌 패밀리만 */
  totalKB: number | null;
  /** 개수 비례 합계 기준(KB/개). 자라는 패밀리만 */
  perItemKB: number | null;
}

export declare const FAMILY_KEYS: FamilyKey[];
export declare const FAMILIES: Record<string, Family>;
export declare function familyFromArgv(argv: string[]): Family;
export declare function idsFromArgv(argv: string[]): string[];
