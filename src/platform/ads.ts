// 보상형 광고 포트 — @capacitor-community/admob 래퍼. 정본: 확장기획 §10.
// 웹·구셸(플러그인 없는 APK)에선 adsAvailable()=false — UI가 슬롯 자체를 숨긴다.
// 버전 스큐 방어가 이 한 줄이다: OTA가 광고 UI를 실어도 죽은 버튼이 생기지 않는다.
//
// SSV(서버 검증)는 백엔드 0이라 미사용 — 클라이언트 보상(§10-1, 정책 위반 아님·리스크 수용).
// 우리 쪽 초기화(동의 확인 · initialize)는 지연(lazy): 첫 슬롯 사용 때만 한다 — 시작 광고는 없다(§10 금지).
// 단 SDK 자체는 매니페스트의 MobileAdsInitProvider가 앱 시작 때 올린다. 「시작 비용 0」은 아니다(감사 T3).
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import {
  AdMob,
  AdmobConsentStatus,
  MaxAdContentRating,
  RewardAdPluginEvents,
} from '@capacitor-community/admob';
import { AD_SESSION_CAP } from '../sim';
import { isNative } from './native';

/** Google 공식 리워드 테스트 유닛 — 실기기에서도 테스트 광고가 재생된다. 기본값 */
const TEST_AD_ID = 'ca-app-pub-3940256099942544/5224354917';
/**
 * 실 보상형 유닛(11-24 발급). 앱 ID(~1704555098)는 네이티브라 OTA로 안 바뀐다 — 그래서 이 유닛은
 * 실 앱 ID로 구운 AAB(versionCode ≥ LIVE_MIN_BUILD)에서만 쓴다. 그보다 낮은 빌드(시험 AAB vc≤5 · 설치된 앱)는
 * OTA로 이 묶음을 받아도 시험 유닛이다. gradle이 두 값을 맞댄다(android/app/build.gradle).
 */
const LIVE_AD_ID = 'ca-app-pub-6546297621990185/4139146747';
const LIVE_MIN_BUILD = 10;

async function rewardedAdId(): Promise<string> {
  try {
    return Number((await App.getInfo()).build) >= LIVE_MIN_BUILD ? LIVE_AD_ID : TEST_AD_ID;
  } catch {
    return TEST_AD_ID; // 빌드 번호를 못 읽으면 시험 유닛(광고가 안 뜨는 쪽이 아니라 무효 트래픽이 없는 쪽)
  }
}

let sessionShown = 0; // 세션 상한(§10 하루 5·세션 2) — 앱 프로세스 수명, 저장 안 함
let initDone = false;

/**
 * ★`Capacitor.isPluginAvailable('AdMob')` 단독으로 판정하지 말 것 — 이 플러그인은 **웹 스텁을
 * 등록**해서 브라우저에서도 true다(2026-08-30 실측: 웹 빌드 교환소에 광고 행이 그대로 떴다).
 * 네이티브 여부를 먼저 보고, 그 위에서 플러그인 등록을 확인한다(구셸 = 네이티브지만 플러그인 없음).
 */
export function adsAvailable(): boolean {
  return isNative() && Capacitor.isPluginAvailable('AdMob');
}

export function adsSessionBlocked(): boolean {
  return sessionShown >= AD_SESSION_CAP;
}

async function ensureInit(): Promise<void> {
  if (initDone) return;
  try {
    // UMP 동의를 SDK 초기화·광고 요청보다 먼저(Google 권장 순서). EEA 등 필요 지역에서만 폼이 뜬다.
    const consent = await AdMob.requestConsentInfo();
    if (consent.isConsentFormAvailable && consent.status === AdmobConsentStatus.REQUIRED) {
      await AdMob.showConsentForm();
    }
  } catch {
    /* 동의 흐름 실패 = 기기에 남은 동의 상태로 요청이 나갈 뿐, 앱은 정상 (알림 권한과 같은 결) */
  }
  // 앱은 전체이용가 — 광고 등급 상한을 G로 묶는다(감사 T3-03)
  await AdMob.initialize({ maxAdContentRating: MaxAdContentRating.General });
  initDone = true; // 성공한 뒤에만 — 실패하면 다음 탭에서 동의 확인부터 다시
}

/** 광고 개인정보 선택 진입점이 필요한 지역인가(UMP REQUIRED, EEA·UK 등) — 설정 화면이 이 값으로 행을 보인다 */
export async function adPrivacyOptionsRequired(): Promise<boolean> {
  if (!adsAvailable()) return false;
  try {
    const info = await AdMob.requestConsentInfo();
    return String(info.privacyOptionsRequirementStatus) === 'REQUIRED'; // 플러그인이 이 enum을 내보내지 않는다
  } catch {
    return false;
  }
}

/** 광고 개인정보 선택 폼 열기(Google UMP) */
export async function showAdPrivacyOptions(): Promise<void> {
  if (!adsAvailable()) return;
  await AdMob.showPrivacyOptionsForm().catch(() => undefined);
}

/**
 * 리워드 광고 1회 — 'rewarded'일 때만 지급 자격. 취소·no-fill은 차감 0이 호출자 계약(§10 금지 목록).
 * Rewarded 이벤트 플래그로 판정한다 — show의 resolve만으론 "끝까지 봤는지"를 못 가른다.
 */
export async function showRewarded(): Promise<'rewarded' | 'dismissed' | 'failed'> {
  if (!adsAvailable() || adsSessionBlocked()) return 'failed';
  try {
    await ensureInit();
    let rewarded = false;
    const sub = await AdMob.addListener(RewardAdPluginEvents.Rewarded, () => {
      rewarded = true;
    });
    try {
      await AdMob.prepareRewardVideoAd({ adId: await rewardedAdId() });
      await AdMob.showRewardVideoAd();
    } finally {
      void sub.remove();
    }
    if (!rewarded) return 'dismissed';
    sessionShown += 1;
    return 'rewarded';
  } catch {
    return 'failed';
  }
}
