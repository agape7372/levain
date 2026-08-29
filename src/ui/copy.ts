// 사용자 대면 문구 전체 — 이 파일 한 곳 (전수 감수용). 정본: docs/GDD.md §10.
// 담백한 한 문장. 시스템어·내부 용어·죄책감 유발·느낌표 남발 금지. 빨강 경고 시맨틱 없음.
import { SEED_G } from '../sim';

export const copy = {
  app: { name: '르방이' },

  tabs: { levain: '르방', recipes: '레시피' },

  // 설명서 — 우상단 ? 버튼. 빵 안 구워 본 사람이 첫 화면에서 막히는 지점만 답한다.
  // 읽기 전용(조작 0개). 수치·규칙을 다 옮겨 적는 매뉴얼이 아니라 "이게 뭐냐"에 답하는 자리다.
  help: {
    button: '설명서',   // ? 버튼의 스크린리더 이름 — 제목은 물음 문장이라 버튼 이름으로는 안 맞는다
    title: '이건 뭐예요',
    intro: '천천히 읽어도 괜찮아요. 서두를 일은 하나도 없어요.',
    sections: [
      {
        q: '르방이가 뭐예요',
        a: '밀가루와 물로 기르는 반죽이에요. 밥을 주면 부풀었다가 시간이 지나면 배가 고파져요. 그 리듬을 지켜보는 게 전부예요.',
      },
      {
        q: '위에 있는 가는 선은 뭐예요',
        a: '밥을 준 때부터 다시 배고파질 때까지를 한 줄로 편 거예요. 진한 구간이 가장 잘 부푸는 때고, 점 하나가 지금이에요.',
      },
      {
        q: '왜 어떤 날은 더 빨라요',
        a: '따뜻하면 빨리, 차가우면 천천히 가요. 실온·창가·냉장고를 옮기면 남은 시간도 같이 늘거나 줄어요.',
      },
      {
        q: '오른쪽 항아리는 뭐예요',
        a: `씨앗 ${SEED_G}g만 남기고 떼어낸 반죽을 여기 모아 둬요. 빵은 이 항아리에서 나가요. 밥 준 직후에는 아직 못 떼는데, 눌러 보면 얼마나 기다려야 하는지 알려줘요.`,
      },
      {
        q: '단계는 왜 올라가요',
        a: '밥을 꾸준히 주면 자라요. 단계가 오르면 냉장고에 넣거나, 이름을 붙이거나, 말려 둘 수 있게 돼요.',
      },
      {
        q: '잃을 수도 있나요',
        a: '오래 두면 곰팡이가 펴요. 반점이 보일 때 밥을 주면 아직 괜찮고, 미리 말려 둔 조각이 있으면 거기서 다시 시작할 수 있어요.',
      },
    ],
    // 설명서 안의 축소판 타임라인에만 붙는 이름표 — 홈 화면 선에는 붙이지 않는다
    // (VISUAL §7-2: 눈금 0개·숫자 0개. 이름표는 배우는 자리에서만 준다)
    timeline: { fed: '밥', peak: '한창때', hungry: '배고픔' },
  },

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

  // 보관 통 — 떼어낸 르방이 쌓이는 곳. 빵은 여기서 나간다 (GDD §6-2)
  // ★차단 문구는 있어야 한다 (2026-08-26 되돌림). 2026-08-25엔 "병이 disabled라 탭이 안 뜬다"며
  // 지웠는데 그 disabled가 곧 결함이었다 — 급여 직후가 플레이의 대부분인데 눌러도 무반응이었다.
  // 지금은 병이 항상 눌리고, 잠겼으면 이유와 남은 시간을 말한다.
  split: {
    action: '떼어내기',
    confirm: (g: number) => `씨앗 ${SEED_G}g만 남기고 ${g}g을 떼어 보관할까요?`,
    done: (g: number) => `${g}g을 떼어 보관해두었어요`,
    blockedTooSoon: (left: string) => `밥 준 지 얼마 안 됐어요. ${left} 뒤에 떼어낼 수 있어요`,
    blockedMass: '아직 양이 적어요. 밥을 주면 금방 늘어나요',
    blockedDormant: '자는 동안에는 떼어낼 수 없어요',
  },
  pantry: {
    label: (g: number) => `보관 ${g}g`,
    empty: '보관해둔 르방이 없어요',
    // 힌트 문구는 없앴다(2026-08-26) — 물건이 놓여 있으면 눌러본다. 라벨이 하던 일은
    // 탭 응답(split.blocked*)과 설명서(help)가 대신한다.
    lastWarn: '이걸 구우면 보관해둔 르방이 다 없어져요',
    notEnough: (need: number) => `보관해둔 르방이 ${need}g 필요해요`,
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
    /** ‹ 이름 · 2/3 › — 인라인 조립을 여기로 회수 (문구는 copy.ts 한 파일, 규칙 6) */
    pill: (name: string, index: number, count: number) => `${name} · ${index + 1}/${count}`,
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
      walnut: '호두', cranberry: '크랜베리', fig: '무화과', rosemary: '로즈마리',
      cheese: '치즈', cinnamon: '계피', blueberry: '블루베리', pumpkin: '단호박',
      // 2026-08-26 확장 18종. `poppyseed`는 표준 식품명이 '양귀비씨'지만 아편 연상이 있어
      // 담백 규칙(GDD §10)에 맞게 '포피시드'로 간다 — 되돌리려면 이 줄만 고치면 된다.
      raisin: '건포도', lemon: '레몬', banana: '바나나', apricot: '살구',
      beet: '비트', coconut: '코코넛', pistachio: '피스타치오', oat: '귀리',
      poppyseed: '포피시드', sunflowerseed: '해바라기씨', flaxseed: '아마씨', maple: '메이플',
      redbean: '팥', sweetpotato: '고구마', matcha: '말차', blackgarlic: '흑마늘',
      yuzu: '유자', honey: '꿀',
    } as Record<string, string>,
    formNames: {
      flesh: '과육', slice: '슬라이스', oil: '오일', brine: '브라인',
      chip: '초코칩', cocoa: '코코아', filling: '초코 필링',
      fresh: '생과', roasted: '구운 과일', freezedried: '동결건조', jam: '잼',
      piece: '구운 조각', flour: '밤가루', puree: '퓌레',
      dried: '건조', sprig: '생잎', cube: '큐브', crumble: '크럼블',
      ground: '가루', swirl: '스월', seed: '씨앗',
      flake: '플레이크', // 2026-08-26 확장에서 늘어난 형태는 이것 하나뿐 (압착 귀리)
    } as Record<string, string>,
    /** 변형 표시명 — 같은 재료의 형태끼리 표시가 겹치지 않아야 한다 (과육/슬라이스, 생과/구운) */
    variantName: (ingredientName: string, formName: string, baseName: string) => {
      const formFirst = ['초코칩', '코코아', '초코 필링', '밤가루'];
      if (formFirst.includes(formName)) return `${formName} ${baseName}`;
      switch (formName) {
        // '가루'는 '구운 조각'과 기본 분기에서 표시가 겹친다 (호두 조각 / 호두 가루 → 둘 다 "호두 ~").
        // 밤가루 선례와 같은 꼴로 붙여 쓴다 — 호두가루·치즈가루·계피가루
        case '가루': return `${ingredientName}가루 ${baseName}`;
        case '건조': return `말린 ${ingredientName} ${baseName}`;
        case '크럼블': return `${ingredientName} 크럼블 ${baseName}`;
        case '스월': return `${ingredientName} 스월 ${baseName}`;
        // ★이름이 이미 '씨'/'시드'로 끝나면 접미를 생략한다. 안 그러면 "해바라기씨씨"·"아마씨씨"·
        //   "포피시드씨"가 나온다 — 문자열은 유일해서 **유일성 테스트를 통과하고 한국어만 틀린다**
        //   (filling 함정과 같은 계열). 현행 12종엔 해당 재료가 없어 동작 변화 0이고, 방어만 남는다.
        case '씨앗':
          return /(씨|시드)$/.test(ingredientName)
            ? `${ingredientName} ${baseName}`
            : `${ingredientName}씨 ${baseName}`;
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
    /** 재료 쇼케이스 한 줄 — 호환성 데이터에서 파생한다(재료가 늘어도 문구는 안 는다) */
    ingredientHeadline: (n: number) => (n > 0 ? `빵 ${n}종에 넣을 수 있어요` : ''),
    /** 도감-재료 미발견 탭 — 도감-빵의 variantHint와 같은 자리 */
    // 교환소 안내를 붙인 이유: 이 카드가 뜨는 화면 상단에 교환소 버튼이 있다 — 힌트가 바로 실행된다
    galleryIngredientLocked: '아직 만나지 못한 재료예요 · 교환소에서 가루로 가져올 수 있어요',
    needIngredient: (name: string) => `${name}이(가) 있으면 만들 수 있어요`,
    variantConfirm: (name: string, ingredientName: string, g: number) =>
      `${name}, 처음 만들어 봐요. ${ingredientName} 1개와 르방 ${g}g을 써요`,
    variantHint: '재료가 생기면 새로운 빵을 만들 수 있어요',
    bakeAgain: '다시 만들기',
  },

  // 무료 경제 (확장기획 §9 — Phase 7). 재화 이름은 "가루" 하나.
  // 누적만 말하고 남은 기한·연속 기록은 말하지 않는다 — 실패 개념이 없는 미션이라
  // 재촉 문구가 붙을 자리 자체가 없다 (GDD §10 톤).
  economy: {
    flourLabel: (n: number) => `가루 ${n}개`,
    earned: (n: number) => `가루 ${n}개가 생겼어요`,
    exchangeTitle: '재료 바꾸기',
    exchangeIntro: '가루로 원하는 재료를 가져올 수 있어요',
    have: (n: number) => `${n}개 있어요`,
    haveFull: (n: number) => `${n}개 있어요 · 가득 찼어요`,
    buy: (cost: number) => `가루 ${cost}개로 가져오기`,
    sell: (gain: number) => `가루 ${gain}개로 바꾸기`,
    notEnough: '가루가 조금 모자라요',
    atCap: (cap: number) => `이 재료는 ${cap}개까지 둘 수 있어요`,
    bought: (name: string) => `${name} 1개를 가져왔어요`,
    sold: (n: number) => `가루 ${n}개로 바꿨어요`,
    // 재료 배송(확장기획 §10) — 전부 사용자 선택형. "무료"라고 안 하는 이유: 광고를 대가로
    // 말하는 게 정직하다(죄책감 유발 없이, 담백하게 "영상 보고" 정도로).
    adDeliveryTitle: '영상 보고 재료 받기',
    adDeliveryRemaining: (n: number) => `오늘 ${n}번 더 받을 수 있어요`,
    adDeliveryDone: '오늘은 다 받았어요. 내일 다시 와 주세요',
    adDeliveryWatching: '재생 중…',
    adDeliveryFailed: '영상을 불러오지 못했어요',
    adDeliveryGot: (name: string) => `${name}을(를) 선물로 받았어요`,
    noStock: '바꿀 재료가 없어요',
    missionsTitle: '가루 모으기',
    missionsIntro: '지금까지의 횟수는 그대로 쌓여요',
    missionFeed: (remaining: number, reward: number) =>
      `밥 주기 — ${remaining}번 더 주면 가루 ${reward}개`,
    missionBake: (remaining: number, reward: number) =>
      `빵 굽기 — ${remaining}번 더 구우면 가루 ${reward}개`,
    missionStage: (reward: number) => `르방이가 한 단계 자랄 때마다 가루 ${reward}개`,
    missionRecipe: (done: number, total: number, reward: number) =>
      `처음 만든 빵 ${done}/${total} — 한 종류마다 가루 ${reward}개`,
    missionCount: (n: number) => `지금까지 ${n}번`,
    giftTitle: '첫 재료를 하나 골라요',
    giftBody: '고른 재료로 새로운 빵 하나를 열 수 있어요',
    giftDone: (name: string) => `${name} 1개를 받았어요`,
  },

  notify: {
    channel: '르방이 돌보기',
    feedTime: '밥 시간이에요',
    fridgeWeek: '일주일이 지났어요. 밥 줄 때가 됐어요',
    dormant: '르방이 깊이 잠들었어요. 잊지 말고 깨워 주세요',
    reviveSecond: '다시 밥 줄 시간이에요',
    moldWarn: '르방이 표면에 반점이 보여요. 아직 늦지 않았어요',
    peak: '르방이가 한창 부풀어 있어요. 지금이 굽기 좋은 때예요',
    channelWarn: '중요 알림', // Android 채널명 — 놓치면 잃는 신호(반점·깊은 잠) 전용
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
    peak: (_n: number) => '한창 부풀어 있는 르방이가 있어요',
  } as Record<string, (n: number) => string>,

  settings: {
    title: '설정',
    sound: '소리',
    haptics: '진동',
    notify: '밥 시간 알림',
    notifyPeak: '한창때 알림',
    quiet: '방해 없는 시간',
    quietValue: (s: number, e: number) => (s === e ? '없음' : `${s}시부터 ${e}시까지`),
    quietBody: '이 시간에 걸린 알림은 끝나는 시각으로 미뤄서 보내드려요',
    quietFrom: '시작',
    quietTo: '끝',
    exportSave: '기록 내보내기',
    importSave: '기록 불러오기',
    privacy: '개인정보처리방침',
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
    stirDone: '이대로 깨우기',
    born: '르방이가 태어났어요',
    firstWeek: '첫 일주일은 매일 한두 번 밥을 주면 돼요',
  },

  a11y: {
    // 시각 요소의 보조기술 라벨 — 화면에는 안 보인다
    canvas: '르방이가 사는 유리병',
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
