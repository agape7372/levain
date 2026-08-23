// 사용자 대면 문구 전체 — 이 파일 한 곳 (전수 감수용). 정본: docs/GDD.md §10.
// 담백한 한 문장. 시스템어·내부 용어·죄책감 유발·느낌표 남발 금지. 빨강 경고 시맨틱 없음.

export const copy = {
  app: { name: '르방이' },

  tabs: { levain: '르방', recipes: '레시피' },

  phase: {
    active: '잘 지내고 있어요',
    peak: '한창 부풀어 있어요',
    hungry: '밥 먹을 시간이에요',
    sour: '조금 시큼해졌어요',
    dormant: '깊이 잠들어 있어요',
    reviving: '천천히 깨어나는 중이에요',
  },

  smell: {
    flour: '고소한 밀가루 냄새가 나요',
    yogurt: '요거트처럼 새콤한 냄새예요',
    vinegar: '식초 기운이 살짝 돌아요',
    sharp: '코가 찡한 시큼함이에요',
    acetone: '아세톤 비슷한 냄새가 나요. 밥을 자주 주면 돌아와요',
  },

  actions: {
    feed: '밥 주기',
    wake: '깨우기',
    observe: '살펴보기',
    floatTest: '물에 띄워보기',
    bake: '굽기',
    move: { room: '실온', window: '창가', fridge: '냉장고' },
  },

  feed: {
    ratioTitle: '어떻게 줄까요',
    ratioHint: {
      '1:1:1': '반나절이면 부풀어요',
      '1:2:2': '하루짜리 든든한 밥이에요',
      '1:5:5': '밤새 천천히 자라요',
    },
    done: '맛있게 먹었어요',
    tooSoon: '아직 배부른가 봐요',
  },

  observe: {
    lastFed: (ago: string) => `${ago} 전에 밥을 먹었어요`,
    nextFeed: (at: string) => `${at}쯤 배고파질 거예요`,
    peak: (at: string) => `${at}쯤 가장 부풀어요`,
    massG: (g: number) => `지금 ${g}g이에요`,
  },

  floatTest: {
    ok: '동동 떠요. 지금 굽기 좋아요',
    notYet: (left: string) => `아직 가라앉아요. ${left}쯤 더 기다려 보세요`,
  },

  revive: {
    needRoom: '실온에 두고 밥을 주세요',
    started: '한 술 먹였어요. 12시간쯤 뒤에 다시 밥을 주세요',
    tooSoon: '아직 소화 중이에요. 조금 더 기다려요',
    done: '다시 숨쉬기 시작했어요',
    comfort: '괜찮아요. 르방은 잘 버텨요',
  },

  stage: {
    names: ['갓 반죽', '잠잠기', '첫 기포', '어린 르방', '성숙 르방', '노포'] as const,
    up: (name: string) => `${name} 단계가 되었어요`,
    fakeRise: '크게 부풀었어요. 곧 조용해질 거예요, 정상이에요',
    quietWeek: '이 시기는 원래 조용해요',
    labelUnlocked: '병에 이름표를 붙일 수 있어요',
  },

  recipes: {
    lockedHint: (stageName: string) => `${stageName} 단계가 되면 열려요`,
    discardCooldown: '다음 밥을 준 뒤에 또 만들 수 있어요',
    needMass: '르방이 조금 부족해요. 밥을 주고 불려 보세요',
    discardDone: '따끈하게 구웠어요',
    madeCount: (n: number) => `${n}번 만들었어요`,
    costSuffix: (g: number) => `르방 ${g}g`,
    bakeConfirm: (name: string, g: number) => `${name}을(를) 구울까요? 르방 ${g}g을 써요`,
    grades: { best: '최고예요', good: '잘 구웠어요', flat: '조금 납작해요. 그래도 맛있어요' },
    names: {
      pancake: '팬케이크', cracker: '크래커', scone: '스콘',
      flatbread: '플랫브레드', focaccia: '포카치아', loaf: '식빵',
      baguette: '바게트', campagne: '깜빠뉴', rye: '호밀빵', wholewheat: '통밀 깜빠뉴',
    } as Record<string, string>,
    flavor: {
      pancake: '덜어낸 반죽으로 굽는 폭신한 아침',
      cracker: '바삭하게 말린 짭짤한 간식',
      scone: '결이 살아있는 담백한 스콘',
      flatbread: '팬에 바로 굽는 넓적한 빵',
      focaccia: '올리브 향의 폭신한 이탈리아 빵',
      loaf: '보들보들한 매일의 식빵',
      baguette: '겉은 바삭, 속은 쫄깃한 막대빵',
      campagne: '시골빵 — 사워도우의 정석',
      rye: '시큼함이 오히려 맛이 되는 빵',
      wholewheat: '통밀의 구수함을 담은 깜빠뉴',
    } as Record<string, string>,
  },

  notify: {
    channel: '르방이 돌보기',
    feedTime: '밥 시간이에요',
    fridgeWeek: '일주일이 지났어요. 밥 줄 때가 됐어요',
    dormant: '르방이 깊이 잠들었어요. 언제든 깨울 수 있어요',
    reviveSecond: '다시 밥 줄 시간이에요',
    permissionHint: '밥 시간을 알려드릴까요',
    permissionSettings: '알림은 시스템 설정에서 켤 수 있어요',
  },

  settings: {
    title: '설정',
    sound: '소리',
    haptics: '진동',
    notify: '밥 시간 알림',
    exportSave: '기록 내보내기',
    importSave: '기록 불러오기',
    reset: '처음부터 다시 시작',
    resetConfirm: '지금까지의 기록이 모두 사라져요. 정말 다시 시작할까요?',
    resetConfirm2: '구운 빵 기록도 함께 사라져요. 마지막으로 한 번 더 확인해요',
    exported: '기록을 내보냈어요',
    imported: '기록을 불러왔어요',
    importFailed: '이 파일은 읽을 수 없어요',
  },

  save: {
    corrupted: '저장된 기록을 읽을 수 없어 새로 시작해요',
    writeFailed: '기록을 못 남겼어요. 다시 해볼게요',
  },

  onboarding: {
    welcome: '밀가루와 물로 새 생명을 깨워 볼까요',
    stir: '천천히 저어 주세요',
    born: '르방이가 태어났어요',
    firstWeek: '첫 일주일은 매일 한두 번 밥을 주면 돼요',
  },

  time: {
    // format.ts가 사용하는 단위 문구
    justNow: '방금',
    minutes: (n: number) => `${n}분`,
    hours: (n: number) => `${n}시간`,
    days: (n: number) => `${n}일`,
  },
} as const;

export type Copy = typeof copy;
