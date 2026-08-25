# 재료 이미지 생성 프롬프트 — 그록 일괄 투척 시트 (재료 12종 × 3뷰 = 36장)

정본 양식: `assets/prompts/README.md`(v2 절차) + `ingredients/style-shared-ingredient-v1.json`.
빵 시트(`GROK_PASTE.md`)와 같은 축 — 기술 레일은 동일하고 오브젝트 채도만 완화했다.

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
- 광택·하이라이트 없는 matte인가 (알베도에 흰 얼룩으로 구워진다) — **채도는 높아도 되지만 광택은 안 된다**
- `비고`의 결정적 특징(블루베리 꼭대기 꼭대기, 무화과 단면, 호두 두 엽 등)이 살아 있는가
- 얼굴·눈·표정이 없는가 (무캐릭터 규칙 — 특히 단호박)

---

## 올리브 `olive` — 대표 형태 `flesh`

비고: 배이스 빵 focaccia--olive-flesh.json의 과육 색(#3B2F2F)을 그대로 계승했다. '올리브'가 지중해식 토핑(치즈·토마토)을 연상시키기 쉬워 negative로 명시 차단했고, 병·그릇도 막았다(단일 오브젝트 규칙).

**①**

```
A cozy low-poly stylized 3D render of a small cluster of three whole black olives, a single game asset object on a plain backdrop. Geometry: three plump oval olives resting together in a low group, one tilted to show its blunt end, none overlapping the group's silhouette. Surface: a deep aubergine-black body (#3B2F2F) with a slightly warmer brown-black (#4A3A36) on the shaded lower halves and a muted olive-green cast (#5C6B3E) catching the upper faces — expressed purely as flat color facets, never as shine. Overall style: low-poly faceted geometry, soft clay-like matte shading, saturated jewel-tone ingredient color against the warm pastel scene palette, miniature diorama feel, flat color facets, clean simple silhouette, stylized 3D game asset render. Camera: three-quarter top-front view, object centered with a 15% margin. Background: solid pale sage (#DFEAE0), no props, no floor texture, no horizon line. Lighting: single soft key light upper-left plus soft ambient fill, no harsh shadows, no cast shadow or contact shadow on the background. Stylized matte render only — no photorealism, no glossy plastic, no cheese topping, no tomato slices, no extra glossy oil sheen, no brine liquid, no jar, no bowl, no text, no watermark, no plate, no board, no props, no hands, no people, no characters, no facial features.
```

**②**

```
Same exact a small cluster of three whole black olives, identical proportions, colors, and surface details — now shown in a front elevation view (straight-on side view). Same solid pale sage #DFEAE0 background, object centered, no props, no cast shadow.
```

**③**

```
Same exact a small cluster of three whole black olives, identical proportions, colors, and surface details — now shown in a top-down view (directly from above). Same solid pale sage #DFEAE0 background, object centered, no props, no cast shadow.
```

---

## 초콜릿 `choco` — 대표 형태 `chip`

비고: 녹은 초콜·드리즐을 negative로 막았다 — 초콜릿은 생성기가 광택·유동 표현으로 끌고 가는 대표 재료다. 3D 변환을 위해 칩 개수를 5~7개로 제한했다.

**①**

```
A cozy low-poly stylized 3D render of a small heap of chocolate chips, a single game asset object on a plain backdrop. Geometry: five to seven teardrop-shaped chips piled in a low mound, each a rounded cone with a flat base and a soft pointed tip, none overlapping the mound's silhouette. Surface: a deep cocoa brown body (#4A3428) with a lighter warm brown (#6B4E3D) on the upper faces where light lands and a darker seam (#37241B) where chips meet — expressed purely as flat color facets, never as shine. Overall style: low-poly faceted geometry, soft clay-like matte shading, saturated jewel-tone ingredient color against the warm pastel scene palette, miniature diorama feel, flat color facets, clean simple silhouette, stylized 3D game asset render. Camera: three-quarter top-front view, object centered with a 15% margin. Background: solid pale sage (#DFEAE0), no props, no floor texture, no horizon line. Lighting: single soft key light upper-left plus soft ambient fill, no harsh shadows, no cast shadow or contact shadow on the background. Stylized matte render only — no photorealism, no glossy plastic, no melted chocolate, no chocolate sauce, no drizzle, no wrapper, no foil, no bowl, no text, no watermark, no plate, no board, no props, no hands, no people, no characters, no facial features.
```

**②**

```
Same exact a small heap of chocolate chips, identical proportions, colors, and surface details — now shown in a front elevation view (straight-on side view). Same solid pale sage #DFEAE0 background, object centered, no props, no cast shadow.
```

**③**

```
Same exact a small heap of chocolate chips, identical proportions, colors, and surface details — now shown in a top-down view (directly from above). Same solid pale sage #DFEAE0 background, object centered, no props, no cast shadow.
```

---

## 딸기 `strawberry` — 대표 형태 `fresh`

비고: 딸기는 크림·초콜 코팅 연상이 강해 negative에 모두 넣었다. 씨앗 점은 구멍이 아니라 밝은 점으로 — 어두운 원형 함몰 금지 규칙(VISUAL §2)과 같은 이유.

**①**

```
A cozy low-poly stylized 3D render of a single ripe strawberry, a single game asset object on a plain backdrop. Geometry: one heart-shaped berry standing upright, widest near the top and tapering to a rounded point at the bottom, with a small five-leaf calyx and a short stub of stem on top. Surface: a saturated scarlet body (#C0392F) with a deeper red (#96271F) in the shaded lower half and a warm coral blush (#DC6151) on the upper faces; small pale seed dimples (#F4E3C4) are scattered evenly across the surface; the calyx leaves are a fresh green (#6B7E4A) — all expressed purely as flat color facets, never as shine. Overall style: low-poly faceted geometry, soft clay-like matte shading, saturated jewel-tone ingredient color against the warm pastel scene palette, miniature diorama feel, flat color facets, clean simple silhouette, stylized 3D game asset render. Camera: three-quarter top-front view, object centered with a 15% margin. Background: solid pale sage (#DFEAE0), no props, no floor texture, no horizon line. Lighting: single soft key light upper-left plus soft ambient fill, no harsh shadows, no cast shadow or contact shadow on the background. Stylized matte render only — no photorealism, no glossy plastic, no cream, no whipped cream, no chocolate coating, no sugar, no syrup, no juice droplets, no bowl, no text, no watermark, no plate, no board, no props, no hands, no people, no characters, no facial features.
```

**②**

```
Same exact a single ripe strawberry, identical proportions, colors, and surface details — now shown in a front elevation view (straight-on side view). Same solid pale sage #DFEAE0 background, object centered, no props, no cast shadow.
```

**③**

```
Same exact a single ripe strawberry, identical proportions, colors, and surface details — now shown in a top-down view (directly from above). Same solid pale sage #DFEAE0 background, object centered, no props, no cast shadow.
```

---

## 밤 `chestnut` — 대표 형태 `piece`

비고: 가시 껍질(burr)을 negative로 막았다 — '밤'은 가시집 달린 모습으로 나오기 쉬운데, 그러면 실루에이 과잡해져 3D 변환이 깨진다.

**①**

```
A cozy low-poly stylized 3D render of a single roasted chestnut, a single game asset object on a plain backdrop. Geometry: one plump nut with a broad rounded dome on top narrowing to a flat oval base, and a small pointed tuft at the very top. Surface: a warm russet-brown shell (#7A5638) with a darker brown (#5E4029) in the shaded lower half, a pale oatmeal patch (#D9C4A0) across the flat base where the shell meets the ground, and a single shallow split line (#C68B5B) running down one side — expressed purely as flat color facets, never as shine. Overall style: low-poly faceted geometry, soft clay-like matte shading, saturated jewel-tone ingredient color against the warm pastel scene palette, miniature diorama feel, flat color facets, clean simple silhouette, stylized 3D game asset render. Camera: three-quarter top-front view, object centered with a 15% margin. Background: solid pale sage (#DFEAE0), no props, no floor texture, no horizon line. Lighting: single soft key light upper-left plus soft ambient fill, no harsh shadows, no cast shadow or contact shadow on the background. Stylized matte render only — no photorealism, no glossy plastic, no spiky husk, no burr, no green shell, no leaves, no basket, no bowl, no text, no watermark, no plate, no board, no props, no hands, no people, no characters, no facial features.
```

**②**

```
Same exact a single roasted chestnut, identical proportions, colors, and surface details — now shown in a front elevation view (straight-on side view). Same solid pale sage #DFEAE0 background, object centered, no props, no cast shadow.
```

**③**

```
Same exact a single roasted chestnut, identical proportions, colors, and surface details — now shown in a top-down view (directly from above). Same solid pale sage #DFEAE0 background, object centered, no props, no cast shadow.
```

---

## 호두 `walnut` — 대표 형태 `piece`

비고: 손바닥 놓은 것은 껍질이 아니라 **알맹이 반쪽**이다 — 껍질은 호두로 안 읽히고 표면 요철이 심해 저폴리로 무너진다. 골(fold)은 주름이 아니라 두 엽 덩어리로 단순화했다.

**①**

```
A cozy low-poly stylized 3D render of a single walnut half, kernel side up, a single game asset object on a plain backdrop. Geometry: one oval half-kernel with a rounded outline, its top face folded into two lobes separated by a shallow central groove, and a flat underside. Surface: a warm tan kernel (#C89B6A) with deeper amber (#9A6E42) inside the folds and grooves, and a thin papery pale-gold film (#E0C79A) catching the raised ridges — expressed purely as flat color facets, never as shine. Overall style: low-poly faceted geometry, soft clay-like matte shading, saturated jewel-tone ingredient color against the warm pastel scene palette, miniature diorama feel, flat color facets, clean simple silhouette, stylized 3D game asset render. Camera: three-quarter top-front view, object centered with a 15% margin. Background: solid pale sage (#DFEAE0), no props, no floor texture, no horizon line. Lighting: single soft key light upper-left plus soft ambient fill, no harsh shadows, no cast shadow or contact shadow on the background. Stylized matte render only — no photorealism, no glossy plastic, no cracked shell, no nutcracker, no whole shelled walnut, no crumbs, no bowl, no text, no watermark, no plate, no board, no props, no hands, no people, no characters, no facial features.
```

**②**

```
Same exact a single walnut half, kernel side up, identical proportions, colors, and surface details — now shown in a front elevation view (straight-on side view). Same solid pale sage #DFEAE0 background, object centered, no props, no cast shadow.
```

**③**

```
Same exact a single walnut half, kernel side up, identical proportions, colors, and surface details — now shown in a top-down view (directly from above). Same solid pale sage #DFEAE0 background, object centered, no props, no cast shadow.
```

---

## 크램베리 `cranberry` — 대표 형태 `dried`

비고: 건조 크램베리는 실물이 끈적해 생성기가 광택을 넣기 쉬우므로 wet syrup coating을 명시 차단했다. 주름은 음영이 아니라 같은 붉은 계열의 진한 색으로만 표현한다.

**①**

```
A cozy low-poly stylized 3D render of a small heap of dried cranberries, a single game asset object on a plain backdrop. Geometry: five to seven plump oval berries clustered in a low mound, each slightly wrinkled and flattened on one side, none overlapping the mound's silhouette. Surface: a deep saturated crimson body (#B3324A) with a slightly deeper red (#8E2438) in the wrinkle creases and a warm pale blush (#D9707F) on the upper faces where light lands — expressed purely as flat color facets, never as shine. Overall style: low-poly faceted geometry, soft clay-like matte shading, saturated jewel-tone ingredient color against the warm pastel scene palette, miniature diorama feel, flat color facets, clean simple silhouette, stylized 3D game asset render. Camera: three-quarter top-front view, object centered with a 15% margin. Background: solid pale sage (#DFEAE0), no props, no floor texture, no horizon line. Lighting: single soft key light upper-left plus soft ambient fill, no harsh shadows, no cast shadow or contact shadow on the background. Stylized matte render only — no photorealism, no glossy plastic, no wet syrup coating, no sauce, no juice, no sugar crystals, no bowl, no leaves, no stems, no text, no watermark, no plate, no board, no props, no hands, no people, no characters, no facial features.
```

**②**

```
Same exact a small heap of dried cranberries, identical proportions, colors, and surface details — now shown in a front elevation view (straight-on side view). Same solid pale sage #DFEAE0 background, object centered, no props, no cast shadow.
```

**③**

```
Same exact a small heap of dried cranberries, identical proportions, colors, and surface details — now shown in a top-down view (directly from above). Same solid pale sage #DFEAE0 background, object centered, no props, no cast shadow.
```

---

## 무화과 `fig` — 대표 형태 `fresh`

비고: 반으로 가른 단면을 정면으로 둔 것이 핵심 — 무화과는 곉만 보면 검자주빛 덩어리라 식별이 안 된다. 치즈·생햄은 무화과의 단골 플레이팅 연상이라 negative로 막았다.

**①**

```
A cozy low-poly stylized 3D render of a single fresh fig cut in half, cut side facing the viewer, a single game asset object on a plain backdrop. Geometry: one teardrop-shaped fruit sliced lengthwise down the middle, wide and rounded at the bottom, narrowing to a short stem at the top, the flat cut face turned toward the camera. Surface: a dusky purple skin (#6E3F63) around the outside, a thin pale cream rim (#E3D3B8) just inside the skin, and a deep rose-pink interior (#C2566B) filled with fine radiating seed strands in warm sand (#E8C9A8); the short stem is muted green (#6E7F4A) — all expressed purely as flat color facets, never as shine. Overall style: low-poly faceted geometry, soft clay-like matte shading, saturated jewel-tone ingredient color against the warm pastel scene palette, miniature diorama feel, flat color facets, clean simple silhouette, stylized 3D game asset render. Camera: three-quarter top-front view, object centered with a 15% margin. Background: solid pale sage (#DFEAE0), no props, no floor texture, no horizon line. Lighting: single soft key light upper-left plus soft ambient fill, no harsh shadows, no cast shadow or contact shadow on the background. Stylized matte render only — no photorealism, no glossy plastic, no jam, no honey drizzle, no cheese, no prosciutto, no leaves, no board, no bowl, no text, no watermark, no plate, no board, no props, no hands, no people, no characters, no facial features.
```

**②**

```
Same exact a single fresh fig cut in half, cut side facing the viewer, identical proportions, colors, and surface details — now shown in a front elevation view (straight-on side view). Same solid pale sage #DFEAE0 background, object centered, no props, no cast shadow.
```

**③**

```
Same exact a single fresh fig cut in half, cut side facing the viewer, identical proportions, colors, and surface details — now shown in a top-down view (directly from above). Same solid pale sage #DFEAE0 background, object centered, no props, no cast shadow.
```

---

## 로즈마리 `rosemary` — 대표 형태 `sprig`

비고: **한 가지**만 — negative에 bouquet·bunch·many sprigs를 넣은 이유다. 허브는 생성기가 묶음으로 그리려 들고, 묶음은 저폴리 실루에이이 무너진다. 잎은 개별 쟎이 아니라 짧은 바늘 덩어리로.

**①**

```
A cozy low-poly stylized 3D render of a single sprig of fresh rosemary, a single game asset object on a plain backdrop. Geometry: one straight woody stem lying at a slight diagonal, with short narrow needle leaves angling upward and outward along both sides, denser toward the tip. Surface: sage-green needles (#6E8A5A) with a deeper forest green (#4F6B41) on the shaded undersides and a pale silvery green (#9BB183) catching the upper edges; the woody stem is a muted olive-tan (#7C7A54) — expressed purely as flat color facets, never as shine. Overall style: low-poly faceted geometry, soft clay-like matte shading, saturated jewel-tone ingredient color against the warm pastel scene palette, miniature diorama feel, flat color facets, clean simple silhouette, stylized 3D game asset render. Camera: three-quarter top-front view, object centered with a 15% margin. Background: solid pale sage (#DFEAE0), no props, no floor texture, no horizon line. Lighting: single soft key light upper-left plus soft ambient fill, no harsh shadows, no cast shadow or contact shadow on the background. Stylized matte render only — no photorealism, no glossy plastic, no full herb bouquet, no bunch, no twine, no many sprigs, no flowers, no pot, no soil, no bowl, no text, no watermark, no plate, no board, no props, no hands, no people, no characters, no facial features.
```

**②**

```
Same exact a single sprig of fresh rosemary, identical proportions, colors, and surface details — now shown in a front elevation view (straight-on side view). Same solid pale sage #DFEAE0 background, object centered, no props, no cast shadow.
```

**③**

```
Same exact a single sprig of fresh rosemary, identical proportions, colors, and surface details — now shown in a top-down view (directly from above). Same solid pale sage #DFEAE0 background, object centered, no props, no cast shadow.
```

---

## 치즈 `cheese` — 대표 형태 `cube`

비고: melted stretch·cheese pull을 negative 상단에 둔 이유는 '치즈'가 생성기에서 녹는 장면을 강하게 끌기 때문이다. 구멍은 가장자리 어두운 테두리 없이 색으로만.

**①**

```
A cozy low-poly stylized 3D render of a small stack of three gouda-style cheese cubes, a single game asset object on a plain backdrop. Geometry: three cubes with softly rounded edges, two resting side by side and one set on top and slightly turned, none overlapping the group's silhouette. Surface: a rich butter-yellow body (#E8B75A) with a deeper amber (#C9903A) on the shaded faces, a thin warm wax rind (#C0562F) along one edge of each cube, and two or three small round holes (#D8A448) sunk into the visible faces — expressed purely as flat color facets, never as shine. Overall style: low-poly faceted geometry, soft clay-like matte shading, saturated jewel-tone ingredient color against the warm pastel scene palette, miniature diorama feel, flat color facets, clean simple silhouette, stylized 3D game asset render. Camera: three-quarter top-front view, object centered with a 15% margin. Background: solid pale sage (#DFEAE0), no props, no floor texture, no horizon line. Lighting: single soft key light upper-left plus soft ambient fill, no harsh shadows, no cast shadow or contact shadow on the background. Stylized matte render only — no photorealism, no glossy plastic, no pizza, no melted stretch, no cheese pull, no grater, no slices, no crackers, no board, no bowl, no text, no watermark, no plate, no board, no props, no hands, no people, no characters, no facial features.
```

**②**

```
Same exact a small stack of three gouda-style cheese cubes, identical proportions, colors, and surface details — now shown in a front elevation view (straight-on side view). Same solid pale sage #DFEAE0 background, object centered, no props, no cast shadow.
```

**③**

```
Same exact a small stack of three gouda-style cheese cubes, identical proportions, colors, and surface details — now shown in a top-down view (directly from above). Same solid pale sage #DFEAE0 background, object centered, no props, no cast shadow.
```

---

## 계피 `cinnamon` — 대표 형태 `ground`

비고: 게임의 형태는 ground·swirl이지만 아이콘으로는 **스틱 + 가루** 둘을 함께 둔다 — 가루만 놓으면 흑설탕 더미와 구분이 안 된다. 다른 향신료(팔각·정향)는 negative로 막았다.

**①**

```
A cozy low-poly stylized 3D render of two rolled cinnamon quills beside a small mound of ground cinnamon, a single game asset object on a plain backdrop. Geometry: two hollow bark tubes of slightly different length lying side by side at a shallow angle, each rolled inward from both edges into a double scroll at the ends, with a low soft heap of powder resting in front of them. Surface: a warm russet bark (#9A5B34) on the outside with a lighter tan (#B87A4C) inside the rolled scroll ends, and a deeper red-brown powder heap (#8C4E2A) with a paler dusting (#A9683C) on its lit upper slope — expressed purely as flat color facets, never as shine. Overall style: low-poly faceted geometry, soft clay-like matte shading, saturated jewel-tone ingredient color against the warm pastel scene palette, miniature diorama feel, flat color facets, clean simple silhouette, stylized 3D game asset render. Camera: three-quarter top-front view, object centered with a 15% margin. Background: solid pale sage (#DFEAE0), no props, no floor texture, no horizon line. Lighting: single soft key light upper-left plus soft ambient fill, no harsh shadows, no cast shadow or contact shadow on the background. Stylized matte render only — no photorealism, no glossy plastic, no star anise, no cloves, no coffee beans, no sugar, no spoon, no jar, no bowl, no steam, no text, no watermark, no plate, no board, no props, no hands, no people, no characters, no facial features.
```

**②**

```
Same exact two rolled cinnamon quills beside a small mound of ground cinnamon, identical proportions, colors, and surface details — now shown in a front elevation view (straight-on side view). Same solid pale sage #DFEAE0 background, object centered, no props, no cast shadow.
```

**③**

```
Same exact two rolled cinnamon quills beside a small mound of ground cinnamon, identical proportions, colors, and surface details — now shown in a top-down view (directly from above). Same solid pale sage #DFEAE0 background, object centered, no props, no cast shadow.
```

---

## 블루베리 `blueberry` — 대표 형태 `fresh`

비고: 블루베리의 결정적 특징은 꼭대기(crown)다 — 이게 없으면 그냥 파란 구슬이다. 앞 알 하나만 기울여 보이게 했다. 분백(bloom)은 광택이 아니라 분톡한 색으로 지정했다.

**①**

```
A cozy low-poly stylized 3D render of a small cluster of three blueberries, a single game asset object on a plain backdrop. Geometry: three round berries resting together in a low group, the front one tilted to show the small five-point crown at its top, none overlapping the group's silhouette. Surface: a deep blue-violet body (#4C5A8C) with a darker indigo (#39456E) on the shaded lower halves, a soft powdery pale-blue bloom (#8B9BC6) dusting the upper faces, and a small muted crown (#39456E) at the top of the front berry — expressed purely as flat color facets, never as shine. Overall style: low-poly faceted geometry, soft clay-like matte shading, saturated jewel-tone ingredient color against the warm pastel scene palette, miniature diorama feel, flat color facets, clean simple silhouette, stylized 3D game asset render. Camera: three-quarter top-front view, object centered with a 15% margin. Background: solid pale sage (#DFEAE0), no props, no floor texture, no horizon line. Lighting: single soft key light upper-left plus soft ambient fill, no harsh shadows, no cast shadow or contact shadow on the background. Stylized matte render only — no photorealism, no glossy plastic, no juice, no syrup, no yogurt, no milk splash, no leaves, no branch, no bowl, no punnet, no text, no watermark, no plate, no board, no props, no hands, no people, no characters, no facial features.
```

**②**

```
Same exact a small cluster of three blueberries, identical proportions, colors, and surface details — now shown in a front elevation view (straight-on side view). Same solid pale sage #DFEAE0 background, object centered, no props, no cast shadow.
```

**③**

```
Same exact a small cluster of three blueberries, identical proportions, colors, and surface details — now shown in a top-down view (directly from above). Same solid pale sage #DFEAE0 background, object centered, no props, no cast shadow.
```

---

## 단호박 `pumpkin` — 대표 형태 `roasted`

비고: **jack-o'-lantern·carved face를 negative 최상단에 박았다** — 호박은 생성기가 얼굴을 새길 확률이 높고, 그건 무캐릭터 규칙(CLAUDE.md 7) 직곰이다. 자른 쌀기로 속살 색을 드러낸다 — 곉만 보면 모든 호박이 같아 보인다.

**①**

```
A cozy low-poly stylized 3D render of a single small squat kabocha pumpkin with one wedge cut away, a single game asset object on a plain backdrop. Geometry: one low wide squash, much broader than it is tall, with soft vertical ribs running from top to bottom and a short thick stem on top; a single wedge has been cut out of the front to reveal the flesh inside. Surface: a warm orange skin (#D98B3A) with deeper amber (#B96F27) sunk into the rib grooves, a bright golden cut face (#EFA84E) with a paler seed hollow (#F5D08A) at its center, and a short muted-green stem (#6E7F4A) — expressed purely as flat color facets, never as shine. Overall style: low-poly faceted geometry, soft clay-like matte shading, saturated jewel-tone ingredient color against the warm pastel scene palette, miniature diorama feel, flat color facets, clean simple silhouette, stylized 3D game asset render. Camera: three-quarter top-front view, object centered with a 15% margin. Background: solid pale sage (#DFEAE0), no props, no floor texture, no horizon line. Lighting: single soft key light upper-left plus soft ambient fill, no harsh shadows, no cast shadow or contact shadow on the background. Stylized matte render only — no photorealism, no glossy plastic, no jack-o'-lantern, no carved face, no eyes, no candle, no halloween, no vine, no leaves, no bowl, no text, no watermark, no plate, no board, no props, no hands, no people, no characters, no facial features.
```

**②**

```
Same exact a single small squat kabocha pumpkin with one wedge cut away, identical proportions, colors, and surface details — now shown in a front elevation view (straight-on side view). Same solid pale sage #DFEAE0 background, object centered, no props, no cast shadow.
```

**③**

```
Same exact a single small squat kabocha pumpkin with one wedge cut away, identical proportions, colors, and surface details — now shown in a top-down view (directly from above). Same solid pale sage #DFEAE0 background, object centered, no props, no cast shadow.
```

---
