// 광고 포트 초기화 순서(platform/ads.ts) — AdMob 플러그인 목업. 감사 T2-08 · T3-03 회귀.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  log: [] as string[],
  initFail: 0,
  consentFail: false,
  rewardCb: null as null | (() => void),
}));

vi.mock('@capacitor/core', () => ({ Capacitor: { isPluginAvailable: () => true } }));
vi.mock('@capacitor-community/admob', () => ({
  AdmobConsentStatus: { REQUIRED: 'REQUIRED' },
  MaxAdContentRating: { General: 'General' },
  RewardAdPluginEvents: { Rewarded: 'onRewardedVideoAdReward' },
  AdMob: {
    initialize: async (o?: { maxAdContentRating?: string }) => {
      h.log.push(`initialize ${o?.maxAdContentRating}`);
      if (h.initFail > 0) {
        h.initFail -= 1;
        throw new Error('init fail');
      }
    },
    requestConsentInfo: async () => {
      h.log.push('requestConsentInfo');
      if (h.consentFail) throw new Error('offline');
      return { status: 'REQUIRED', isConsentFormAvailable: true, canRequestAds: false, privacyOptionsRequirementStatus: 'REQUIRED' };
    },
    showConsentForm: async () => { h.log.push('showConsentForm'); },
    showPrivacyOptionsForm: async () => { h.log.push('showPrivacyOptionsForm'); },
    addListener: async (_e: string, cb: () => void) => { h.rewardCb = cb; return { remove: async () => undefined }; },
    prepareRewardVideoAd: async () => { h.log.push('prepare'); },
    showRewardVideoAd: async () => { h.log.push('show'); h.rewardCb?.(); },
  },
}));
vi.mock('../src/platform/native', () => ({ isNative: () => true }));
vi.mock('../src/sim', () => ({ AD_SESSION_CAP: 2 }));

async function freshAds(): Promise<typeof import('../src/platform/ads')> {
  vi.resetModules();
  return import('../src/platform/ads');
}

beforeEach(() => {
  h.log.length = 0;
  h.initFail = 0;
  h.consentFail = false;
});

describe('T2-08 초기화 실패는 다음 시도에서 다시 초기화한다', () => {
  it('1차 initialize 실패 → 2차에서 동의 확인이 먼저, 그다음 initialize, 그다음 광고', async () => {
    const ads = await freshAds();
    h.initFail = 1;
    expect(await ads.showRewarded()).toBe('failed');
    expect(h.log).not.toContain('prepare');
    h.log.length = 0;
    expect(await ads.showRewarded()).toBe('rewarded');
    expect(h.log).toEqual(['requestConsentInfo', 'showConsentForm', 'initialize General', 'prepare', 'show']);
  });

  it('성공한 뒤엔 다시 초기화하지 않는다', async () => {
    const ads = await freshAds();
    await ads.showRewarded();
    h.log.length = 0;
    await ads.showRewarded();
    expect(h.log).toEqual(['prepare', 'show']);
  });

  it('동의 확인이 실패해도(오프라인) 초기화·광고 흐름은 이어진다', async () => {
    const ads = await freshAds();
    h.consentFail = true;
    expect(await ads.showRewarded()).toBe('rewarded');
    expect(h.log).toEqual(['requestConsentInfo', 'initialize General', 'prepare', 'show']);
  });
});

describe('T2-08 ③ 개인정보 선택 진입점(설정 화면 연결은 다른 담당)', () => {
  it('UMP가 REQUIRED면 true, 폼 열기는 showPrivacyOptionsForm', async () => {
    const ads = await freshAds();
    expect(await ads.adPrivacyOptionsRequired()).toBe(true);
    await ads.showAdPrivacyOptions();
    expect(h.log).toContain('showPrivacyOptionsForm');
  });

  it('동의 정보 조회가 실패하면 false', async () => {
    const ads = await freshAds();
    h.consentFail = true;
    expect(await ads.adPrivacyOptionsRequired()).toBe(false);
  });
});
