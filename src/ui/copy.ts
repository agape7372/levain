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
    moldy: '곰팡이가 피었어요',
  },

  smell: {
    flour: '고소한 밀가루 냄새가 나요',
    yogurt: '요거트처럼 새콤한 냄새예요',
    vinegar: '식초 기운이 살짝 돌아요',
    sharp: '코가 찡한 시큼함이에요',
    acetone: '아세톤 비슷한 냄새가 나요. 배가 많이 고프다는 신호예요 — 넉넉한 밥이면 돌아와요',
  },

  // 진단 — 곰팡이로 오판하기 쉬운 무해 상태들 (실제 르방의 오판 1순위들)
  diagnosis: {
    kahm: '주름진 흰 막이 덮였어요. 곰팡이는 아니에요 — 밥을 주면 사라져요',
    greySurface: '표면이 잿빛이에요. 겉모습만 그래요, 속은 자고 있어요',
    moldSpot: '표면에 작은 반점이 생겼어요. 밥을 주면 아직 괜찮아요',
    moldSpread: '반점이 번지고 있어요. 지금 밥을 주면 살릴 수 있어요',
    moldDeadline: (at: string) => `이대로 두면 ${at}쯤 곰팡이가 펴요`,
  },

  // 곰팡이 사망 — 사실 서술 + 위로 한 문장. 원인 추궁·'~했더라면' 금지 (GDD §10)
  mold: {
    deadTitle: '보풀 같은 곰팡이가 피었어요. 이 아이는 여기까지예요',
    comfort: '오래 키우다 보면 있는 일이에요',
    hasFlake: '말려 둔 조각이 있어요. 며칠이면 다시 깨어날 수 있어요',
    noFlake: '새 반죽으로 다시 시작할 수 있어요. 구운 빵의 기록은 남아요',
    restore: '말린 조각으로 잇기',
    discard: '보내주고 새로 시작하기',
    restored: '말린 조각에 물을 주었어요. 천천히 깨어날 거예요',
    discarded: '새 반죽을 시작했어요. 지난 기록은 도감에 남아 있어요',
  },

  // 건조 플레이크 — 죽음 보험 (실제 관행: 얇게 펴 말려 보관)
  flake: {
    action: '말려두기',
    confirm: '얇게 펴서 말려둘까요? 르방 20g을 써요',
    made: '얇게 펴 말려두었어요. 무슨 일이 생겨도 이 조각으로 돌아올 수 있어요',
    hasOne: (ago: string) => `${ago} 전에 말려둔 조각이 있어요`,
    blockedPhase: '활발할 때 말릴 수 있어요',
    blockedMass: '르방이 조금 부족해요. 밥을 주고 불려 보세요',
  },

  // 복귀 브리핑 — 부재 중 있었던 일 (시간순)
  briefing: {
    title: '그동안 있었던 일',
    peaked: '한껏 부풀었다가 가라앉았어요',
    becameHungry: '배가 고파졌어요',
    becameSour: '조금 시큼해졌어요',
    hoochAppeared: '표면에 액체가 고였어요. 배고픔의 신호예요',
    wentDormant: '깊이 잠들었어요',
    moldSpotted: '표면에 반점이 생겼어요',
    moldSpread: '반점이 번졌어요',
    moldDied: '곰팡이가 피었어요',
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
    // 묶음 프리셋 — 밥 + 냉장 이동을 1탭으로 (§7-1 "냉장 갈 준비". 3단계 해금과 동행)
    fridgePrep: '냉장 갈 준비',
    fridgePrepHint: '밥 주고 바로 냉장고로',
    // 상세 펼치기 (§7-1 — 성숙 4단계 해금): 밀가루 선택 + 피크 범위 예보
    detailOpen: '자세히',
    detailClose: '접기',
    flourTitle: '어떤 가루로 줄까요',
    flourNames: { white: '다목적', wholewheat: '통밀', rye: '호밀' } as Record<string, string>,
    flourHint: {
      white: '늘 먹던 밥이에요',
      wholewheat: '조금 빨리 자라요',
      rye: '빨리 자라고 잘 시어져요',
    } as Record<string, string>,
    // 범위로 말한다 (§19-1) — "정답 시간" 단정 금지
    peakForecast: (from: string, to: string) => `${from}~${to} 뒤쯤 가장 부풀 거예요`,
    peakForecastWindow: '창가에선 더 일러요',
  },

  observe: {
    lastFed: (ago: string) => `${ago} 전에 밥을 먹었어요`,
    nextFeed: (at: string) => `${at}쯤 배고파질 거예요`,
    // 범위로 말한다 — 실제 르방도 "정답 시간"이 없다 (§19-1, 상태·온도로 변동)
    peak: (from: string, to: string) => `${from}~${to} 뒤쯤 가장 부풀어요`,
    peakNow: '지금이 한창때예요',
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

  devMode: {
    on: '개발자 모드가 켜졌어요',
    title: '개발자',
    mature: '르방이 만렙 (5단계·재료량 가득)',
    ingredients: '재료 전부 +9',
    addStarter: '새 르방이 추가',
    slotsFull: '병이 세 개까지예요',
    collection: '도감 전부 완성',
    done: '됐어요',
  },

  starter: {
    /** 이름이 없을 때 표시 파생 — 저장하지 않는다 (확장기획 §5-3) */
    defaultName: (ordinal: number) => `르방이 ${ordinal}`,
    prev: '이전 르방이',
    next: '다음 르방이',
    add: '새 르방이',
    addConfirm: '새 반죽으로 르방이를 하나 더 시작할까요?',
    added: '새 르방이가 태어났어요',
    slotsFull: '병이 세 개까지예요',
  },

  recipes: {
    lockedHint: (stageName: string) => `${stageName} 단계가 되면 열려요`,
    discardCooldown: '다음 밥을 준 뒤에 또 만들 수 있어요',
    needMass: '르방이 조금 부족해요. 밥을 주고 불려 보세요',
    discardDone: '따끈하게 구웠어요',
    madeCount: (n: number) => `${n}번 만들었어요`,
    costSuffix: (g: number) => `르방 ${g}g`,
    bakeConfirm: (name: string, g: number) => {
      const last = name.charCodeAt(name.length - 1);
      const hasBatchim = last >= 0xac00 && last <= 0xd7a3 && (last - 0xac00) % 28 !== 0;
      return `${name}${hasBatchim ? '을' : '를'} 구울까요? 르방 ${g}g을 써요`;
    },
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
    // ── Phase 6 — 세그먼트·도감·변형 (§8, 2026-08-24 개편: [레시피|도감]-[빵|재료]) ──
    segments: { recipes: '레시피', gallery: '도감' },
    galleryTabs: { bread: '빵', ingredient: '재료' },
    retapHint: '레시피 탭을 한 번 더 누르면 도감이 열려요',
    galleryMysteryBase: '아직 만나지 못한 빵이에요',
    bakeTitle: (name: string) => name,
    bakePlain: (name: string) => `기본 ${name}`,
    bakeWithIngredient: (ing: string) => `${ing} 1개를 넣어요`,
    ingredientNames: {
      olive: '올리브', choco: '초콜릿', strawberry: '딸기', chestnut: '밤',
    } as Record<string, string>,
    formNames: {
      flesh: '과육', slice: '슬라이스', oil: '오일', brine: '브라인',
      chip: '초코칩', cocoa: '코코아', filling: '초코 필링',
      fresh: '생과', roasted: '구운 과일', freezedried: '동결건조', jam: '잼',
      piece: '구운 조각', flour: '밤가루', puree: '퓌레',
    } as Record<string, string>,
    /** 변형 표시명 — 같은 재료의 형태끼리 표시가 겹치지 않아야 한다 (과육/슬라이스, 생과/구운) */
    variantName: (ingredientName: string, formName: string, baseName: string) => {
      const formFirst = ['초코칩', '코코아', '초코 필링', '밤가루'];
      if (formFirst.includes(formName)) return `${formName} ${baseName}`;
      switch (formName) {
        case '잼': return `${ingredientName} 스월 ${baseName}`;
        case '오일': return `${ingredientName}유 ${baseName}`;
        case '슬라이스': return `${ingredientName} 슬라이스 ${baseName}`;
        case '브라인': return `${ingredientName} 브라인 ${baseName}`;
        case '구운 과일': return `구운 ${ingredientName} ${baseName}`;
        case '동결건조': return `동결건조 ${ingredientName} ${baseName}`;
        case '퓌레': return `${ingredientName} 퓌레 ${baseName}`;
        default: return `${ingredientName} ${baseName}`; // 과육·생과·구운 조각 = 대표 형태
      }
    },
    ingredientCount: (n: number) => `${n}개`,
    needIngredient: (name: string) => `${name}이(가) 있으면 만들 수 있어요`,
    variantConfirm: (name: string, ingredientName: string, g: number) =>
      `${name}, 처음 만들어 봐요. ${ingredientName} 1개와 르방 ${g}g을 써요`,
    variantHint: '재료가 생기면 새로운 빵을 만들 수 있어요',
    bakeAgain: '다시 만들기',
  },

  notify: {
    channel: '르방이 돌보기',
    feedTime: '밥 시간이에요',
    fridgeWeek: '일주일이 지났어요. 밥 줄 때가 됐어요',
    dormant: '르방이 깊이 잠들었어요. 잊지 말고 깨워 주세요',
    reviveSecond: '다시 밥 줄 시간이에요',
    moldWarn: '르방이 표면에 반점이 보여요. 아직 늦지 않았어요',
    permissionHint: '밥 시간을 알려드릴까요',
    permissionSettings: '알림은 시스템 설정에서 켤 수 있어요',
  },

  // 멀티 르방 집계 문구 (확장기획 §5-6) — 같은 슬롯을 여러 르방이 원할 때.
  // 발화 시각엔 가장 이른 한 마리만 해당될 수 있어 문구는 모호-수량형을 우선한다
  notifyMany: {
    feedTime: (n: number) => `르방이 ${n}개가 밥을 기다리고 있어요`,
    fridgeWeek: (_n: number) => '일주일이 지났어요. 냉장고의 르방이를 봐 주세요',
    dormant: (_n: number) => '깊이 잠든 르방이가 있어요. 잊지 말고 깨워 주세요',
    reviveSecond: (_n: number) => '다시 밥 줄 시간이에요',
    moldWarn: (_n: number) => '표면에 반점이 보이는 르방이가 있어요. 아직 늦지 않았어요',
  } as Record<string, (n: number) => string>,

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
