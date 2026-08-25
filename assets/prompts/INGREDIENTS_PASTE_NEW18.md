# 재료 이미지 생성 프롬프트 — 신규 18종 (그록 일괄 투척 시트)

2026-08-26 확장분. 기존 12종은 `INGREDIENTS_PASTE.md`에 있고 **이미지는 이미 다 받았다** — 이 시트는 신규 18종뿐이다.
정본 양식: `assets/prompts/README.md` + `ingredients/style-shared-ingredient-v1.json`. 기술 레일은 기존과 문자 단위로 동일.

## 하는 법

재료 하나당 **같은 채팅에서** ①→②→③ 순서로 붙여넣고, 나온 이미지를 아래 경로로 저장한다.
**새 채팅에서 ②③만 요청하면 다른 물체가 나온다** — 반드시 같은 대화 안에서 이어 붙일 것.
비율·크기(1:1, 1024)는 프롬프트가 아니라 생성기 UI에서 설정한다.

| 뷰 | 저장 경로 |
|---|---|
| ① three-quarter top-front | `assets/ingredients/src/<id>.png` |
| ② front elevation | `assets/ingredients/src/<id>-2.png` |
| ③ top-down | `assets/ingredients/src/<id>-3.png` |

## 검수 체크리스트 (저장 전)

- 재료가 **하나만**(또는 지정한 개수만), 화면 중앙, 여백 충분한가 — 3뷰가 한 장에 뭉쳐 나오면 폐기
- 배경이 균일한 페일 세이지 단색인가 — 접시·바닥·그림자 있으면 폐기 (3D 변환 시 실루엣 오염)
- 광택·하이라이트 없는 matte인가 — **채도는 높아도 되지만 광택은 안 된다**
  - ⚠**단, 광택 하나로 폐기하지는 마라.** 옛 사유였던 "알베도에 흰 얼룩으로 구워진다"는
    **image-to-3D 시절 얘기**다(2026-08-24에 three.js 절차 모델링으로 바뀌었다).
    지금 빌더는 이미지를 텍스처로 안 쓴다 — **색 정본은 프롬프트 JSON hex이고 이미지는 형태·비율만**
    (`docs/BREADS.md:43`). 광택이 **형태를 가려 못 읽을 때만** 폐기하고, 형태가 읽히면 통과다.
    (실측 2026-08-26: `flaxseed`·`redbean`이 스페큘러로 걸렸으나 형태가 읽혀 통과시켰다)
- `비고`의 결정적 특징이 살아 있는가 (건포도 주름, 레몬 속껍질 링, 바나나 씨점, 벌집 육각 격자 등)
- 얼굴·눈·표정이 없는가 (무캐릭터 — 특히 흑마늘·고구마)
- **혼동 주의 3쌍**: 유자≠레몬(울퉁불퉁 통과일 vs 매끈 슬라이스) · 고구마 속살은 **보라**(주황이면 폐기) · 꿀은 **벌집 조각**(액체 웅덩이면 폐기)

---

# 배치 1 — 과일·채소 (6종)

## 건포도 `raisin` — 대표 형태 `dried`

비고: 쭈글쭈글한 주름을 결정적 특징으로 명시했다 — 매끈하면 올리브(#3B2F2F 계열)와 실루엣이 구분되지 않는다. 포도 연상(그레이프 클러스터·덩굴·와인)과 광택 있는 생과일 피부를 negative로 명시 차단했다.

**①**

```
A cozy low-poly stylized 3D render of a small loose pile of five wrinkled raisins, a single game asset object on a plain backdrop. Geometry: five small oblong raisins piled loosely together in a low irregular heap, each one covered in deep puckered wrinkles running along its length, no smooth or glossy stretches, one raisin tilted to show its wrinkled end. Surface: a deep near-black brown body (#2E2018) with darker shadow pooling deep in the wrinkle creases (#1D130D) and a warm brown catching the raised ridges between creases (#55402A) — expressed purely as flat color facets, never as shine. Overall style: low-poly faceted geometry, soft clay-like matte shading, saturated jewel-tone ingredient color against the warm pastel scene palette, miniature diorama feel, flat color facets, clean simple silhouette, stylized 3D game asset render. Camera: three-quarter top-front view, object centered with a 15% margin. Background: solid pale sage (#DFEAE0), no props, no floor texture, no horizon line. Lighting: single soft key light upper-left plus soft ambient fill, no harsh shadows, no cast shadow or contact shadow on the background. Stylized matte render only — no photorealism, no glossy plastic, no grape, no grape cluster, no vine, no stem, no fresh fruit, no wine, no glossy skin, no text, no watermark, no plate, no board, no props, no hands, no people, no characters, no facial features.
```

**②**

```
Same exact a small loose pile of five wrinkled raisins, identical proportions, colors, and surface details — now shown in a front elevation view (straight-on side view). Same solid pale sage #DFEAE0 background, object centered, no props, no cast shadow.
```

**③**

```
Same exact a small loose pile of five wrinkled raisins, identical proportions, colors, and surface details — now shown in a top-down view (directly from above). Same solid pale sage #DFEAE0 background, object centered, no props, no cast shadow.
```

---

## 레몬 `lemon` — 대표 형태 `slice`

비고: 속껍질 방사 링과 과육 칸막이를 결정적 특징으로 명시했다 — 없으면 그냥 노란 원반으로 보인다. '통레몬'·칵테일·음료 연상을 negative로 차단해 단면 슬라이스만 나오게 했다.

**①**

```
A cozy low-poly stylized 3D render of two lemon slices, one standing upright and the other leaning against it, a single game asset object on a plain backdrop. Geometry: two thin round lemon slices, one propped upright and the other leaning behind it with its base slightly overlapping, each ringed by a scalloped peel rim and divided into wedge-shaped pulp segments by thin radiating membrane walls meeting at a small central pith. Surface: a vivid yellow-green rind ring (#C8D63E) framing a bright yellow pulp body (#DCCB33) divided into wedge segments by thin ivory-white pith membranes (#F5F0D6), with a deeper golden-yellow shading the lower shaded segments (#A89426) — expressed purely as flat color facets, never as shine. Overall style: low-poly faceted geometry, soft clay-like matte shading, saturated jewel-tone ingredient color against the warm pastel scene palette, miniature diorama feel, flat color facets, clean simple silhouette, stylized 3D game asset render. Camera: three-quarter top-front view, object centered with a 15% margin. Background: solid pale sage (#DFEAE0), no props, no floor texture, no horizon line. Lighting: single soft key light upper-left plus soft ambient fill, no harsh shadows, no cast shadow or contact shadow on the background. Stylized matte render only — no photorealism, no glossy plastic, no whole lemon only, no lemon tree, no leaves, no juice, no glass, no cocktail, no drink, no ice, no text, no watermark, no plate, no board, no props, no hands, no people, no characters, no facial features.
```

**②**

```
Same exact two lemon slices, one standing upright and the other leaning against it, identical proportions, colors, and surface details — now shown in a front elevation view (straight-on side view). Same solid pale sage #DFEAE0 background, object centered, no props, no cast shadow.
```

**③**

```
Same exact two lemon slices, one standing upright and the other leaning against it, identical proportions, colors, and surface details — now shown in a top-down view (directly from above). Same solid pale sage #DFEAE0 background, object centered, no props, no cast shadow.
```

---

## 바나나 `banana` — 대표 형태 `slice`

비고: 가운데 씨점 링을 결정적 특징으로 명시했다 — 없으면 그냥 노란 원반이 되어 레몬 조각과 실루엣이 헷갈린다. 통바나나·스무디·아이스크림 등 가공품 연상을 negative로 차단했다.

**①**

```
A cozy low-poly stylized 3D render of three banana coin slices arranged in a small overlapping row, a single game asset object on a plain backdrop. Geometry: three flat round banana coin slices arranged in a small overlapping row, each with a thin peel rim and a small ring of tiny seed-flecks marking the center. Surface: a soft yellow flesh body (#E8D46A) with a slightly deeper shaded underside (#D0BA52), a thin golden-brown peel rim (#C4A83E), and a small ring of dark seed-flecks marking the center of each slice (#8A6B2E) — expressed purely as flat color facets, never as shine. Overall style: low-poly faceted geometry, soft clay-like matte shading, saturated jewel-tone ingredient color against the warm pastel scene palette, miniature diorama feel, flat color facets, clean simple silhouette, stylized 3D game asset render. Camera: three-quarter top-front view, object centered with a 15% margin. Background: solid pale sage (#DFEAE0), no props, no floor texture, no horizon line. Lighting: single soft key light upper-left plus soft ambient fill, no harsh shadows, no cast shadow or contact shadow on the background. Stylized matte render only — no photorealism, no glossy plastic, no whole banana, no peel, no bunch, no monkey, no smoothie, no split, no ice cream, no text, no watermark, no plate, no board, no props, no hands, no people, no characters, no facial features.
```

**②**

```
Same exact three banana coin slices arranged in a small overlapping row, identical proportions, colors, and surface details — now shown in a front elevation view (straight-on side view). Same solid pale sage #DFEAE0 background, object centered, no props, no cast shadow.
```

**③**

```
Same exact three banana coin slices arranged in a small overlapping row, identical proportions, colors, and surface details — now shown in a top-down view (directly from above). Same solid pale sage #DFEAE0 background, object centered, no props, no cast shadow.
```

---

## 살구 `apricot` — 대표 형태 `dried`

비고: 씨 자국 오목한 자리와 가장자리 쭈글거림을 결정적 특징으로 명시했다 — 없으면 살구인지 복숭아인지 구분 안 된다. 생과일·씨 있는 통과일·잎사귀 연상을 negative로 차단했다.

**①**

```
A cozy low-poly stylized 3D render of three dried apricot halves arranged in a small row, a single game asset object on a plain backdrop. Geometry: three dried apricot halves resting cut-side up in a small row, each with a shallow concave pit hollow sunk into the center and softly puckered, wrinkled edges around the rim. Surface: a warm burnt-orange body (#E0A05C) with a deeper shadowed pit hollow sunk into the center of each half (#B97538), softly wrinkled rim edges in a muted amber (#C4813F), and a paler warm highlight catching the plumper upper faces (#EFC08A) — expressed purely as flat color facets, never as shine. Overall style: low-poly faceted geometry, soft clay-like matte shading, saturated jewel-tone ingredient color against the warm pastel scene palette, miniature diorama feel, flat color facets, clean simple silhouette, stylized 3D game asset render. Camera: three-quarter top-front view, object centered with a 15% margin. Background: solid pale sage (#DFEAE0), no props, no floor texture, no horizon line. Lighting: single soft key light upper-left plus soft ambient fill, no harsh shadows, no cast shadow or contact shadow on the background. Stylized matte render only — no photorealism, no glossy plastic, no fresh apricot, no whole fruit with pit, no peach, no orange fruit, no leaves, no branch, no jar, no text, no watermark, no plate, no board, no props, no hands, no people, no characters, no facial features.
```

**②**

```
Same exact three dried apricot halves arranged in a small row, identical proportions, colors, and surface details — now shown in a front elevation view (straight-on side view). Same solid pale sage #DFEAE0 background, object centered, no props, no cast shadow.
```

**③**

```
Same exact three dried apricot halves arranged in a small row, identical proportions, colors, and surface details — now shown in a top-down view (directly from above). Same solid pale sage #DFEAE0 background, object centered, no props, no cast shadow.
```

---

## 비트 `beet` — 대표 형태 `roasted`

비고: 평평한 절단면의 동심원 나이테를 결정적 특징으로 명시했다. 자홍색 절단면이 핏빛·생살로 오독될 위험이 커서 '무광 점토질'을 표면 서술에 직접 박고 blood·raw meat·viscera·glossy wet surface를 negative에 명시 차단했다. 수프(보르시)·잎채소 연상도 함께 막았다.

**①**

```
A cozy low-poly stylized 3D render of a single roasted beet root sliced in half lengthwise, a single game asset object on a plain backdrop. Geometry: one round beet root sliced in half lengthwise, its flat cut face turned toward the camera and marked with concentric rings radiating from the center, framed by a thin dark skin rim around the outer curve and a short trimmed stub on top where the leaves were removed. Surface: a matte magenta cut face (#A83368) marked with alternating concentric rings of deeper plum-magenta (#7A2350) and paler dusty pink (#C4548A) radiating from the center like tree rings, framed by a thin deep maroon-brown skin rim (#5C2438) — rendered as dry matte clay-like flesh, expressed purely as flat color facets, never as shine, never wet or glossy. Overall style: low-poly faceted geometry, soft clay-like matte shading, saturated jewel-tone ingredient color against the warm pastel scene palette, miniature diorama feel, flat color facets, clean simple silhouette, stylized 3D game asset render. Camera: three-quarter top-front view, object centered with a 15% margin. Background: solid pale sage (#DFEAE0), no props, no floor texture, no horizon line. Lighting: single soft key light upper-left plus soft ambient fill, no harsh shadows, no cast shadow or contact shadow on the background. Stylized matte render only — no photorealism, no glossy plastic, no soup, no borscht, no bowl, no blood, no raw meat, no viscera, no leafy greens, no beet greens, no juice, no glossy wet surface, no text, no watermark, no plate, no board, no props, no hands, no people, no characters, no facial features.
```

**②**

```
Same exact a single roasted beet root sliced in half lengthwise, identical proportions, colors, and surface details — now shown in a front elevation view (straight-on side view). Same solid pale sage #DFEAE0 background, object centered, no props, no cast shadow.
```

**③**

```
Same exact a single roasted beet root sliced in half lengthwise, identical proportions, colors, and surface details — now shown in a top-down view (directly from above). Same solid pale sage #DFEAE0 background, object centered, no props, no cast shadow.
```

---

## 코코넛 `coconut` — 대표 형태 `dried`

비고: 가장자리를 살짝 구운 갈색으로 명시해 흰 눈덩이처럼 안 보이게 했다 — 세트에서 유일한 크림색 재료라 순백으로 나오면 배경(페일 세이지)과 대비만 남고 질감이 안 보인다. 통코코넛·음료·디저트 연상을 negative로 차단했다.

**①**

```
A cozy low-poly stylized 3D render of a small loose pile of shredded dried coconut, a single game asset object on a plain backdrop. Geometry: a small loose heap of thin curled coconut shreds piled together in an irregular low mound, thread-like strands overlapping with a few tips curling upward at the edges. Surface: a near-white ivory shred body (#EFE6D2) with soft shadow pooling between overlapping strands (#D8CDB4), scattered strand tips toasted to a light golden-brown at their edges (#B08A52), and a few deeper toasted-brown flecks scattered through the pile (#8F6B3C) — expressed purely as flat color facets, never as shine. Overall style: low-poly faceted geometry, soft clay-like matte shading, saturated jewel-tone ingredient color against the warm pastel scene palette, miniature diorama feel, flat color facets, clean simple silhouette, stylized 3D game asset render. Camera: three-quarter top-front view, object centered with a 15% margin. Background: solid pale sage (#DFEAE0), no props, no floor texture, no horizon line. Lighting: single soft key light upper-left plus soft ambient fill, no harsh shadows, no cast shadow or contact shadow on the background. Stylized matte render only — no photorealism, no glossy plastic, no whole coconut, no coconut shell, no palm tree, no milk, no drink, no cocktail, no piña colada, no cake, no frosting, no snow, no text, no watermark, no plate, no board, no props, no hands, no people, no characters, no facial features.
```

**②**

```
Same exact a small loose pile of shredded dried coconut, identical proportions, colors, and surface details — now shown in a front elevation view (straight-on side view). Same solid pale sage #DFEAE0 background, object centered, no props, no cast shadow.
```

**③**

```
Same exact a small loose pile of shredded dried coconut, identical proportions, colors, and surface details — now shown in a top-down view (directly from above). Same solid pale sage #DFEAE0 background, object centered, no props, no cast shadow.
```

---

# 배치 2 — 견과·시드 (6종)

## 피스타치오 `pistachio` — 대표 형태 `piece`

비고: 쪼개진 반쪽의 홈(#EDE4C0)과 얇은 자주빛 속껍질 잔흔(#8B5D6E)이 결정적 특징이다 — 이게 없으면 그냥 초록 콩으로 보인다. '아이스크림'·'염료' negative는 생성기가 채도 높은 초록을 파스텔 민트나 식용색소처럼 그리는 걸 막는다.

**①**

```
A cozy low-poly stylized 3D render of a small cluster of four to five shelled pistachio kernels, one split in half, a single game asset object on a plain backdrop. Geometry: four to five plump oblong kernels resting together in a loose cluster, one kernel split lengthwise into two lobes to reveal the groove between them, none overlapping the group's silhouette. Surface: a soft yellow-green body (#8FA84A) with a deeper olive-green shadow (#6E8A38) on the lower curves, a pale ivory groove (#EDE4C0) inside the split kernel's cleft, and a thin dusty-mauve skin remnant (#8B5D6E) clinging to the edge of the split lobe — expressed purely as flat color facets, never as shine. Overall style: low-poly faceted geometry, soft clay-like matte shading, saturated jewel-tone ingredient color against the warm pastel scene palette, miniature diorama feel, flat color facets, clean simple silhouette, stylized 3D game asset render. Camera: three-quarter top-front view, object centered with a 15% margin. Background: solid pale sage (#DFEAE0), no props, no floor texture, no horizon line. Lighting: single soft key light upper-left plus soft ambient fill, no harsh shadows, no cast shadow or contact shadow on the background. Stylized matte render only — no photorealism, no glossy plastic, no shell, no nut in shell, no pistachio ice cream, no green dye, no bright neon green, no bowl, no nutcracker, no text, no watermark, no plate, no board, no props, no hands, no people, no characters, no facial features.
```

**②**

```
Same exact a small cluster of four to five shelled pistachio kernels, one split in half, identical proportions, colors, and surface details — now shown in a front elevation view (straight-on side view). Same solid pale sage #DFEAE0 background, object centered, no props, no cast shadow.
```

**③**

```
Same exact a small cluster of four to five shelled pistachio kernels, one split in half, identical proportions, colors, and surface details — now shown in a top-down view (directly from above). Same solid pale sage #DFEAE0 background, object centered, no props, no cast shadow.
```

---

## 귀리 `oat` — 대표 형태 `flake`

비고: 압착 귀리(플레이크)가 대표 형태라서 '통귀리(groats)'·'밀 이삭'을 negative로 막았다 — 생성기가 밀밭 사진이나 통곡물 알갱이로 끌고 가는 경향이 있어서다. 납작한 원반 실루엣과 가장자리 결(#8F7A54)이 압착 질감의 핵심 단서다.

**①**

```
A cozy low-poly stylized 3D render of a low mound of rolled oat flakes with three flakes separated in front, a single game asset object on a plain backdrop. Geometry: a low loose mound of pressed oat flakes heaped together, with three individual flat oval flakes separated and lying in front of the mound, each flake a thin pressed disc with a slightly curled edge. Surface: a warm tan body (#D7C7A3) with a deeper toasted-oat shadow (#B8A47D) pooling in the pressed folds, a pale cream highlight (#EDE0C4) catching the flattened top faces, and a darker umber edge ridge (#8F7A54) tracing each flake's curled rim — expressed purely as flat color facets, never as shine. Overall style: low-poly faceted geometry, soft clay-like matte shading, saturated jewel-tone ingredient color against the warm pastel scene palette, miniature diorama feel, flat color facets, clean simple silhouette, stylized 3D game asset render. Camera: three-quarter top-front view, object centered with a 15% margin. Background: solid pale sage (#DFEAE0), no props, no floor texture, no horizon line. Lighting: single soft key light upper-left plus soft ambient fill, no harsh shadows, no cast shadow or contact shadow on the background. Stylized matte render only — no photorealism, no glossy plastic, no oat groats, no whole grain kernels, no porridge, no milk, no bowl, no spoon, no oat field, no straw, no wheat ears, no text, no watermark, no plate, no board, no props, no hands, no people, no characters, no facial features.
```

**②**

```
Same exact a low mound of rolled oat flakes with three flakes separated in front, identical proportions, colors, and surface details — now shown in a front elevation view (straight-on side view). Same solid pale sage #DFEAE0 background, object centered, no props, no cast shadow.
```

**③**

```
Same exact a low mound of rolled oat flakes with three flakes separated in front, identical proportions, colors, and surface details — now shown in a top-down view (directly from above). Same solid pale sage #DFEAE0 background, object centered, no props, no cast shadow.
```

---

## 포피시드 `poppyseed` — 대표 형태 `seed`

비고: 씨앗 3종 중 세트에서 가장 미세한 알갱이다 — 실루엣 서술에 '해바라기씨 커널의 1/5 크기'를 못박아 저폴리 변환·64px 썸네일에서 얼룩으로 뭉개지는 걸 막았다. 마약 연상(opium/capsule/drug)은 재료 정체성과 무관한 오염이라 강하게 차단했다.

**①**

```
A cozy low-poly stylized 3D render of a low mound of poppy seeds with three seeds enlarged in front, a single game asset object on a plain backdrop. Geometry: a low fine mound of countless tiny round poppy seeds heaped together, with three single seeds pulled forward and shown larger for clarity — each a plain round dot, the smallest and finest grain in the pantry, roughly one-fifth the size of a shelled sunflower seed kernel. Surface: a deep blue-black body (#2B2A38) with a near-black shadow (#1B1A24) sinking into the mound's crevices, a soft slate-gray highlight (#45424F) catching the rounded tops of the enlarged front seeds, and a faint dusty violet-gray fleck (#5A5568) breaking up the mass — expressed purely as flat color facets, never as shine. Overall style: low-poly faceted geometry, soft clay-like matte shading, saturated jewel-tone ingredient color against the warm pastel scene palette, miniature diorama feel, flat color facets, clean simple silhouette, stylized 3D game asset render. Camera: three-quarter top-front view, object centered with a 15% margin. Background: solid pale sage (#DFEAE0), no props, no floor texture, no horizon line. Lighting: single soft key light upper-left plus soft ambient fill, no harsh shadows, no cast shadow or contact shadow on the background. Stylized matte render only — no photorealism, no glossy plastic, no poppy flower, no opium, no pod, no capsule, no drug, no bowl, no spoon, no bagel, no cake, no text, no watermark, no plate, no board, no props, no hands, no people, no characters, no facial features.
```

**②**

```
Same exact a low mound of poppy seeds with three seeds enlarged in front, identical proportions, colors, and surface details — now shown in a front elevation view (straight-on side view). Same solid pale sage #DFEAE0 background, object centered, no props, no cast shadow.
```

**③**

```
Same exact a low mound of poppy seeds with three seeds enlarged in front, identical proportions, colors, and surface details — now shown in a top-down view (directly from above). Same solid pale sage #DFEAE0 background, object centered, no props, no cast shadow.
```

---

## 해바라기씨 `sunflowerseed` — 대표 형태 `seed`

비고: 씨앗 3종 중 세트에서 가장 큰 씨앗이다 — '포피시드의 5배'로 명시해 크기 대비를 못박았다. 껍질째가 아니라 깐 커널이 대표 형태라 줄무늬 껍질은 옅은 잔흔 한 줄(#6B6558)만 남기고 negative로 차단했다.

**①**

```
A cozy low-poly stylized 3D render of a small cluster of five to six shelled sunflower seed kernels, a single game asset object on a plain backdrop. Geometry: five to six plump teardrop-shaped kernels resting together in a loose cluster, each a fat rounded droplet tapering to a blunt point — the largest and fullest seed shape in the pantry, roughly five times the size of a single poppy seed. Surface: a muted grayish-brown body (#4A4640) with a darker umber-gray shadow (#332F2A) on the lower curve, a pale taupe highlight (#8C8478) catching the plump upper faces, and a faint ghost-pale stripe (#6B6558) tracing the kernel's long axis where the hull once gripped — expressed purely as flat color facets, never as shine. Overall style: low-poly faceted geometry, soft clay-like matte shading, saturated jewel-tone ingredient color against the warm pastel scene palette, miniature diorama feel, flat color facets, clean simple silhouette, stylized 3D game asset render. Camera: three-quarter top-front view, object centered with a 15% margin. Background: solid pale sage (#DFEAE0), no props, no floor texture, no horizon line. Lighting: single soft key light upper-left plus soft ambient fill, no harsh shadows, no cast shadow or contact shadow on the background. Stylized matte render only — no photorealism, no glossy plastic, no sunflower, no flower head, no petals, no shell, no striped hull, no bird feeder, no oil, no bottle, no text, no watermark, no plate, no board, no props, no hands, no people, no characters, no facial features.
```

**②**

```
Same exact a small cluster of five to six shelled sunflower seed kernels, identical proportions, colors, and surface details — now shown in a front elevation view (straight-on side view). Same solid pale sage #DFEAE0 background, object centered, no props, no cast shadow.
```

**③**

```
Same exact a small cluster of five to six shelled sunflower seed kernels, identical proportions, colors, and surface details — now shown in a top-down view (directly from above). Same solid pale sage #DFEAE0 background, object centered, no props, no cast shadow.
```

---

## 아마씨 `flaxseed` — 대표 형태 `seed`

비고: 씨앗 3종 중 크기·형태 위계의 중간이다 — '포피시드보다 크고 해바라기씨보다 작게'로 상대 서술을 못박았다. 납작하고 한쪽 끝이 뾰족한 타원 실루엣이 나머지 둘과 구분되는 형태 단서다.

**①**

```
A cozy low-poly stylized 3D render of a low mound of flaxseeds with three seeds separated in front, a single game asset object on a plain backdrop. Geometry: a low mound of flat oval flaxseeds heaped together, with three individual seeds separated and enlarged in front of the mound — each a flat teardrop-oval tapering to one pointed end, larger than a poppy seed but smaller and flatter than a shelled sunflower seed kernel. Surface: a dark chocolate-brown body (#58381A) with a deeper umber shadow (#3E2611) pooling along the tapered point, a warm amber highlight (#A8794A) catching the flat top facet, and a lighter honey-tan rim (#C79A5C) tracing the seed's edge — expressed purely as flat color facets, never as shine. Overall style: low-poly faceted geometry, soft clay-like matte shading, saturated jewel-tone ingredient color against the warm pastel scene palette, miniature diorama feel, flat color facets, clean simple silhouette, stylized 3D game asset render. Camera: three-quarter top-front view, object centered with a 15% margin. Background: solid pale sage (#DFEAE0), no props, no floor texture, no horizon line. Lighting: single soft key light upper-left plus soft ambient fill, no harsh shadows, no cast shadow or contact shadow on the background. Stylized matte render only — no photorealism, no glossy plastic, no flax flower, no blue flower, no linen, no fabric, no oil, no bottle, no capsule, no supplement, no bowl, no text, no watermark, no plate, no board, no props, no hands, no people, no characters, no facial features.
```

**②**

```
Same exact a low mound of flaxseeds with three seeds separated in front, identical proportions, colors, and surface details — now shown in a front elevation view (straight-on side view). Same solid pale sage #DFEAE0 background, object centered, no props, no cast shadow.
```

**③**

```
Same exact a low mound of flaxseeds with three seeds separated in front, identical proportions, colors, and surface details — now shown in a top-down view (directly from above). Same solid pale sage #DFEAE0 background, object centered, no props, no cast shadow.
```

---

## 메이플 `maple` — 대표 형태 `piece`

비고: 색만으로는 밤·계피와 구분이 안 된다 — 단풍잎 실루엣(다섯 갈래 잎+뾰족한 잎끝+깊은 잎맥 골)이 정체성의 전부다. 액체 시럽이 아니라 고형 캔디이므로 '따르기/드리즐/젖은 광택'을 강하게 차단했다.

**①**

```
A cozy low-poly stylized 3D render of a small cluster of three maple-leaf-shaped maple sugar candies, a single game asset object on a plain backdrop. Geometry: three solid maple-leaf-shaped candy pieces resting together in a loose cluster, each a flat five-lobed leaf silhouette with pointed tips and deep sinuses between the lobes, one candy tilted to show its edge thickness. Surface: a warm caramel-tan body (#B8823A) with a deeper toffee-brown groove (#8F6224) sunk into the leaf's veins, a pale honey highlight (#D9A85C) on the raised facets between the veins, and a light cream edge (#E8C787) tracing the leaf's thin candy rim — expressed purely as flat color facets, never as shine. Overall style: low-poly faceted geometry, soft clay-like matte shading, saturated jewel-tone ingredient color against the warm pastel scene palette, miniature diorama feel, flat color facets, clean simple silhouette, stylized 3D game asset render. Camera: three-quarter top-front view, object centered with a 15% margin. Background: solid pale sage (#DFEAE0), no props, no floor texture, no horizon line. Lighting: single soft key light upper-left plus soft ambient fill, no harsh shadows, no cast shadow or contact shadow on the background. Stylized matte render only — no photorealism, no glossy plastic, no maple syrup, no liquid, no bottle, no jug, no pancake, no waffle, no pouring, no drizzle, no tree, no branch, no autumn leaves on ground, no wet glossy surface, no text, no watermark, no plate, no board, no props, no hands, no people, no characters, no facial features.
```

**②**

```
Same exact a small cluster of three maple-leaf-shaped maple sugar candies, identical proportions, colors, and surface details — now shown in a front elevation view (straight-on side view). Same solid pale sage #DFEAE0 background, object centered, no props, no cast shadow.
```

**③**

```
Same exact a small cluster of three maple-leaf-shaped maple sugar candies, identical proportions, colors, and surface details — now shown in a top-down view (directly from above). Same solid pale sage #DFEAE0 background, object centered, no props, no cast shadow.
```

---

# 배치 3 — 한국계·기타 (6종)

## 팥 `redbean` — 대표 형태 `swirl`

비고: 소용돌이 형태로 반죽에 감아 넣는 소를 표현했고, 통팥 알갱이(#3D1818)를 매끈한 페이스트(#6B2E2E)와 대비시켜 결정적 식별점을 만들었다. 앙팥빵·도라야키·초콜릿 오인을 negative로 막았다.

**①**

```
A cozy low-poly stylized 3D render of a single swirled mound of red bean paste with whole beans set into its surface, a single game asset object on a plain backdrop. Geometry: one rounded mound of red bean paste coiled inward from its outer edge into a tight spiral, the spiral seam visible winding across the top face, two or three whole red beans nestled into the surface where the seam meets. Surface: a deep maroon-red paste body (#6B2E2E) with a darker plum shadow (#522020) sunk into the spiral groove and a warmer lit ridge (#85453B) along the outer coil, with two or three whole beans in a near-black deep red (#3D1818) set into the surface for contrast — expressed purely as flat color facets, never as shine. Overall style: low-poly faceted geometry, soft clay-like matte shading, saturated jewel-tone ingredient color against the warm pastel scene palette, miniature diorama feel, flat color facets, clean simple silhouette, stylized 3D game asset render. Camera: three-quarter top-front view, object centered with a 15% margin. Background: solid pale sage (#DFEAE0), no props, no floor texture, no horizon line. Lighting: single soft key light upper-left plus soft ambient fill, no harsh shadows, no cast shadow or contact shadow on the background. Stylized matte render only — no photorealism, no glossy plastic, no red bean bun, no bread, no anpan, no dorayaki, no pancake stack, no bowl of soup, no porridge, no whole beans only, no dried beans, no chocolate, no text, no watermark, no plate, no board, no props, no hands, no people, no characters, no facial features.
```

**②**

```
Same exact a single swirled mound of red bean paste with whole beans set into its surface, identical proportions, colors, and surface details — now shown in a front elevation view (straight-on side view). Same solid pale sage #DFEAE0 background, object centered, no props, no cast shadow.
```

**③**

```
Same exact a single swirled mound of red bean paste with whole beans set into its surface, identical proportions, colors, and surface details — now shown in a top-down view (directly from above). Same solid pale sage #DFEAE0 background, object centered, no props, no cast shadow.
```

---

## 고구마 `sweetpotato` — 대표 형태 `roasted`

비고: 껍질(#4A2F5C)과 속살(#7A5296)을 뚜렷한 보라 계열로 고정했다 — 속살이 주황이면 단호박과 구분이 안 되므로 orange flesh·yellow flesh를 막았다. 길쭉한 덩이는 얼굴을 새기기 쉬운 피사체라 carved face·eyes·smile·anthropomorphic·mascot을 전부 negative에 넣었다.

**①**

```
A cozy low-poly stylized 3D render of a single purple sweet potato sliced diagonally in half, cut face toward the viewer, a single game asset object on a plain backdrop. Geometry: one elongated tapered tuber with softly knobby rounded ends, sliced at a shallow diagonal angle near one end, the flat cut face turned toward the camera to reveal the flesh inside. Surface: a deep plum-purple skin (#4A2F5C) with a lighter violet sheen (#5F3E73) along its ridges, and a vivid violet-purple cut flesh (#7A5296) scattered with faint pale lilac starch flecks (#9B79B0) radiating from the center — expressed purely as flat color facets, never as shine. Overall style: low-poly faceted geometry, soft clay-like matte shading, saturated jewel-tone ingredient color against the warm pastel scene palette, miniature diorama feel, flat color facets, clean simple silhouette, stylized 3D game asset render. Camera: three-quarter top-front view, object centered with a 15% margin. Background: solid pale sage (#DFEAE0), no props, no floor texture, no horizon line. Lighting: single soft key light upper-left plus soft ambient fill, no harsh shadows, no cast shadow or contact shadow on the background. Stylized matte render only — no photorealism, no glossy plastic, no orange flesh, no yellow flesh, no sweet potato fries, no candied, no 맛탕, no glazed, no syrup, no marshmallow, no casserole, no whole unpeeled only, no leaves, no vine, no carved face, no eyes, no smile, no anthropomorphic, no mascot, no text, no watermark, no plate, no board, no props, no hands, no people, no characters, no facial features.
```

**②**

```
Same exact a single purple sweet potato sliced diagonally in half, cut face toward the viewer, identical proportions, colors, and surface details — now shown in a front elevation view (straight-on side view). Same solid pale sage #DFEAE0 background, object centered, no props, no cast shadow.
```

**③**

```
Same exact a single purple sweet potato sliced diagonally in half, cut face toward the viewer, identical proportions, colors, and surface details — now shown in a top-down view (directly from above). Same solid pale sage #DFEAE0 background, object centered, no props, no cast shadow.
```

---

## 말차 `matcha` — 대표 형태 `ground`

비고: 계피 가루 둔덕과 실루엣이 같은 형태라 색으로만 구분되므로 채도를 최대한 높였다(#5C8A3A). 가루의 미세한 단차(stepped terracing)를 결정적 특징으로 명시해 매끈한 원뿔로 뭉개지지 않게 했다.

**①**

```
A cozy low-poly stylized 3D render of a low mound of matcha powder with a light dusting spilling forward, a single game asset object on a plain backdrop. Geometry: one low wide cone of fine powder with a gently rounded peak, a thin trailing scatter of loose powder spilling forward from its base, subtle stepped terracing along the slope where the sifted powder has settled in fine layers. Surface: a vivid matcha green body (#5C8A3A) with a darker shaded green (#446B29) low on the mound and a brighter lit green (#7FAE55) catching the peak, with a paler sifted dusting (#A8CB7E) scattered at the base — expressed purely as flat color facets, never as shine. Overall style: low-poly faceted geometry, soft clay-like matte shading, saturated jewel-tone ingredient color against the warm pastel scene palette, miniature diorama feel, flat color facets, clean simple silhouette, stylized 3D game asset render. Camera: three-quarter top-front view, object centered with a 15% margin. Background: solid pale sage (#DFEAE0), no props, no floor texture, no horizon line. Lighting: single soft key light upper-left plus soft ambient fill, no harsh shadows, no cast shadow or contact shadow on the background. Stylized matte render only — no photorealism, no glossy plastic, no tea leaves, no whisk, no chasen, no bowl, no chawan, no latte, no drink, no foam, no cup, no spoon, no scoop, no tea plantation, no text, no watermark, no plate, no board, no props, no hands, no people, no characters, no facial features.
```

**②**

```
Same exact a low mound of matcha powder with a light dusting spilling forward, identical proportions, colors, and surface details — now shown in a front elevation view (straight-on side view). Same solid pale sage #DFEAE0 background, object centered, no props, no cast shadow.
```

**③**

```
Same exact a low mound of matcha powder with a light dusting spilling forward, identical proportions, colors, and surface details — now shown in a top-down view (directly from above). Same solid pale sage #DFEAE0 background, object centered, no props, no cast shadow.
```

---

## 흑마늘 `blackgarlic` — 대표 형태 `piece`

비고: 생마늘의 흰색이 아니라 발효로 검게 변한 색(#3A2E28)을 주색으로 고정했다. 쪽 특유의 곡선 초승달 단면이 사람 얼굴·이빨로 읽히기 쉬워 carved face·eyes·smile·teeth·anthropomorphic·mascot을 전부 negative에 박았다.

**①**

```
A cozy low-poly stylized 3D render of three fermented black garlic cloves resting together, a single game asset object on a plain backdrop. Geometry: three individual garlic cloves in a small loose cluster, each with the characteristic curved crescent cross-section and a tapered pointed tip, thin papery skin fragments clinging to the outer curve of each clove, none overlapping the group's silhouette. Surface: a deep near-black brown body (#3A2E28) with a darker shadowed crescent (#2A211D) along the inner curve and a warmer lit facet (#52443B) on the outer curve, with a thin pale papery skin remnant (#6B5C4E) clinging to one edge of each clove — expressed purely as flat color facets, never as shine. Overall style: low-poly faceted geometry, soft clay-like matte shading, saturated jewel-tone ingredient color against the warm pastel scene palette, miniature diorama feel, flat color facets, clean simple silhouette, stylized 3D game asset render. Camera: three-quarter top-front view, object centered with a 15% margin. Background: solid pale sage (#DFEAE0), no props, no floor texture, no horizon line. Lighting: single soft key light upper-left plus soft ambient fill, no harsh shadows, no cast shadow or contact shadow on the background. Stylized matte render only — no photorealism, no glossy plastic, no white garlic, no raw garlic, no garlic bulb, no braid, no whole head, no cloves in skin only, no sprout, no green shoot, no press, no carved face, no eyes, no smile, no teeth, no anthropomorphic, no mascot, no text, no watermark, no plate, no board, no props, no hands, no people, no characters, no facial features.
```

**②**

```
Same exact three fermented black garlic cloves resting together, identical proportions, colors, and surface details — now shown in a front elevation view (straight-on side view). Same solid pale sage #DFEAE0 background, object centered, no props, no cast shadow.
```

**③**

```
Same exact three fermented black garlic cloves resting together, identical proportions, colors, and surface details — now shown in a top-down view (directly from above). Same solid pale sage #DFEAE0 background, object centered, no props, no cast shadow.
```

---

## 유자 `yuzu` — 대표 형태 `fresh`

비고: 레몬과의 혼동이 최대 위험이라 매끈·뾰족한 레몬 실루엣과 반대로 우툴두툴한 뒴프·납작한 둥근 형태를 명시하고 smooth peel·pointed ends·lemon을 negative 최상단에 막았다. 꼭지 자리 오목함(#7A6B2E)을 결정적 디테일로 넣었다.

**①**

```
A cozy low-poly stylized 3D render of a single whole yuzu citrus fruit, a single game asset object on a plain backdrop. Geometry: one squat round citrus fruit, flattened slightly at both poles rather than pointed, its entire surface covered in an uneven bumpy dimpled rind, with a small concave indentation at the stem end where the fruit attaches to the branch. Surface: a warm mustard-yellow rind (#D4C13A) with a deeper shaded tone (#B39D2A) low on the fruit and a brighter lit facet (#E6D766) on the upper bumps, with a small darker olive dimple (#7A6B2E) marking the stem-end indentation — expressed purely as flat color facets, never as shine. Overall style: low-poly faceted geometry, soft clay-like matte shading, saturated jewel-tone ingredient color against the warm pastel scene palette, miniature diorama feel, flat color facets, clean simple silhouette, stylized 3D game asset render. Camera: three-quarter top-front view, object centered with a 15% margin. Background: solid pale sage (#DFEAE0), no props, no floor texture, no horizon line. Lighting: single soft key light upper-left plus soft ambient fill, no harsh shadows, no cast shadow or contact shadow on the background. Stylized matte render only — no photorealism, no glossy plastic, no lemon, no smooth peel, no pointed ends, no orange, no mandarin, no juice, no tea, no jar, no honey, no drink, no slice, no cut, no leaves, no branch, no text, no watermark, no plate, no board, no props, no hands, no people, no characters, no facial features.
```

**②**

```
Same exact a single whole yuzu citrus fruit, identical proportions, colors, and surface details — now shown in a front elevation view (straight-on side view). Same solid pale sage #DFEAE0 background, object centered, no props, no cast shadow.
```

**③**

```
Same exact a single whole yuzu citrus fruit, identical proportions, colors, and surface details — now shown in a top-down view (directly from above). Same solid pale sage #DFEAE0 background, object centered, no props, no cast shadow.
```

---

## 꿀 `honey` — 대표 형태 `jam`

비고: 액체 웅덩이는 저폴리 3D로 표현이 안 되므로 벌집(honeycomb) 조각을 대표 형태로 고정했다 — 육각 격자(#A67A28 셀)가 정체성 전부다. 굳어서 멈춘 꿀 덩이(#8F5F1D)는 한 모서리에만 두어 liquid pool·drizzle로 번지지 않게 막았다.

**①**

```
A cozy low-poly stylized 3D render of a single thick slab of honeycomb with a pooled drop of set honey at one corner, a single game asset object on a plain backdrop. Geometry: one thick rectangular slab of honeycomb, its face covered in a rigid grid of hexagonal cells, broken slightly along one edge to reveal the cell depth, with a single rounded blob of hardened honey pooled at one corner of the slab. Surface: a warm golden amber comb body (#C99A3D) with darker recessed hexagonal cells (#A67A28) and a brighter lit ridge (#E0B65C) along the raised cell walls, with a deeper amber pooled honey blob (#8F5F1D) hardened at one corner — expressed purely as flat color facets, never as shine. Overall style: low-poly faceted geometry, soft clay-like matte shading, saturated jewel-tone ingredient color against the warm pastel scene palette, miniature diorama feel, flat color facets, clean simple silhouette, stylized 3D game asset render. Camera: three-quarter top-front view, object centered with a 15% margin. Background: solid pale sage (#DFEAE0), no props, no floor texture, no horizon line. Lighting: single soft key light upper-left plus soft ambient fill, no harsh shadows, no cast shadow or contact shadow on the background. Stylized matte render only — no photorealism, no glossy plastic, no bee, no bees, no hive, no beekeeper, no honey dipper, no wand, no jar, no bottle, no pouring, no drizzle, no liquid pool, no wet glossy surface, no flowers, no tea, no toast, no text, no watermark, no plate, no board, no props, no hands, no people, no characters, no facial features.
```

**②**

```
Same exact a single thick slab of honeycomb with a pooled drop of set honey at one corner, identical proportions, colors, and surface details — now shown in a front elevation view (straight-on side view). Same solid pale sage #DFEAE0 background, object centered, no props, no cast shadow.
```

**③**

```
Same exact a single thick slab of honeycomb with a pooled drop of set honey at one corner, identical proportions, colors, and surface details — now shown in a top-down view (directly from above). Same solid pale sage #DFEAE0 background, object centered, no props, no cast shadow.
```

---
