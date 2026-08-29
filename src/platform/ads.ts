// 보상형 광고 포트 — @capacitor-community/admob 래퍼. 정본: 확장기획 §10.
// 웹·구셸(플러그인 없는 APK)에선 adsAvailable()=false — UI가 슬롯 자체를 숨긴다.
// 버전 스큐 방어가 이 한 줄이다: OTA가 광고 UI를 실어도 죽은 버튼이 생기지 않는다.
//
// SSV(서버 검증)는 백엔드 0이라 미사용 — 클라이언트 보상(§10-1, 정책 위반 아님·리스크 수용).
// 초기화는 지연(lazy): 첫 슬롯 사용 때만 SDK를 깨운다 — 앱 시작 비용 0, §10 금지(시작 광고)와도 결.
import { Capacitor } from '@capacitor/core';
import {
  AdMob,
  AdmobConsentStatus,
  RewardAdPluginEvents,
} from '@capacitor-community/admob';
import { AD_SESSION_CAP } from '../sim';
import { isNative } from './native';

/**
 * Google 공식 리워드 테스트 유닛 — 실기기에서도 테스트 광고가 재생된다.
 * ★실 유닛 ID 발급(AdMob 콘솔)은 사용자 게이트 — 발급되면 이 상수만 교체.
 */
const REWARDED_AD_ID = 'ca-app-pub-3940256099942544/5224354917';

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
  initDone = true;
  await AdMob.initialize();
  try {
    // UMP 동의 — EEA 등 필요 지역에서만 폼이 뜬다. 실패해도 광고 요청은 SDK가 알아서 제한.
    const consent = await AdMob.requestConsentInfo();
    if (consent.isConsentFormAvailable && consent.status === AdmobConsentStatus.REQUIRED) {
      await AdMob.showConsentForm();
    }
  } catch {
    /* 동의 흐름 실패 = 광고가 안 나올 뿐, 앱은 정상 (알림 권한과 같은 결) */
  }
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
      await AdMob.prepareRewardVideoAd({ adId: REWARDED_AD_ID });
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
