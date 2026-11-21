# 팬케이크 계열 이미지 생성 프롬프트 — 20종 v5 (Codex 투입 시트, 2026-09-02 롱폼 전면 재작성)

정본은 `assets/prompts/breads/<id>.json`이다 — **이 시트는 거기서 기계 전사한 파생물**.
문구를 고칠 일이 생기면 JSON을 고치고 시트를 다시 뽑는다(`node scripts/gen-pancake-sheet.mjs`).

**v3·v4 산출물(assets/breads/src/pancake*.png, 09-01~02 생성분)은 전부 폐기 대상.** v5는 방향이 다르다 —
과일·토핑을 반죽에 박지 않고 **카페 플레이팅처럼 위에 얹는다**(생크림·소스·슈가파우더·허브 동반), 메뉴별
인터넷 리서치 근거, 항목당 800~950단어 롱폼. 과일·소스는 자연 광택 허용(레퍼런스는 절차 모델링의
형태·비율 입력이라 텍스처로 구워지지 않는다).

## 하는 법 (Codex / ChatGPT 이미지)

1. **먼저 `pancake`(베이스) ①을 1장만** 뽑아 보고 판정한다. 통과하면 나머지로 확산.
2. 항목마다 **새 채팅**을 연다. ①을 통째로 붙여넣어 이미지를 받고, **같은 채팅에서** ②, ③을 순서대로 붙여넣는다.
   새 채팅에서 ②③만 요청하면 다른 스택이 나온다.
3. 비율 1:1, 크기는 생성기 UI에서 최대(1024 이상). 프롬프트에 크기 지시 없음.
4. 결과 저장:

| 뷰 | 저장 경로 |
|---|---|
| ① three-quarter top-front | `assets/breads/src/<id>.png` |
| ② front elevation | `assets/breads/src/<id>-2.png` |
| ③ top-down | `assets/breads/src/<id>-3.png` |

## 검수 체크리스트 (저장 전)

- 토핑이 **위에 얹혀** 있는가 — 과일·덩어리가 반죽에 박혀 있거나 뚫고 나오면 폐기
- 생크림(또는 요거트·버터)·소스가 있고 소스가 **한쪽으로 흘러내리는가** — 맨 스택이면 폐기
- 과일·소스에 **자연 광택**이 있는가 — 점토처럼 전부 matte면 폐기
- 옆벽이 크림색이고 윗면이 블로치 갈색 그라데이션인가 — 옆벽까지 갈색 단색이면 쿠키, 폐기
- 드립 길이·조각 크기·놓인 각도가 **제각각**인가 — 복붙 동일·등간격이면 폐기
- 스택 **하나만**, 접시·포크·테이블·손 없음, 배경은 페일 세이지 단색, 여백 충분
- 항목별 **비고**의 결정적 특징이 살아 있는가

색 정본은 프롬프트 JSON의 hex다 — 이미지는 형태·비율만 정본이다(`docs/BREADS.md`).

---

# 배치 1 — 베이스 + verified (7종)

게임에 이미 노출된 조합 중 실증 근거가 확인된 것들. 먼저 이 배치부터 던진다.

## 팬케이크 `pancake`

비고: 클래식 — 각진 버터 조각(밑면만 녹기 시작) + 메이플 시럽 흘림 + 슈가파우더. 버터가 액체 웅덩이뿐이면 폐기.

**①**

```
A semi-realistic stylized 3D dessert render of a tall stack of three thick, fluffy buttermilk pancakes with a square pat of butter on top and warm maple syrup poured over, running down the sides — a single dessert presented as one object on a plain seamless backdrop, no plate, styled the way a pastry chef would plate it for a café menu.

PANCAKES. Three thick, tender pancakes stacked with a small, casual offset, as if placed by hand rather than aligned by a machine — the middle one shifted a little to the right, the top one a little back. Each pancake is a plump, pillowy round about 2.5 cm thick with a gently domed top and a soft rounded edge that bulges slightly outward where the batter rose in the pan; the stack is about 60% as tall as it is wide and occupies roughly 65% of the frame width, leaving generous empty background around it. The top face of each pancake is griddle-browned in a soft, blotchy, uneven gradient — warm caramel brown (#B9793F) at the centre where it sat longest on the hot pan, fading through toasty golden (#CF9455) into light golden (#D9A76B) toward the rim, with a few slightly darker freckles and one paler patch where a bubble lifted the batter, the way real pancakes never brown evenly. The side wall of every pancake is the pale cream of the risen crumb (#F1DDB0): a soft, spongy band with a fine open crumb texture, tiny irregular air pockets catching the light, meeting the browned top in a soft blurred edge rather than a hard line. A few tiny pinprick pores sit near the rim of the top pancake, barely visible. Where the pancakes touch, the top one presses very slightly into the one below, so the edges kiss softly instead of floating. The whole stack looks warm, tender and freshly flipped — the honest irregularity of a handmade bake.

BUTTER. One square pat of butter, about 2 cm across with slightly uneven cut edges, sits just off-centre on the top pancake. It is still a solid, recognisable square — pale yellow (#F3DDA0) with a faint sheen where the light lands — but it has been there for half a minute: its corners have softened, its bottom edge has begun to melt into a small glossy golden pool (#E8C170) that soaks a darker ring into the crumb around it, and one side is slumping very slightly toward the syrup.

SYRUP. Warm maple syrup (#A85A1A), translucent amber and slow, has been poured generously over the stack from above: it sheets across the top face, gathers in the shallow dip around the butter, spills over the edge at two places and runs down the side walls in several drips of different lengths and widths — one broad drip reaching the bottom pancake and rounding into a soft bead, a couple of thinner ones stopping on the middle layer, one just starting. Where the syrup runs over the pale cream side walls it turns them a darker, glossy soaked gold and catches a bright highlight along every drip; a few tiny bubbles are trapped in the thickest pool, and a thin line of syrup has seeped into the seam between the top two pancakes.

FINISHING. A barely-there dusting of powdered sugar over the rim of the top pancake away from the syrup, settling into the little browning freckles and dissolving into faint translucent specks where it meets the syrup. Nothing else on top — the classic stack, generous and simple. The pour lands toward the front-left so the beautifully browned surface stays visible on the far side, and everything reads as one deliberate, appetizing plate: realistic portion size, no duplicate identical elements.

MATERIALS AND LIGHT. Premium food-icon look: slightly simplified, clean forms with believable, appetizing materials — matte tender pancake crumb with a faint velvety sheen only where it browned, a solid butter pat just starting to gleam at its melting base, and translucent, glossy syrup with bright soft highlights. Soft studio softbox key light from the upper left with gentle warm ambient fill, a subtle rim of light along the top edges of the stack, and a faint, soft contact shadow directly beneath the stack only. Appetizing food-photography color grading: warm, fresh, clean whites, saturated but natural colours, no colour cast on the background. Shot as if with an 85 mm lens at a comfortable distance, everything in crisp focus.

CAMERA AND BACKGROUND. Three-quarter top-front view, the dessert centered with generous margin on all sides. Background: seamless solid pale sage (#DFEAE0), flat and even. Mood: a warm weekend-morning breakfast stack, syrup still moving, that makes you want to pick up a fork. No text, no watermark, no plate, no cutlery, no table, no hands, no people, no characters, no facial features, no extra objects.
```

**②** 같은 채팅에서:

```
Same exact classic buttermilk pancake stack, identical pancakes and identical topping arrangement — now seen in a straight-on front elevation view at table height, so the three pale cream side walls, the browned edges, the syrup drips running down the front and the butter pat sitting on top are clearly visible. Keep every element exactly where it was; do not add, remove or move any topping between views, and keep the same colours and materials. Same seamless pale sage #DFEAE0 background, the dessert centered with generous margin, no plate, no extra objects.
```

**③** 같은 채팅에서:

```
Same exact classic buttermilk pancake stack, identical pancakes and identical topping arrangement — now seen directly from above in a top-down view, so the square pat of butter, the pooled syrup on the top pancake and the dusting of powdered sugar are fully visible and the lower pancakes peek out where the stack is offset. Keep every element exactly where it was; do not add, remove or move any topping between views, and keep the same colours and materials. Same seamless pale sage #DFEAE0 background, the dessert centered with generous margin, no plate, no extra objects.
```

## 초코칩 팬케이크 `pancake--choco-chip`

비고: 반죽은 밝은 황금색 유지(코코아형 아님). 칩은 녹아 번진 반점, 위에 생크림 + 퍼지 지그재그 + 여분 칩. 각진 보석처럼 박힌 칩이면 폐기.

**①**

```
A semi-realistic stylized 3D dessert render of a tall stack of three thick, fluffy golden buttermilk pancakes with mini chocolate chips melted into the batter, topped with a dollop of whipped cream, a zigzag of dark chocolate fudge sauce and a sprinkle of extra chocolate chips — a single dessert presented as one object on a plain seamless backdrop, no plate, styled the way a pastry chef would plate it for a café menu.

PANCAKES. Three thick, tender pancakes stacked with a small, casual offset, as if placed by hand rather than aligned by a machine — the middle one shifted a little to the right, the top one a little back. Each pancake is a plump, pillowy round about 2.5 cm thick with a gently domed top and a soft rounded edge that bulges slightly outward where the batter rose in the pan; the stack is about 60% as tall as it is wide and occupies roughly 65% of the frame width, leaving generous empty background around it. The batter itself stays light and golden — this is not a cocoa pancake — but it carries mini chocolate chips, and they show the way they really do after griddling: on the browned top face of each pancake, about ten small dark spots (#3B2418) of different sizes where chips sat just under the surface and melted, each a soft, slightly sunken smudge with blurred edges, some still holding the rounded outline of a chip, others spread into a small irregular smear with a faint gloss; on the pale cream side walls (#F1DDB0), a few flat dark cross-sections of chips sit flush with the crumb, and one or two chips near the edge have melted and run a short dark streak down the wall. The top face otherwise browns in the usual soft blotchy gradient from warm caramel (#B9793F) at the centre to light golden (#D9A76B) at the rim, with a few darker freckles. A few tiny pinprick pores sit near the rim of the top pancake, barely visible. Where the pancakes touch, the top one presses very slightly into the one below, so the edges kiss softly instead of floating. The whole stack looks warm, tender and freshly flipped — the honest irregularity of a handmade bake.

WHIPPED CREAM. One generous dollop of lightly whipped cream (#FFF8EC), spoon-dropped rather than piped, sits slightly off-centre toward the front-left of the top pancake: soft rounded peaks with gentle folds and one curl on top, a matte velvety surface, its lower edge relaxing into a soft skirt against the warm pancake.

FUDGE SAUCE. A warm dark chocolate fudge sauce (#3A2014), thick, glossy and opaque, drizzled from a spoon in three or four loose zigzag lines that cross the cream and the top pancake, the ribbons thick where the spoon slowed and thin where it moved fast, then spilling over the front edge to run down the pale side walls in slow, heavy drips of different lengths — one reaching the bottom pancake and rounding into a soft bead, the others stopping on the middle layer. Where it lies on the cream it sinks slightly into the white; along every ribbon it catches a bright soft highlight.

EXTRA CHIPS AND FINISHING. A small handful of extra mini chocolate chips (#3B2418) — about twelve, a few of them irregular hand-chopped chunks rather than uniform drops — sprinkled over the cream and the sauce, some half-sunk in the cream, a few sliding down onto the browned pancake, one caught in a sauce drip. A barely-there haze of powdered sugar over the far rim of the top pancake, away from the sauce. The toppings gather toward the front-left so the browned pancake surface stays visible on the opposite side, and the composition reads as one deliberate, appetizing arrangement — realistic portion size, no duplicate identical elements.

MATERIALS AND LIGHT. Premium food-icon look: slightly simplified, clean forms with believable, appetizing materials — matte tender pancake crumb with a faint velvety sheen only where it browned, soft-matte cream, thick glossy opaque fudge sauce, dry matte chocolate chips with a faint sheen where they melted, and softly glossy melted chip smudges in the crust. Soft studio softbox key light from the upper left with gentle warm ambient fill, a subtle rim of light along the top edges of the stack, and a faint, soft contact shadow directly beneath the stack only. Appetizing food-photography color grading: warm, fresh, clean whites, saturated but natural colours, no colour cast on the background. Shot as if with an 85 mm lens at a comfortable distance, everything in crisp focus.

CAMERA AND BACKGROUND. Three-quarter top-front view, the dessert centered with generous margin on all sides. Background: seamless solid pale sage (#DFEAE0), flat and even. Mood: an indulgent diner-style chocolate-chip breakfast, sauce still running, that makes you want to pick up a fork. No text, no watermark, no plate, no cutlery, no table, no hands, no people, no characters, no facial features, no extra objects.
```

**②** 같은 채팅에서:

```
Same exact chocolate chip pancake stack, identical pancakes and identical topping arrangement — now seen in a straight-on front elevation view at table height, so the three pale cream side walls with flat chip cross-sections in them, the fudge drips running down the front and the cream with extra chips on top are clearly visible. Keep every element exactly where it was; do not add, remove or move any topping between views, and keep the same colours and materials. Same seamless pale sage #DFEAE0 background, the dessert centered with generous margin, no plate, no extra objects.
```

**③** 같은 채팅에서:

```
Same exact chocolate chip pancake stack, identical pancakes and identical topping arrangement — now seen directly from above in a top-down view, so the melted chip smudges on the golden top pancake, the cream, the zigzag of fudge sauce and the sprinkled chips are fully visible and the lower pancakes peek out where the stack is offset. Keep every element exactly where it was; do not add, remove or move any topping between views, and keep the same colours and materials. Same seamless pale sage #DFEAE0 background, the dessert centered with generous margin, no plate, no extra objects.
```

## 코코아 팬케이크 `pancake--choco-cocoa`

비고: 반죽 전체가 균일한 다크브라운(반점 없음) + 광택 가나슈 부음 + 생크림 + 라즈베리 + 초콜릿 셰이빙. 밝은 반죽에 점이면 초코칩형과 혼동, 폐기.

**①**

```
A semi-realistic stylized 3D dessert render of a tall stack of three thick, fluffy dark cocoa pancakes, chocolate-brown through and through, poured over with glossy dark chocolate ganache running down the sides, topped with a dollop of whipped cream, a few fresh raspberries and dark chocolate shavings — a single dessert presented as one object on a plain seamless backdrop, no plate, styled the way a pastry chef would plate it for a café menu.

PANCAKES. Three thick, tender pancakes stacked with a small, casual offset, as if placed by hand rather than aligned by a machine — the middle one shifted a little to the right, the top one a little back. Each pancake is a plump, pillowy round about 2.5 cm thick with a gently domed top and a soft rounded edge that bulges slightly outward where the batter rose in the pan; the stack is about 60% as tall as it is wide and occupies roughly 65% of the frame width, leaving generous empty background around it. The batter is made with cocoa powder, so every pancake is chocolate-brown through and through — no chips, no spots, just an even deep colour: the side wall of each one is a soft cocoa-brown crumb (#6B4A3A) with a fine open texture and tiny air pockets catching the light; the top face is where the cocoa batter met the hot pan, so it is a deeper, richer brown (#3F2A22) at the centre fading to a warmer milk-chocolate brown (#5C4033) at the rim, with a few darker freckles and a matte, slightly velvety surface — the browning is subtle on a dark batter, read more as a shift in depth than in hue. A few tiny pinprick pores sit near the rim of the top pancake, barely visible. Where the pancakes touch, the top one presses very slightly into the one below, so the edges kiss softly instead of floating. The whole stack looks warm, tender and freshly flipped — the honest irregularity of a handmade bake.

GANACHE. Warm dark chocolate ganache (#2E1A12), glossy, thick and opaque, has been poured over the stack from above: it sheets across the top face in an uneven pool that covers about half the surface with a rounded, softly rippled edge, then spills over the front and one side to run down the cocoa side walls in slow, heavy drips of clearly different lengths and widths — one broad drip reaching the bottom pancake and rounding into a heavy bead, two stopping on the middle layer, one just starting. Its mirror-like surface catches the softbox as long, soft highlights that make it look warm and still moving.

WHIPPED CREAM. One generous dollop of lightly whipped cream (#FFF8EC), spoon-dropped slightly off-centre toward the front-left on top of the ganache: soft rounded peaks, gentle folds, a matte velvety surface, its lower edge relaxing into a soft skirt where a little of the dark ganache has been pulled up into the white as a faint marbled streak. The bright white against the dark brown is the strongest contrast on the plate.

RASPBERRIES AND SHAVINGS. Four fresh raspberries (#C8324F), hollow-centred, their tiny drupelets catching soft highlights and each a slightly different size, set in a loose cluster on and beside the cream — one tipped on its side showing the pale hollow, one rolled onto the ganache leaving a small dent. Dark chocolate shavings (#2E1A12) — a small handful of dry, thin curls of different lengths and widths, some tightly rolled, some flat flakes — sprinkled over the cream and the ganache, a couple sliding down the side.

FINISHING. A barely-there haze of powdered sugar over the far rim of the top pancake and the outer folds of the cream, showing as fine pale specks on the dark surfaces. One small sprig of fresh mint with two leaves (#3E7A45) tucked against the cream. The toppings gather toward the front-left so the browned pancake surface stays visible on the opposite side, and the composition reads as one deliberate, appetizing arrangement — realistic portion size, no duplicate identical elements.

MATERIALS AND LIGHT. Premium food-icon look: slightly simplified, clean forms with believable, appetizing materials — matte tender pancake crumb with a faint velvety sheen only where it browned, soft-matte cream, mirror-glossy opaque ganache, dewy raspberries, dry curled chocolate shavings, waxy mint leaves. Soft studio softbox key light from the upper left with gentle warm ambient fill, a subtle rim of light along the top edges of the stack, and a faint, soft contact shadow directly beneath the stack only. Appetizing food-photography color grading: warm, fresh, clean whites, saturated but natural colours, no colour cast on the background. Shot as if with an 85 mm lens at a comfortable distance, everything in crisp focus.

CAMERA AND BACKGROUND. Three-quarter top-front view, the dessert centered with generous margin on all sides. Background: seamless solid pale sage (#DFEAE0), flat and even. Mood: a rich, dark dessert-café stack — deep chocolate under white cream and red berries — that makes you want to pick up a fork. No text, no watermark, no plate, no cutlery, no table, no hands, no people, no characters, no facial features, no extra objects.
```

**②** 같은 채팅에서:

```
Same exact cocoa pancake stack, identical pancakes and identical topping arrangement — now seen in a straight-on front elevation view at table height, so the three cocoa-brown side walls, the heavy ganache drips running down the front and the cream with raspberries on top are clearly visible. Keep every element exactly where it was; do not add, remove or move any topping between views, and keep the same colours and materials. Same seamless pale sage #DFEAE0 background, the dessert centered with generous margin, no plate, no extra objects.
```

**③** 같은 채팅에서:

```
Same exact cocoa pancake stack, identical pancakes and identical topping arrangement — now seen directly from above in a top-down view, so the pool of glossy ganache over the dark top pancake, the cream, the raspberries and the chocolate shavings are fully visible and the lower pancakes peek out where the stack is offset. Keep every element exactly where it was; do not add, remove or move any topping between views, and keep the same colours and materials. Same seamless pale sage #DFEAE0 background, the dessert centered with generous margin, no plate, no extra objects.
```

## 딸기 팬케이크 `pancake--strawberry-fresh`

비고: 사용자 통과본. 크림 돌롭 + 통 딸기 2·반 3 + 소스 3드립 + 슈가파우더 + 민트. 딸기가 반죽에 박히면 폐기.

**①**

```
A semi-realistic stylized 3D dessert render of a tall stack of three thick, fluffy buttermilk pancakes crowned with a generous dollop of softly whipped cream and fresh strawberries, with glossy strawberry sauce spooned over the top and running down one side — a single dessert presented as one object on a plain seamless backdrop, no plate, styled the way a pastry chef would plate it for a café menu.

PANCAKES. Three thick, tender pancakes stacked with a small, casual offset, as if placed by hand rather than aligned by a machine — the middle one shifted a little to the right, the top one a little back. Each pancake is a plump, pillowy round about 2.5 cm thick with a gently domed top and a soft rounded edge that bulges slightly outward where the batter rose in the pan; the stack is about 60% as tall as it is wide and occupies roughly 65% of the frame width, leaving generous empty background around it. The top face of each pancake is griddle-browned in a soft, blotchy, uneven gradient — warm caramel brown (#B9793F) at the centre where it sat longest on the hot pan, fading through toasty golden (#CF9455) into light golden (#D9A76B) toward the rim, with a few slightly darker freckles and one paler patch where a bubble lifted the batter, the way real pancakes never brown evenly. The side wall of every pancake is the pale cream of the risen crumb (#F1DDB0): a soft, spongy band with a fine open crumb texture, tiny irregular air pockets catching the light, meeting the browned top in a soft blurred edge rather than a hard line. A few tiny pinprick pores sit near the rim of the top pancake, barely visible. Where the pancakes touch, the top one presses very slightly into the one below, so the edges kiss softly instead of floating. The whole stack looks warm, tender and freshly flipped — the honest irregularity of a handmade bake.

WHIPPED CREAM. One generous dollop of lightly whipped cream (#FFF8EC), about the size of a large spoonful, sitting slightly off-centre toward the front-left of the top pancake. It has been dropped from a spoon, not piped: soft, rounded peaks with gentle folds and one curl on top, a matte velvety surface with a faint ivory warmth, slumping a little under the weight of the fruit and just beginning to soften where the warm pancake and the sauce touch it, so its lower edge relaxes outward into a soft skirt with a slightly translucent rim.

STRAWBERRIES. About five fresh, ripe strawberries in glossy red (#D8322E), each with tiny pale yellow seeds set in shallow dimples across the skin and a natural moist sheen, no two the same size or shape: two whole berries with their green leafy calyx (#4F7A3A) still attached, one large and one smaller, leaning against the cream at different angles with their tips pointing different ways; and three halves cut lengthwise, showing the pale pink-white heart fading into red flesh with the faint radiating grain of a real cut strawberry — the largest half laid flat on the cream cut-face up, one half tilted against the side of the dollop, and one small half sitting on the bare browned pancake near the rim with a tiny bead of juice pooling under it. A couple of seeds and a smear of red juice have been left behind on the cream where a berry was moved.

SAUCE. A spoonful of glossy, translucent strawberry sauce (#B8202A) with a few tiny soft fruit pieces in it, spooned loosely over the fruit and cream so it pools briefly in the hollows, coats the top of one berry, and then runs down the front side of the stack in three uneven drips of different lengths and widths — one thick drip reaching the middle pancake and rounding into a soft bead at its tip, one thinner one stopping short at the top pancake’s edge, and one just beginning. The sauce is thick and slow like a warm compote, catching a bright soft highlight along each drip and turning the crumb it touches a darker, glossy soaked red-brown.

FINISHING. A barely-there haze of powdered sugar dusted over the berries and the pancake rim, settling in the seed dimples and the folds of the cream and dissolving into faint translucent specks where it touches the sauce. One small sprig of fresh mint with two crisp leaves (#3E7A45) tucked into the cream beside the strawberries. The toppings gather toward the front-left so the browned pancake surface stays visible on the opposite side, and the composition reads as one deliberate, appetizing arrangement — realistic portion size, no duplicate identical elements.

MATERIALS AND LIGHT. Premium food-icon look: slightly simplified, clean forms with believable, appetizing materials — matte tender pancake crumb with a faint velvety sheen only where it browned, soft-matte cream, naturally glossy strawberry skin with soft specular highlights, translucent glossy sauce, waxy mint leaves. Soft studio softbox key light from the upper left with gentle warm ambient fill, a subtle rim of light along the top edges of the stack, and a faint, soft contact shadow directly beneath the stack only. Appetizing food-photography color grading: warm, fresh, clean whites, saturated but natural colours, no colour cast on the background. Shot as if with an 85 mm lens at a comfortable distance, everything in crisp focus.

CAMERA AND BACKGROUND. Three-quarter top-front view, the dessert centered with generous margin on all sides. Background: seamless solid pale sage (#DFEAE0), flat and even. Mood: a warm, freshly plated café breakfast that makes you want to pick up a fork. No text, no watermark, no plate, no cutlery, no table, no hands, no people, no characters, no facial features, no extra objects.
```

**②** 같은 채팅에서:

```
Same exact strawberry pancake stack, identical pancakes and identical topping arrangement — now seen in a straight-on front elevation view at table height, so the three pale cream side walls, the browned edges, the sauce drips running down the front and the height of the cream and strawberries on top are clearly visible. Keep every element exactly where it was; do not add, remove or move any topping between views, and keep the same colours and materials. Same seamless pale sage #DFEAE0 background, the dessert centered with generous margin, no plate, no extra objects.
```

**③** 같은 채팅에서:

```
Same exact strawberry pancake stack, identical pancakes and identical topping arrangement — now seen directly from above in a top-down view, so the arrangement of whole and halved strawberries on the cream, the pooled sauce and the mint sprig are fully visible and the lower pancakes peek out where the stack is offset. Keep every element exactly where it was; do not add, remove or move any topping between views, and keep the same colours and materials. Same seamless pale sage #DFEAE0 background, the dessert centered with generous margin, no plate, no extra objects.
```

## 블루베리 팬케이크 `pancake--blueberry-fresh`

비고: 통 블루베리(자르지 않음, 과분 있음) 무더기 + 과육 씹히는 진한 자주 콩포트 + 생크림. 매끈한 시럽·잘린 베리면 폐기.

**①**

```
A semi-realistic stylized 3D dessert render of a tall stack of three thick, fluffy buttermilk pancakes topped with a dollop of whipped cream, a generous scatter of whole fresh blueberries and a spoonful of chunky blueberry compote running down one side — a single dessert presented as one object on a plain seamless backdrop, no plate, styled the way a pastry chef would plate it for a café menu.

PANCAKES. Three thick, tender pancakes stacked with a small, casual offset, as if placed by hand rather than aligned by a machine — the middle one shifted a little to the right, the top one a little back. Each pancake is a plump, pillowy round about 2.5 cm thick with a gently domed top and a soft rounded edge that bulges slightly outward where the batter rose in the pan; the stack is about 60% as tall as it is wide and occupies roughly 65% of the frame width, leaving generous empty background around it. The top face of each pancake is griddle-browned in a soft, blotchy, uneven gradient — warm caramel brown (#B9793F) at the centre where it sat longest on the hot pan, fading through toasty golden (#CF9455) into light golden (#D9A76B) toward the rim, with a few slightly darker freckles and one paler patch where a bubble lifted the batter, the way real pancakes never brown evenly. The side wall of every pancake is the pale cream of the risen crumb (#F1DDB0): a soft, spongy band with a fine open crumb texture, tiny irregular air pockets catching the light, meeting the browned top in a soft blurred edge rather than a hard line. A few tiny pinprick pores sit near the rim of the top pancake, barely visible. Where the pancakes touch, the top one presses very slightly into the one below, so the edges kiss softly instead of floating. The whole stack looks warm, tender and freshly flipped — the honest irregularity of a handmade bake.

WHIPPED CREAM. One generous dollop of lightly whipped cream (#FFF8EC), spoon-dropped rather than piped, sits slightly off-centre toward the front-left of the top pancake: soft rounded peaks with gentle folds and one curl on top, a matte velvety surface with a faint ivory warmth, slumping a little under the fruit and relaxing at its lower edge into a soft skirt where the warm pancake and the compote touch it.

BLUEBERRIES. About fifteen whole fresh blueberries, never cut — deep indigo-violet (#3B4470) under a soft dusty grey-blue bloom (#7E8BB5) that rubs off where they touch, each with its tiny five-pointed crown on top and each a slightly different size, from small firm ones to a few plump ones almost twice the size — piled in a loose, uneven heap: six or seven sitting on and against the cream, the rest tumbling down its side across the browned top pancake, two rolled to the rim, one caught in a compote drip on the side wall. A couple have split slightly and show a glimpse of pale green-white flesh; no two sit at the same angle.

COMPOTE. A spoonful of warm blueberry compote — not a smooth syrup but a thick, glossy, deep purple (#4A1E4F) sauce with crushed berry skins and a few whole soft berries in it — spooned over the heap so it pools between the berries, stains the cream where it touches in soft violet streaks, and runs over the front edge of the top pancake in three uneven drips of different lengths and widths down the pale side walls: one thick drip reaching the bottom pancake and rounding into a heavy bead, one thinner drip stopping on the middle layer, one just beginning. Where it runs it turns the crumb a darker soaked purple and catches a bright soft highlight.

FINISHING. A barely-there haze of powdered sugar dusted over the berries and the far rim of the top pancake, catching on the bloom of the berries as tiny pale specks. One small sprig of fresh mint with two crisp leaves (#3E7A45) tucked into the cream. The toppings gather toward the front-left so the browned pancake surface stays visible on the opposite side, and the composition reads as one deliberate, appetizing arrangement — realistic portion size, no duplicate identical elements.

MATERIALS AND LIGHT. Premium food-icon look: slightly simplified, clean forms with believable, appetizing materials — matte tender pancake crumb with a faint velvety sheen only where it browned, soft-matte cream, bloom-dusted blueberries with a soft matte skin and glossy split flesh, a thick glossy compote with visible crushed fruit, waxy mint leaves. Soft studio softbox key light from the upper left with gentle warm ambient fill, a subtle rim of light along the top edges of the stack, and a faint, soft contact shadow directly beneath the stack only. Appetizing food-photography color grading: warm, fresh, clean whites, saturated but natural colours, no colour cast on the background. Shot as if with an 85 mm lens at a comfortable distance, everything in crisp focus.

CAMERA AND BACKGROUND. Three-quarter top-front view, the dessert centered with generous margin on all sides. Background: seamless solid pale sage (#DFEAE0), flat and even. Mood: a warm, generous café breakfast — purple berries spilling over white cream — that makes you want to pick up a fork. No text, no watermark, no plate, no cutlery, no table, no hands, no people, no characters, no facial features, no extra objects.
```

**②** 같은 채팅에서:

```
Same exact blueberry pancake stack, identical pancakes and identical topping arrangement — now seen in a straight-on front elevation view at table height, so the three pale cream side walls, the purple compote drips running down the front and the heap of blueberries and cream on top are clearly visible. Keep every element exactly where it was; do not add, remove or move any topping between views, and keep the same colours and materials. Same seamless pale sage #DFEAE0 background, the dessert centered with generous margin, no plate, no extra objects.
```

**③** 같은 채팅에서:

```
Same exact blueberry pancake stack, identical pancakes and identical topping arrangement — now seen directly from above in a top-down view, so the heap of whole blueberries on and around the cream, the pooled compote and the mint sprig are fully visible and the lower pancakes peek out where the stack is offset. Keep every element exactly where it was; do not add, remove or move any topping between views, and keep the same colours and materials. Same seamless pale sage #DFEAE0 background, the dessert centered with generous margin, no plate, no extra objects.
```

## 귀리 팬케이크 `pancake--oat-flake`

비고: 반죽 표면·옆벽에 오트 알갱이 질감 필수(매끈하면 폐기). 위엔 그릭요거트 + 바나나 부채꼴 + 꿀 + 다진 호두 + 오트 꼬집 + 블루베리.

**①**

```
A semi-realistic stylized 3D dessert render of a tall stack of three thick, hearty oatmeal pancakes with visible rolled oats in the batter, topped with a dollop of Greek yogurt, fanned banana slices, a drizzle of honey, chopped walnuts, a few blueberries and a pinch of toasted oats — a single dessert presented as one object on a plain seamless backdrop, no plate, styled the way a pastry chef would plate it for a café menu.

PANCAKES. Three thick, tender pancakes stacked with a small, casual offset, as if placed by hand rather than aligned by a machine — the middle one shifted a little to the right, the top one a little back. Each pancake is a plump, pillowy round about 2.5 cm thick with a gently domed top and a soft rounded edge that bulges slightly outward where the batter rose in the pan; the stack is about 60% as tall as it is wide and occupies roughly 65% of the frame width, leaving generous empty background around it. The batter is made with rolled oats, so the pancakes are not smooth: the side wall of each one is a warm oat-cream crumb (#E6CFA3) with a coarser, rustic texture in which flattened oat flakes (#D7C7A3) lie flush with the surface, plainly visible as pale ovals of different sizes among the air pockets; the top face is griddle-browned in a soft blotchy gradient — nutty golden-brown (#B07A42) at the centre fading to warm tan (#D3A66C) at the rim — with the outlines of a few oat flakes showing through the browning as paler flecks and a slightly rougher, more textured surface than a plain pancake. A few tiny pinprick pores sit near the rim of the top pancake, barely visible. Where the pancakes touch, the top one presses very slightly into the one below, so the edges kiss softly instead of floating. The whole stack looks warm, tender and freshly flipped — the honest irregularity of a handmade bake.

GREEK YOGURT. One generous dollop of thick Greek yogurt (#FBF6EC), spooned rather than piped, sits slightly off-centre toward the front-left of the top pancake: a dense, matte, softly peaked mound with a spoon-mark on one side, its lower edge settling into a soft skirt against the warm pancake.

BANANA. Four slices of banana about 7 mm thick, cut a little unevenly, fanned in an overlapping row that leans against the yogurt — pale creamy yellow (#F1E3A6) flesh with the small dark seed-dots in the centre, thin golden skins-edges (#D9B85A) just turning brown at one or two rims, one slice tipped slightly forward showing its edge, a faint moist sheen on the cut faces.

HONEY, NUTS AND OATS. A thin drizzle of clear golden honey (#D9A441), translucent and glossy, traced in one loose zigzag over the yogurt and banana and spilling over the front edge into two slow drips of different lengths down the side walls. A small handful of toasted walnuts (#A9784A), coarsely chopped into pieces of clearly different sizes with their ridged surfaces showing, sprinkled over the yogurt and the banana. About a dozen toasted rolled oat flakes (#C9A46E) pinched over the top of the yogurt, a few sliding down its side.

FINISHING. Five blueberries (#3E4A73) with a dusty grey-blue bloom, each a slightly different size, tucked in a loose cluster between the yogurt and the banana, one alone near the rim. A very light dusting of ground cinnamon over the near rim. The toppings gather toward the front-left so the browned pancake surface stays visible on the opposite side, and the composition reads as one deliberate, appetizing arrangement — realistic portion size, no duplicate identical elements.

MATERIALS AND LIGHT. Premium food-icon look: slightly simplified, clean forms with believable, appetizing materials — matte tender pancake crumb with a faint velvety sheen only where it browned, dense matte yogurt, moist banana slices with a faint sheen, translucent glossy honey, dry ridged walnut pieces, dry toasted oat flakes and bloom-dusted blueberries. Soft studio softbox key light from the upper left with gentle warm ambient fill, a subtle rim of light along the top edges of the stack, and a faint, soft contact shadow directly beneath the stack only. Appetizing food-photography color grading: warm, fresh, clean whites, saturated but natural colours, no colour cast on the background. Shot as if with an 85 mm lens at a comfortable distance, everything in crisp focus.

CAMERA AND BACKGROUND. Three-quarter top-front view, the dessert centered with generous margin on all sides. Background: seamless solid pale sage (#DFEAE0), flat and even. Mood: a wholesome, hearty morning stack — rustic oats under fruit and honey — that makes you want to pick up a fork. No text, no watermark, no plate, no cutlery, no table, no hands, no people, no characters, no facial features, no extra objects.
```

**②** 같은 채팅에서:

```
Same exact oatmeal pancake stack, identical pancakes and identical topping arrangement — now seen in a straight-on front elevation view at table height, so the three oat-flecked side walls, the yogurt and fanned banana on top, the walnuts and the honey drips on the front are clearly visible. Keep every element exactly where it was; do not add, remove or move any topping between views, and keep the same colours and materials. Same seamless pale sage #DFEAE0 background, the dessert centered with generous margin, no plate, no extra objects.
```

**③** 같은 채팅에서:

```
Same exact oatmeal pancake stack, identical pancakes and identical topping arrangement — now seen directly from above in a top-down view, so the yogurt dollop, the fanned banana slices, the walnuts, oats and blueberries and the honey zigzag on the textured top pancake are fully visible and the lower pancakes peek out where the stack is offset. Keep every element exactly where it was; do not add, remove or move any topping between views, and keep the same colours and materials. Same seamless pale sage #DFEAE0 background, the dessert centered with generous margin, no plate, no extra objects.
```

## 포피시드 팬케이크 `pancake--poppyseed-seed`

비고: 아주 작은 검은 점이 반죽 전체에 균일 + 불투명 흰 레몬 글레이즈 + 밝은 제스트 + 블루베리. 글레이즈 없이 점만 있으면 곰팡이로 읽힘, 폐기.

**①**

```
A semi-realistic stylized 3D dessert render of a tall stack of three thick, fluffy lemon poppy seed pancakes speckled with tiny blue-black poppy seeds, poured over with an opaque white lemon glaze that runs down the sides, finished with bright lemon zest, a few blueberries and a twist of lemon peel — a single dessert presented as one object on a plain seamless backdrop, no plate, styled the way a pastry chef would plate it for a café menu.

PANCAKES. Three thick, tender pancakes stacked with a small, casual offset, as if placed by hand rather than aligned by a machine — the middle one shifted a little to the right, the top one a little back. Each pancake is a plump, pillowy round about 2.5 cm thick with a gently domed top and a soft rounded edge that bulges slightly outward where the batter rose in the pan; the stack is about 60% as tall as it is wide and occupies roughly 65% of the frame width, leaving generous empty background around it. The batter is a lemon poppy seed batter, so every pancake is finely speckled: the side wall of each one is a pale lemon-cream crumb (#F3E4B4) with a fine open texture, and set evenly through it are countless tiny poppy seeds (#2B2A38), each a pin-point blue-black dot far smaller than a grain of rice, the way a real lemon poppy seed bake is speckled all the way through; the top face is griddle-browned in a soft blotchy gradient — warm caramel (#B9793F) at the centre fading to light golden (#DDB070) at the rim — with the seeds showing through the browning as fine dark specks, most visible near the paler rim. A few tiny pinprick pores sit near the rim of the top pancake, barely visible. Where the pancakes touch, the top one presses very slightly into the one below, so the edges kiss softly instead of floating. The whole stack looks warm, tender and freshly flipped — the honest irregularity of a handmade bake.

LEMON GLAZE. An opaque white lemon glaze (#F7F2E6) — powdered sugar and lemon juice, smooth and just thick enough to hold a ribbon — has been poured over the top pancake so it covers about two-thirds of the surface in a soft, uneven pool with a rounded, slightly translucent edge, then spills over the front and one side in slow, thick drips of different lengths and widths down the speckled side walls — one reaching the bottom pancake and rounding into a heavy bead, two stopping on the middle layer, one just starting. The glaze has a soft satin sheen and a few poppy seeds have been carried into it, showing as sharp dark dots against the white.

LEMON ZEST. Fine shreds of fresh lemon zest (#F2D23A), grated into short bright threads of different lengths, sprinkled over the glaze while it was still wet so they sit half-sunk in the white, heavier toward the front-left and thinning out across the top — the brightest colour on the plate.

BLUEBERRIES AND FINISHING. Five blueberries (#3E4A73) with a dusty grey-blue bloom, each a slightly different size, set in a loose cluster on the glaze toward the front-left, one rolled off onto the bare browned rim. One thin twist of lemon peel (#E9C93C), a curled strip about 4 cm long with the pale pith showing on its inner face, balanced on the glaze beside the berries. One small sprig of fresh mint with two leaves (#3E7A45) tucked in beside them. The toppings gather toward the front-left so the browned pancake surface stays visible on the opposite side, and the composition reads as one deliberate, appetizing arrangement — realistic portion size, no duplicate identical elements.

MATERIALS AND LIGHT. Premium food-icon look: slightly simplified, clean forms with believable, appetizing materials — matte tender pancake crumb with a faint velvety sheen only where it browned, a satin-sheen opaque glaze, dry bright zest threads, bloom-dusted blueberries, a waxy curled peel twist, waxy mint leaves. Soft studio softbox key light from the upper left with gentle warm ambient fill, a subtle rim of light along the top edges of the stack, and a faint, soft contact shadow directly beneath the stack only. Appetizing food-photography color grading: warm, fresh, clean whites, saturated but natural colours, no colour cast on the background. Shot as if with an 85 mm lens at a comfortable distance, everything in crisp focus.

CAMERA AND BACKGROUND. Three-quarter top-front view, the dessert centered with generous margin on all sides. Background: seamless solid pale sage (#DFEAE0), flat and even. Mood: a bright, zesty American-brunch stack — white glaze over speckled gold — that makes you want to pick up a fork. No text, no watermark, no plate, no cutlery, no table, no hands, no people, no characters, no facial features, no extra objects.
```

**②** 같은 채팅에서:

```
Same exact lemon poppy seed pancake stack, identical pancakes and identical topping arrangement — now seen in a straight-on front elevation view at table height, so the three speckled side walls, the thick white glaze drips running down the front, and the zest, berries and peel twist on top are clearly visible. Keep every element exactly where it was; do not add, remove or move any topping between views, and keep the same colours and materials. Same seamless pale sage #DFEAE0 background, the dessert centered with generous margin, no plate, no extra objects.
```

**③** 같은 채팅에서:

```
Same exact lemon poppy seed pancake stack, identical pancakes and identical topping arrangement — now seen directly from above in a top-down view, so the pool of white glaze over the speckled top pancake, the bright zest threads, the blueberries and the peel twist are fully visible and the lower pancakes peek out where the stack is offset. Keep every element exactly where it was; do not add, remove or move any topping between views, and keep the same colours and materials. Same seamless pale sage #DFEAE0 background, the dessert centered with generous margin, no plate, no extra objects.
```

---

# 배치 2 — conditional (8종)

형태·비율 제한부로 실증된 조합. 게임 노출 대상이다.

## 바나나 슬라이스 팬케이크 `pancake--banana-slice`

비고: 토치로 그을린 브륄레 바나나(어슷 타원, 그을림 슬라이스마다 다름) + 꿀 생크림 + 캐러멜 소스 + 초콜릿 셰이빙. 완벽한 원 등간격이면 폐기.

**①**

```
A semi-realistic stylized 3D dessert render of a tall stack of three thick, fluffy buttermilk pancakes topped with a dollop of honey whipped cream and a fan of brûléed banana slices with a torched amber sugar crust, with caramel sauce running down one side — a single dessert presented as one object on a plain seamless backdrop, no plate, styled the way a pastry chef would plate it for a café menu.

PANCAKES. Three thick, tender pancakes stacked with a small, casual offset, as if placed by hand rather than aligned by a machine — the middle one shifted a little to the right, the top one a little back. Each pancake is a plump, pillowy round about 2.5 cm thick with a gently domed top and a soft rounded edge that bulges slightly outward where the batter rose in the pan; the stack is about 60% as tall as it is wide and occupies roughly 65% of the frame width, leaving generous empty background around it. The top face of each pancake is griddle-browned in a soft, blotchy, uneven gradient — warm caramel brown (#B9793F) at the centre where it sat longest on the hot pan, fading through toasty golden (#CF9455) into light golden (#D9A76B) toward the rim, with a few slightly darker freckles and one paler patch where a bubble lifted the batter, the way real pancakes never brown evenly. The side wall of every pancake is the pale cream of the risen crumb (#F1DDB0): a soft, spongy band with a fine open crumb texture, tiny irregular air pockets catching the light, meeting the browned top in a soft blurred edge rather than a hard line. A few tiny pinprick pores sit near the rim of the top pancake, barely visible. Where the pancakes touch, the top one presses very slightly into the one below, so the edges kiss softly instead of floating. The whole stack looks warm, tender and freshly flipped — the honest irregularity of a handmade bake.

HONEY WHIPPED CREAM. One generous dollop of lightly whipped cream sweetened with honey — a soft ivory (#FBF1DC) a shade warmer than plain cream — spoon-dropped slightly off-centre toward the front-left of the top pancake: soft rounded peaks, gentle folds, a matte velvety surface, its lower edge relaxing into a soft skirt against the warm pancake, with one thin thread of honey (#D9A441) still visible on its surface where it was folded in.

BRÛLÉED BANANA. Six slices of banana about 1 cm thick, cut slightly on the diagonal so they are ovals rather than perfect circles and each a little different in size, fanned in an overlapping arc that leans against the cream and continues onto the browned pancake: each slice was sprinkled with sugar and torched, so its top face carries a thin, glassy amber sugar crust (#C8862A) with darker toffee-brown scorch spots (#7A4218) that are uneven from slice to slice — one nearly fully dark, one barely touched — while the sides and the visible edge of the flesh stay a pale creamy ivory (#F3E7BE) with the small dark seed-dots at the centre. The crust catches a hard, bright highlight; one slice has cracked its crust, and one at the end of the fan has slid slightly out of line.

CARAMEL SAUCE. A warm caramel sauce (#B5651D), glossy and translucent at its thin edges, spooned over the banana and the cream so it pools in the hollows of the fan, coats the lowest slice, and runs over the front edge of the top pancake in three uneven drips of different lengths down the pale side walls — one thick drip reaching the bottom pancake and rounding into a soft bead, the others stopping on the middle layer — turning the crumb it touches a darker, glossy soaked amber.

FINISHING. A barely-there haze of powdered sugar over the far rim of the top pancake, away from the caramel. A light grating of dark chocolate (#3B2418) — fine, dry curled shavings of different lengths — over the cream and one end of the banana fan. The toppings gather toward the front-left so the browned pancake surface stays visible on the opposite side, and the composition reads as one deliberate, appetizing arrangement — realistic portion size, no duplicate identical elements.

MATERIALS AND LIGHT. Premium food-icon look: slightly simplified, clean forms with believable, appetizing materials — matte tender pancake crumb with a faint velvety sheen only where it browned, soft-matte cream, moist banana flesh under a hard glassy torched sugar crust with dark scorch spots, glossy translucent caramel, dry curled chocolate shavings. Soft studio softbox key light from the upper left with gentle warm ambient fill, a subtle rim of light along the top edges of the stack, and a faint, soft contact shadow directly beneath the stack only. Appetizing food-photography color grading: warm, fresh, clean whites, saturated but natural colours, no colour cast on the background. Shot as if with an 85 mm lens at a comfortable distance, everything in crisp focus.

CAMERA AND BACKGROUND. Three-quarter top-front view, the dessert centered with generous margin on all sides. Background: seamless solid pale sage (#DFEAE0), flat and even. Mood: a Korean-soufflé-café signature plate — torched banana over honey cream — that makes you want to pick up a fork. No text, no watermark, no plate, no cutlery, no table, no hands, no people, no characters, no facial features, no extra objects.
```

**②** 같은 채팅에서:

```
Same exact banana pancake stack, identical pancakes and identical topping arrangement — now seen in a straight-on front elevation view at table height, so the three pale cream side walls, the caramel drips running down the front and the fan of brûléed banana slices leaning on the cream are clearly visible. Keep every element exactly where it was; do not add, remove or move any topping between views, and keep the same colours and materials. Same seamless pale sage #DFEAE0 background, the dessert centered with generous margin, no plate, no extra objects.
```

**③** 같은 채팅에서:

```
Same exact banana pancake stack, identical pancakes and identical topping arrangement — now seen directly from above in a top-down view, so the fan of torched banana slices with their uneven amber crusts, the honey cream, the caramel pooling and the chocolate shavings are fully visible and the lower pancakes peek out where the stack is offset. Keep every element exactly where it was; do not add, remove or move any topping between views, and keep the same colours and materials. Same seamless pale sage #DFEAE0 background, the dessert centered with generous margin, no plate, no extra objects.
```

## 비트 퓌레 팬케이크 `pancake--beet-puree`

비고: 반죽 전체 선명한 핑크(표면 비트 조각 없음), 윗면은 로지 브라운으로 구워짐. 위엔 요거트 + 크림치즈 글레이즈 + 라즈베리·블루베리 + 민트. 탁한 갈색이면 폐기.

**①**

```
A semi-realistic stylized 3D dessert render of a tall stack of three thick, fluffy pink beetroot pancakes topped with a dollop of thick Greek yogurt, a drizzle of white cream cheese glaze, fresh raspberries and blueberries — a single dessert presented as one object on a plain seamless backdrop, no plate, styled the way a pastry chef would plate it for a café menu.

PANCAKES. Three thick, tender pancakes stacked with a small, casual offset, as if placed by hand rather than aligned by a machine — the middle one shifted a little to the right, the top one a little back. Each pancake is a plump, pillowy round about 2.5 cm thick with a gently domed top and a soft rounded edge that bulges slightly outward where the batter rose in the pan; the stack is about 60% as tall as it is wide and occupies roughly 65% of the frame width, leaving generous empty background around it. The batter was blended with beetroot purée, so every pancake is pink through and through: the side wall of each one is a soft, even rosy-pink crumb (#E08AA8) with a fine open texture and tiny air pockets, a couple of slightly deeper magenta streaks (#C4548A) where the purée was folded in, no beet pieces anywhere; the top face is where the pink met the hot pan, so it has browned over the pink in a soft blotchy gradient — a warm rosy-brown (#A65A58) at the centre fading through dusky rose (#C97F8A) to fresh pink (#E08AA8) at the rim, with a few darker freckles, the way a coloured batter never browns evenly. A few tiny pinprick pores sit near the rim of the top pancake, barely visible. Where the pancakes touch, the top one presses very slightly into the one below, so the edges kiss softly instead of floating. The whole stack looks warm, tender and freshly flipped — the honest irregularity of a handmade bake.

YOGURT. One generous dollop of thick Greek yogurt (#FBF6EC), spooned rather than piped, sits slightly off-centre toward the front-left of the top pancake: a dense, matte, softly peaked mound with a spoon-mark on one side, its lower edge settling into a soft skirt against the warm pancake. Its clean white is the sharpest contrast on the plate against the pink.

CREAM CHEESE GLAZE. A thin, opaque cream cheese glaze (#F6EFE3), loose enough to pour, has been drizzled over the stack in two or three loose zigzag lines that cross the yogurt and the pink top, then spill over the front edge and run down the rosy side walls in slow, uneven drips of different lengths — one reaching the bottom pancake, one stopping halfway. The glaze is smooth and semi-matte with a soft sheen along the thickest ribbons.

BERRIES. Four fresh raspberries (#C8324F) — hollow-centred, their tiny drupelets catching soft highlights, one tipped on its side showing the pale hollow — and about six blueberries (#3E4A73) with a dusty grey-blue bloom, each a slightly different size, arranged in a loose cluster on and around the yogurt: two raspberries on top of the yogurt, the others tumbling down its side onto the pancake, one blueberry alone near the rim.

FINISHING. A light haze of powdered sugar over the far rim of the top pancake, away from the glaze. One small sprig of fresh mint with two crisp leaves (#3E7A45) tucked against the yogurt. The toppings gather toward the front-left so the browned pancake surface stays visible on the opposite side, and the composition reads as one deliberate, appetizing arrangement — realistic portion size, no duplicate identical elements.

MATERIALS AND LIGHT. Premium food-icon look: slightly simplified, clean forms with believable, appetizing materials — matte tender pancake crumb with a faint velvety sheen only where it browned, dense matte yogurt, a semi-matte pourable glaze with a soft sheen, dewy raspberries and bloom-dusted blueberries, waxy mint leaves. Soft studio softbox key light from the upper left with gentle warm ambient fill, a subtle rim of light along the top edges of the stack, and a faint, soft contact shadow directly beneath the stack only. Appetizing food-photography color grading: warm, fresh, clean whites, saturated but natural colours, no colour cast on the background. Shot as if with an 85 mm lens at a comfortable distance, everything in crisp focus.

CAMERA AND BACKGROUND. Three-quarter top-front view, the dessert centered with generous margin on all sides. Background: seamless solid pale sage (#DFEAE0), flat and even. Mood: a bright, playful brunch plate — vivid pink under clean white and berry colours — that makes you want to pick up a fork. No text, no watermark, no plate, no cutlery, no table, no hands, no people, no characters, no facial features, no extra objects.
```

**②** 같은 채팅에서:

```
Same exact beetroot pancake stack, identical pancakes and identical topping arrangement — now seen in a straight-on front elevation view at table height, so the three pink side walls under browned tops, the yogurt and berries piled on top and the white glaze drips running down the front are clearly visible. Keep every element exactly where it was; do not add, remove or move any topping between views, and keep the same colours and materials. Same seamless pale sage #DFEAE0 background, the dessert centered with generous margin, no plate, no extra objects.
```

**③** 같은 채팅에서:

```
Same exact beetroot pancake stack, identical pancakes and identical topping arrangement — now seen directly from above in a top-down view, so the yogurt dollop, the zigzag of white glaze over the pink top, the raspberries and blueberries and the mint are fully visible and the lower pancakes peek out where the stack is offset. Keep every element exactly where it was; do not add, remove or move any topping between views, and keep the same colours and materials. Same seamless pale sage #DFEAE0 background, the dessert centered with generous margin, no plate, no extra objects.
```

## 말린 코코넛 팬케이크 `pancake--coconut-dried`

비고: 황금색으로 토스트된 넓은 컬 플레이크 듬뿍(흰 생코코넛이면 폐기) + 망고 큐브 + 망고 소스 + 크림은 보조.

**①**

```
A semi-realistic stylized 3D dessert render of a tall stack of three thick, fluffy buttermilk pancakes heaped with golden toasted coconut flakes, cubes of ripe mango, a small dollop of whipped cream and a glossy drizzle of mango sauce, finished with mint — a single dessert presented as one object on a plain seamless backdrop, no plate, styled the way a pastry chef would plate it for a café menu.

PANCAKES. Three thick, tender pancakes stacked with a small, casual offset, as if placed by hand rather than aligned by a machine — the middle one shifted a little to the right, the top one a little back. Each pancake is a plump, pillowy round about 2.5 cm thick with a gently domed top and a soft rounded edge that bulges slightly outward where the batter rose in the pan; the stack is about 60% as tall as it is wide and occupies roughly 65% of the frame width, leaving generous empty background around it. The top face of each pancake is griddle-browned in a soft, blotchy, uneven gradient — warm caramel brown (#B9793F) at the centre where it sat longest on the hot pan, fading through toasty golden (#CF9455) into light golden (#D9A76B) toward the rim, with a few slightly darker freckles and one paler patch where a bubble lifted the batter, the way real pancakes never brown evenly. The side wall of every pancake is the pale cream of the risen crumb (#F1DDB0): a soft, spongy band with a fine open crumb texture, tiny irregular air pockets catching the light, meeting the browned top in a soft blurred edge rather than a hard line. A few tiny pinprick pores sit near the rim of the top pancake, barely visible. Where the pancakes touch, the top one presses very slightly into the one below, so the edges kiss softly instead of floating. The whole stack looks warm, tender and freshly flipped — the honest irregularity of a handmade bake.

WHIPPED CREAM. One modest dollop of lightly whipped cream (#FFF8EC), spoon-dropped, sits slightly off-centre toward the front-left of the top pancake — soft rounded peaks, a matte velvety surface, its lower edge relaxing into a soft skirt — mostly buried under the coconut and fruit rather than the star.

TOASTED COCONUT. A generous heap of toasted coconut flakes — the wide, thin shaved kind, not fine desiccated shreds — piled over the cream and across the top pancake: dozens of irregular curled chips of different sizes, toasted to a range of golden browns from pale gold (#E3C48C) through amber (#C9963F) to a few dark-edged pieces (#9A6A2E), each curled a different way with slightly darker crisp edges, tumbling loosely so some stand on edge, a few sliding off onto the browned rim and one or two caught on a side wall. They read as crisp, dry and fragrant.

MANGO. About six cubes of ripe mango (#F5A623), roughly 1.5 cm but cut a little unevenly and sitting at their own angles, piled against the coconut and the cream — glossy, juicy cut faces with a faint fibrous grain, one cube tipped on its side, one alone near the rim leaving a small wet mark.

MANGO SAUCE AND FINISHING. A thick, glossy mango sauce (#E8901A), a bright orange-yellow purée, drizzled over the fruit and coconut so it pools in glossy patches among the cubes and spills over the front edge in two slow drips of different lengths down the pale side walls, turning the crumb it touches a darker soaked gold. One small sprig of fresh mint with two leaves (#3E7A45) tucked against the cream, and a few tiny torn mint flecks over the mango. The toppings gather toward the front-left so the browned pancake surface stays visible on the opposite side, and the composition reads as one deliberate, appetizing arrangement — realistic portion size, no duplicate identical elements.

MATERIALS AND LIGHT. Premium food-icon look: slightly simplified, clean forms with believable, appetizing materials — matte tender pancake crumb with a faint velvety sheen only where it browned, soft-matte cream, dry crisp toasted coconut chips with darker crisp edges, juicy glossy mango cubes, a thick glossy mango sauce, waxy mint leaves. Soft studio softbox key light from the upper left with gentle warm ambient fill, a subtle rim of light along the top edges of the stack, and a faint, soft contact shadow directly beneath the stack only. Appetizing food-photography color grading: warm, fresh, clean whites, saturated but natural colours, no colour cast on the background. Shot as if with an 85 mm lens at a comfortable distance, everything in crisp focus.

CAMERA AND BACKGROUND. Three-quarter top-front view, the dessert centered with generous margin on all sides. Background: seamless solid pale sage (#DFEAE0), flat and even. Mood: a sunny tropical-brunch stack — golden coconut and bright mango — that makes you want to pick up a fork. No text, no watermark, no plate, no cutlery, no table, no hands, no people, no characters, no facial features, no extra objects.
```

**②** 같은 채팅에서:

```
Same exact toasted coconut pancake stack, identical pancakes and identical topping arrangement — now seen in a straight-on front elevation view at table height, so the three pale cream side walls, the heap of golden coconut flakes and mango cubes on top and the mango sauce drips on the front are clearly visible. Keep every element exactly where it was; do not add, remove or move any topping between views, and keep the same colours and materials. Same seamless pale sage #DFEAE0 background, the dessert centered with generous margin, no plate, no extra objects.
```

**③** 같은 채팅에서:

```
Same exact toasted coconut pancake stack, identical pancakes and identical topping arrangement — now seen directly from above in a top-down view, so the heap of curled toasted coconut flakes, the mango cubes, the glossy mango sauce and the mint on the top pancake are fully visible and the lower pancakes peek out where the stack is offset. Keep every element exactly where it was; do not add, remove or move any topping between views, and keep the same colours and materials. Same seamless pale sage #DFEAE0 background, the dessert centered with generous margin, no plate, no extra objects.
```

## 아마씨가루 팬케이크 `pancake--flaxseed-ground`

비고: 통곡물 짙은 크럼(점박이 아님) + 요거트 + 바나나 + 블루베리 + 호두 + 통아마씨 꼬집 + 꿀. 씨앗 점박이 반죽이면 폐기.

**①**

```
A semi-realistic stylized 3D dessert render of a tall stack of three thick, hearty whole-grain flaxseed pancakes with a darker, rustic crumb, topped with a dollop of Greek yogurt, banana slices, blueberries, chopped walnuts, a pinch of whole flaxseeds and a thin drizzle of honey — a single dessert presented as one object on a plain seamless backdrop, no plate, styled the way a pastry chef would plate it for a café menu.

PANCAKES. Three thick, tender pancakes stacked with a small, casual offset, as if placed by hand rather than aligned by a machine — the middle one shifted a little to the right, the top one a little back. Each pancake is a plump, pillowy round about 2.5 cm thick with a gently domed top and a soft rounded edge that bulges slightly outward where the batter rose in the pan; the stack is about 60% as tall as it is wide and occupies roughly 65% of the frame width, leaving generous empty background around it. The batter is whole-grain with ground flaxseed, so the pancakes read darker and heartier than a plain stack: the side wall of each one is a warm oat-brown crumb (#D2AE7A) with a coarser open texture and a faint, even fleck of bran and ground flax throughout — no visible seeds, just a nutty, slightly speckled grain — and the top face is griddle-browned in a soft blotchy gradient from deep nutty brown (#8F5F33) at the centre to warm tan (#B98A55) at the rim, with a matte, slightly rougher surface than a white-flour pancake. A few tiny pinprick pores sit near the rim of the top pancake, barely visible. Where the pancakes touch, the top one presses very slightly into the one below, so the edges kiss softly instead of floating. The whole stack looks warm, tender and freshly flipped — the honest irregularity of a handmade bake.

GREEK YOGURT. One generous dollop of thick Greek yogurt (#FBF6EC), spooned rather than piped, sits slightly off-centre toward the front-left of the top pancake: a dense, matte, softly peaked mound with a spoon-mark on one side, its lower edge settling into a soft skirt against the warm pancake — the clean white is the brightest thing on the plate against the brown crumb.

FRUIT. Three slices of banana about 7 mm thick, cut a little unevenly, leaning in an overlapping row against the yogurt — pale creamy yellow (#F1E3A6) flesh with small dark seed-dots at the centre and a faint moist sheen. About seven blueberries (#3E4A73) with a dusty grey-blue bloom, each a slightly different size, in a loose cluster spilling from the yogurt onto the browned pancake, one alone near the rim.

NUTS, FLAXSEEDS AND HONEY. A small handful of toasted walnuts (#A9784A), coarsely chopped into pieces of clearly different sizes with their ridged surfaces showing, sprinkled over the yogurt and fruit. A pinch of whole flaxseeds — a mix of glossy brown (#5A3A1E) and golden (#C89A4A) seeds, each a tiny flat teardrop — sprinkled over the top of the yogurt where they show clearly against the white, a few sliding down its side. A thin drizzle of clear golden honey (#D9A441), translucent and glossy, traced once over everything and spilling over the front edge into two slow drips of different lengths down the side walls.

FINISHING. A very light dusting of ground cinnamon over the near rim. One small sprig of fresh mint with two leaves (#3E7A45) tucked against the yogurt. The toppings gather toward the front-left so the browned pancake surface stays visible on the opposite side, and the composition reads as one deliberate, appetizing arrangement — realistic portion size, no duplicate identical elements.

MATERIALS AND LIGHT. Premium food-icon look: slightly simplified, clean forms with believable, appetizing materials — matte tender pancake crumb with a faint velvety sheen only where it browned, dense matte yogurt, moist banana slices with a faint sheen, bloom-dusted blueberries, dry ridged walnut pieces, tiny glossy flaxseeds and translucent glossy honey. Soft studio softbox key light from the upper left with gentle warm ambient fill, a subtle rim of light along the top edges of the stack, and a faint, soft contact shadow directly beneath the stack only. Appetizing food-photography color grading: warm, fresh, clean whites, saturated but natural colours, no colour cast on the background. Shot as if with an 85 mm lens at a comfortable distance, everything in crisp focus.

CAMERA AND BACKGROUND. Three-quarter top-front view, the dessert centered with generous margin on all sides. Background: seamless solid pale sage (#DFEAE0), flat and even. Mood: a wholesome, nutty health-café breakfast — dark whole-grain under bright fruit — that makes you want to pick up a fork. No text, no watermark, no plate, no cutlery, no table, no hands, no people, no characters, no facial features, no extra objects.
```

**②** 같은 채팅에서:

```
Same exact whole-grain flaxseed pancake stack, identical pancakes and identical topping arrangement — now seen in a straight-on front elevation view at table height, so the three darker whole-grain side walls, the yogurt, fruit and nuts piled on top and the honey drips on the front are clearly visible. Keep every element exactly where it was; do not add, remove or move any topping between views, and keep the same colours and materials. Same seamless pale sage #DFEAE0 background, the dessert centered with generous margin, no plate, no extra objects.
```

**③** 같은 채팅에서:

```
Same exact whole-grain flaxseed pancake stack, identical pancakes and identical topping arrangement — now seen directly from above in a top-down view, so the yogurt dollop with whole flaxseeds on it, the banana slices, blueberries and walnuts and the honey line on the dark top pancake are fully visible and the lower pancakes peek out where the stack is offset. Keep every element exactly where it was; do not add, remove or move any topping between views, and keep the same colours and materials. Same seamless pale sage #DFEAE0 background, the dessert centered with generous margin, no plate, no extra objects.
```

## 팥 스월 팬케이크 `pancake--redbean-swirl`

비고: 크림에 한 번 접은 앙금 마블(완벽 나선 아님) + 통팥 낱알 + 꿀 + 호두. 도라야키 샌드 형태면 폐기.

**①**

```
A semi-realistic stylized 3D dessert render of a tall stack of three thick, fluffy buttermilk pancakes topped with whipped cream marbled with a swirl of smooth sweet red bean paste, a spoonful of whole sweet red beans, and a thin drizzle of honey — a single dessert presented as one object on a plain seamless backdrop, no plate, styled the way a pastry chef would plate it for a café menu.

PANCAKES. Three thick, tender pancakes stacked with a small, casual offset, as if placed by hand rather than aligned by a machine — the middle one shifted a little to the right, the top one a little back. Each pancake is a plump, pillowy round about 2.5 cm thick with a gently domed top and a soft rounded edge that bulges slightly outward where the batter rose in the pan; the stack is about 60% as tall as it is wide and occupies roughly 65% of the frame width, leaving generous empty background around it. The top face of each pancake is griddle-browned in a soft, blotchy, uneven gradient — warm caramel brown (#B9793F) at the centre where it sat longest on the hot pan, fading through toasty golden (#CF9455) into light golden (#D9A76B) toward the rim, with a few slightly darker freckles and one paler patch where a bubble lifted the batter, the way real pancakes never brown evenly. The side wall of every pancake is the pale cream of the risen crumb (#F1DDB0): a soft, spongy band with a fine open crumb texture, tiny irregular air pockets catching the light, meeting the browned top in a soft blurred edge rather than a hard line. A few tiny pinprick pores sit near the rim of the top pancake, barely visible. Where the pancakes touch, the top one presses very slightly into the one below, so the edges kiss softly instead of floating. The whole stack looks warm, tender and freshly flipped — the honest irregularity of a handmade bake.

CREAM AND RED BEAN SWIRL. A generous mound of lightly whipped cream (#FFF8EC) sits slightly off-centre on the top pancake, and a spoonful of smooth sweet red bean paste (#5E2A2A) has been folded once through it with the back of a spoon, so the white and the deep plum-brown marble together in loose, uneven ribbons — thick in one place, thin in another, broken where the spoon lifted — rather than a neat spiral. The cream keeps its soft rounded peaks and matte velvety surface; the paste is smooth and moist with a faint sheen, and where the two meet the edges blur into soft pink-brown streaks.

WHOLE BEANS. On top and down one side of the mound, a spoonful of whole sweet red beans (#7A3F3A) — about ten of them, each a plump rounded bean with a split, slightly wrinkled skin, glossy with their own dark syrup, at different angles and sizes: a cluster of five or six sitting in the cream, three sliding down its side onto the browned pancake, one alone near the rim leaving a small dark syrup smear behind it.

HONEY. A thin drizzle of clear golden honey (#D9A441), translucent and glossy, traced once across the cream and the beans and spilling over the front edge of the top pancake into two slow drips of different lengths down the pale side walls, turning the crumb it touches a darker soaked gold and catching a bright highlight along each drip.

FINISHING. A light haze of powdered sugar over the bare rim of the top pancake and the outer folds of the cream, dissolving into faint specks where it meets the honey. Two halves of a toasted walnut (#A9784A), their ridged surfaces catching the light, tucked against the base of the cream at different angles. The toppings gather toward the front-left so the browned pancake surface stays visible on the opposite side, and the composition reads as one deliberate, appetizing arrangement — realistic portion size, no duplicate identical elements.

MATERIALS AND LIGHT. Premium food-icon look: slightly simplified, clean forms with believable, appetizing materials — matte tender pancake crumb with a faint velvety sheen only where it browned, soft-matte cream, smooth moist red bean paste with a faint sheen, glossy syrup-coated whole beans, translucent glossy honey. Soft studio softbox key light from the upper left with gentle warm ambient fill, a subtle rim of light along the top edges of the stack, and a faint, soft contact shadow directly beneath the stack only. Appetizing food-photography color grading: warm, fresh, clean whites, saturated but natural colours, no colour cast on the background. Shot as if with an 85 mm lens at a comfortable distance, everything in crisp focus.

CAMERA AND BACKGROUND. Three-quarter top-front view, the dessert centered with generous margin on all sides. Background: seamless solid pale sage (#DFEAE0), flat and even. Mood: a cosy Korean bakery-café treat — the familiar red bean and fresh cream pairing on a warm stack — that makes you want to pick up a fork. No text, no watermark, no plate, no cutlery, no table, no hands, no people, no characters, no facial features, no extra objects.
```

**②** 같은 채팅에서:

```
Same exact red bean pancake stack, identical pancakes and identical topping arrangement — now seen in a straight-on front elevation view at table height, so the three pale cream side walls, the marbled cream and red bean mound on top, the beans sliding down its side and the honey drips on the front are clearly visible. Keep every element exactly where it was; do not add, remove or move any topping between views, and keep the same colours and materials. Same seamless pale sage #DFEAE0 background, the dessert centered with generous margin, no plate, no extra objects.
```

**③** 같은 채팅에서:

```
Same exact red bean pancake stack, identical pancakes and identical topping arrangement — now seen directly from above in a top-down view, so the marbled swirl of red bean paste through the cream, the whole beans and the honey line on the top pancake are fully visible and the lower pancakes peek out where the stack is offset. Keep every element exactly where it was; do not add, remove or move any topping between views, and keep the same colours and materials. Same seamless pale sage #DFEAE0 background, the dessert centered with generous margin, no plate, no extra objects.
```

## 구운 고구마 팬케이크 `pancake--sweetpotato-roasted`

비고: 자색고구마 큐브(꿀 광택·캐러멜 모서리) + 고구마 무스 로제트 + 크림 + 꿀 + 시나몬. 게임 재료 아이콘과 맞춰 보라 유지 — 주황이면 단호박으로 읽힌다.

**①**

```
A semi-realistic stylized 3D dessert render of a tall stack of three thick, fluffy buttermilk pancakes topped with whipped cream, glossy cubes of roasted purple sweet potato, a piped rosette of pale violet sweet potato mousse, a drizzle of honey and a dusting of cinnamon — a single dessert presented as one object on a plain seamless backdrop, no plate, styled the way a pastry chef would plate it for a café menu.

PANCAKES. Three thick, tender pancakes stacked with a small, casual offset, as if placed by hand rather than aligned by a machine — the middle one shifted a little to the right, the top one a little back. Each pancake is a plump, pillowy round about 2.5 cm thick with a gently domed top and a soft rounded edge that bulges slightly outward where the batter rose in the pan; the stack is about 60% as tall as it is wide and occupies roughly 65% of the frame width, leaving generous empty background around it. The top face of each pancake is griddle-browned in a soft, blotchy, uneven gradient — warm caramel brown (#B9793F) at the centre where it sat longest on the hot pan, fading through toasty golden (#CF9455) into light golden (#D9A76B) toward the rim, with a few slightly darker freckles and one paler patch where a bubble lifted the batter, the way real pancakes never brown evenly. The side wall of every pancake is the pale cream of the risen crumb (#F1DDB0): a soft, spongy band with a fine open crumb texture, tiny irregular air pockets catching the light, meeting the browned top in a soft blurred edge rather than a hard line. A few tiny pinprick pores sit near the rim of the top pancake, barely visible. Where the pancakes touch, the top one presses very slightly into the one below, so the edges kiss softly instead of floating. The whole stack looks warm, tender and freshly flipped — the honest irregularity of a handmade bake.

WHIPPED CREAM. One soft dollop of lightly whipped cream (#FFF8EC), spoon-dropped, sits slightly off-centre toward the front-left of the top pancake — rounded peaks, gentle folds, a matte velvety surface, its lower edge relaxing into a soft skirt against the warm pancake.

SWEET POTATO CUBES. About six cubes of roasted purple sweet potato (#7A4E96), each roughly 1.5 cm but cut a little unevenly and sitting at its own angle: two resting on the cream, three piled against its base on the browned pancake, one alone near the rim. Their cut faces show the dense, slightly fibrous violet flesh; their outer faces are darker where they roasted, with caramelised edges turning a warm amber-brown (#B06A2C), and all of them carry a light glossy coat of the honey they were tossed in, so their edges catch the light while their cut faces stay softly matte.

SWEET POTATO MOUSSE. Beside the cream, one small piped rosette of sweet potato mousse — a pale, dusty violet (#B08FC4) with a faint fibrous grain in its ridges rather than a perfectly smooth cream — piped in a loose swirl that leans slightly to one side, the way a hand-held bag leaves it.

HONEY AND FINISHING. A thin drizzle of clear golden honey (#D9A441) traced over the cubes and the cream, translucent and glossy, spilling over the front edge into two slow drips of different lengths down the pale side walls. A soft dusting of ground cinnamon (#9A5B34) over the cream and the near rim, heavier in one spot where the shaker paused. Two halves of a toasted pecan (#9C6B3E) tucked between the cubes at different angles. The toppings gather toward the front-left so the browned pancake surface stays visible on the opposite side, and the composition reads as one deliberate, appetizing arrangement — realistic portion size, no duplicate identical elements.

MATERIALS AND LIGHT. Premium food-icon look: slightly simplified, clean forms with believable, appetizing materials — matte tender pancake crumb with a faint velvety sheen only where it browned, soft-matte cream, honey-glossed roasted sweet potato cubes with matte violet cut faces, a slightly grainy matte mousse, translucent glossy honey. Soft studio softbox key light from the upper left with gentle warm ambient fill, a subtle rim of light along the top edges of the stack, and a faint, soft contact shadow directly beneath the stack only. Appetizing food-photography color grading: warm, fresh, clean whites, saturated but natural colours, no colour cast on the background. Shot as if with an 85 mm lens at a comfortable distance, everything in crisp focus.

CAMERA AND BACKGROUND. Three-quarter top-front view, the dessert centered with generous margin on all sides. Background: seamless solid pale sage (#DFEAE0), flat and even. Mood: a cosy autumn café dessert, sweet and earthy, that makes you want to pick up a fork. No text, no watermark, no plate, no cutlery, no table, no hands, no people, no characters, no facial features, no extra objects.
```

**②** 같은 채팅에서:

```
Same exact sweet potato pancake stack, identical pancakes and identical topping arrangement — now seen in a straight-on front elevation view at table height, so the three pale cream side walls, the cubes and cream piled on top with the mousse rosette beside them, and the honey drips on the front are clearly visible. Keep every element exactly where it was; do not add, remove or move any topping between views, and keep the same colours and materials. Same seamless pale sage #DFEAE0 background, the dessert centered with generous margin, no plate, no extra objects.
```

**③** 같은 채팅에서:

```
Same exact sweet potato pancake stack, identical pancakes and identical topping arrangement — now seen directly from above in a top-down view, so the arrangement of violet sweet potato cubes around the cream, the mousse rosette, the honey line and the cinnamon dusting are fully visible and the lower pancakes peek out where the stack is offset. Keep every element exactly where it was; do not add, remove or move any topping between views, and keep the same colours and materials. Same seamless pale sage #DFEAE0 background, the dessert centered with generous margin, no plate, no extra objects.
```

## 말차가루 팬케이크 `pancake--matcha-ground`

비고: 반죽 균일 초록(잎 조각 없음), 윗면은 갈색이 덮인 올리브브라운. 위엔 생크림 + 통팥 + 선명한 말차 더스팅 + 꿀 + 아몬드. 형광 초록·갈변 0이면 폐기.

**①**

```
A semi-realistic stylized 3D dessert render of a tall stack of three thick, fluffy matcha green tea pancakes topped with a dollop of whipped cream, a spoonful of sweet red beans, a sifted dusting of matcha powder and a thin drizzle of honey — a single dessert presented as one object on a plain seamless backdrop, no plate, styled the way a pastry chef would plate it for a café menu.

PANCAKES. Three thick, tender pancakes stacked with a small, casual offset, as if placed by hand rather than aligned by a machine — the middle one shifted a little to the right, the top one a little back. Each pancake is a plump, pillowy round about 2.5 cm thick with a gently domed top and a soft rounded edge that bulges slightly outward where the batter rose in the pan; the stack is about 60% as tall as it is wide and occupies roughly 65% of the frame width, leaving generous empty background around it. The batter is tinted with matcha, so every pancake is green through and through: the side wall of each one is a soft, even matcha-cream crumb (#A9C98A) with a fine open texture and tiny air pockets, no flecks or leaf pieces, just smooth colour; the top face is where the green met the hot pan, so it has browned over the green in a soft blotchy gradient — a warm olive-brown (#8B6F3A) at the centre fading through muted moss (#7F9A58) to fresh matcha green (#8FB86A) at the rim, with a few darker freckles, the way a green batter never browns evenly. A few tiny pinprick pores sit near the rim of the top pancake, barely visible. Where the pancakes touch, the top one presses very slightly into the one below, so the edges kiss softly instead of floating. The whole stack looks warm, tender and freshly flipped — the honest irregularity of a handmade bake.

WHIPPED CREAM. One soft dollop of lightly whipped cream (#FFF8EC), spoon-dropped rather than piped, sits slightly off-centre toward the front-left of the top pancake: rounded peaks, gentle folds, a matte velvety surface, its lower edge relaxing into a soft skirt where it meets the warm pancake. The bright white against the green is the first thing the eye lands on.

RED BEANS. A generous spoonful of sweet red bean paste with whole beans still visible (tsubuan) rests against the side of the cream and spills slightly onto the pancake — a glossy, deep plum-brown mass (#5A2B2B) in which about a dozen individual beans (#7A3F3A) show their rounded, split-skinned shapes at different angles, a few of them tumbling loose across the browned top and one or two stopping at the rim. The paste has a soft moist sheen and an uneven, spooned edge; where it touches the cream, a little of the dark syrup bleeds into the white.

MATCHA DUSTING. A fine sifted dusting of bright matcha powder (#6FA84B) over the cream and the near half of the top pancake — a soft haze of vivid green, heavier on the peaks of the cream and thinning out toward the edge, visibly finer and brighter than the baked green of the batter, settling into every fold and freckle it lands on.

HONEY AND FINISHING. A thin drizzle of clear golden honey (#D9A441) traced over the cream and the beans in one loose zigzag, translucent and glossy, with two slow drips running down the front side wall — one reaching the middle pancake, one short. A very light haze of powdered sugar on the far rim where the matcha did not reach. Three toasted sliced almonds (#D8B27C), each a different size, leaning against the cream. The toppings gather toward the front-left so the browned pancake surface stays visible on the opposite side, and the composition reads as one deliberate, appetizing arrangement — realistic portion size, no duplicate identical elements.

MATERIALS AND LIGHT. Premium food-icon look: slightly simplified, clean forms with believable, appetizing materials — matte tender pancake crumb with a faint velvety sheen only where it browned, soft-matte cream, glossy moist red bean paste, translucent glossy honey, dry powdery matcha dust. Soft studio softbox key light from the upper left with gentle warm ambient fill, a subtle rim of light along the top edges of the stack, and a faint, soft contact shadow directly beneath the stack only. Appetizing food-photography color grading: warm, fresh, clean whites, saturated but natural colours, no colour cast on the background. Shot as if with an 85 mm lens at a comfortable distance, everything in crisp focus.

CAMERA AND BACKGROUND. Three-quarter top-front view, the dessert centered with generous margin on all sides. Background: seamless solid pale sage (#DFEAE0), flat and even. Mood: a calm Japanese-café afternoon dessert, earthy green and sweet, that makes you want to pick up a fork. No text, no watermark, no plate, no cutlery, no table, no hands, no people, no characters, no facial features, no extra objects.
```

**②** 같은 채팅에서:

```
Same exact matcha pancake stack, identical pancakes and identical topping arrangement — now seen in a straight-on front elevation view at table height, so the three green side walls under browned tops, the cream and red beans piled on top and the honey drips running down the front are clearly visible. Keep every element exactly where it was; do not add, remove or move any topping between views, and keep the same colours and materials. Same seamless pale sage #DFEAE0 background, the dessert centered with generous margin, no plate, no extra objects.
```

**③** 같은 채팅에서:

```
Same exact matcha pancake stack, identical pancakes and identical topping arrangement — now seen directly from above in a top-down view, so the cream, the spoonful of red beans, the bright matcha dusting and the honey zigzag on the top pancake are fully visible and the lower pancakes peek out where the stack is offset. Keep every element exactly where it was; do not add, remove or move any topping between views, and keep the same colours and materials. Same seamless pale sage #DFEAE0 background, the dessert centered with generous margin, no plate, no extra objects.
```

## 꿀 스월 팬케이크 `pancake--honey-jam`

비고: 육각 셀이 보이는 벌집 조각 + 녹는 허니콤 버터 디스크 + 꿀을 과하다 싶게 흘림. 생크림 없음. 벌집 없이 시럽만이면 폐기.

**①**

```
A semi-realistic stylized 3D dessert render of a tall stack of three thick, fluffy buttermilk pancakes topped with a chunk of raw honeycomb and a melting disc of honeycomb butter, with golden honey poured generously over the top and running down the sides — a single dessert presented as one object on a plain seamless backdrop, no plate, styled the way a pastry chef would plate it for a café menu.

PANCAKES. Three thick, tender pancakes stacked with a small, casual offset, as if placed by hand rather than aligned by a machine — the middle one shifted a little to the right, the top one a little back. Each pancake is a plump, pillowy round about 2.5 cm thick with a gently domed top and a soft rounded edge that bulges slightly outward where the batter rose in the pan; the stack is about 60% as tall as it is wide and occupies roughly 65% of the frame width, leaving generous empty background around it. The top face of each pancake is griddle-browned in a soft, blotchy, uneven gradient — warm caramel brown (#B9793F) at the centre where it sat longest on the hot pan, fading through toasty golden (#CF9455) into light golden (#D9A76B) toward the rim, with a few slightly darker freckles and one paler patch where a bubble lifted the batter, the way real pancakes never brown evenly. The side wall of every pancake is the pale cream of the risen crumb (#F1DDB0): a soft, spongy band with a fine open crumb texture, tiny irregular air pockets catching the light, meeting the browned top in a soft blurred edge rather than a hard line. A few tiny pinprick pores sit near the rim of the top pancake, barely visible. Where the pancakes touch, the top one presses very slightly into the one below, so the edges kiss softly instead of floating. The whole stack looks warm, tender and freshly flipped — the honest irregularity of a handmade bake.

HONEYCOMB. One chunk of raw honeycomb, about 4 cm across and cut a little unevenly, sits just off-centre on the top pancake: a deep golden-amber block (#C98A2A) whose hexagonal wax cells are clearly visible on its top and cut faces, some cells still capped with pale wax (#E7CFA0), others open and brimming, honey oozing slowly from its lower edge into a small glossy pool.

HONEYCOMB BUTTER. Leaning against the honeycomb, one round disc of honeycomb butter about 3.5 cm across and 1 cm thick — a pale ivory-gold (#F0DDA8) with tiny darker flecks of crushed honeycomb suspended in it — already melting where it touches the warm pancake: its bottom edge has softened into a glossy golden pool spreading under the honeycomb, its top still holds its shape with a soft sheen.

HONEY. Clear golden honey (#D9A441), translucent and slow, has been poured generously — almost too generously — over everything: it glazes the honeycomb, floods the dip around the butter, sheets across the top face and spills over the edge at three places, running down the pale side walls in thick, slow drips of different lengths and widths, the longest reaching the bottom pancake and rounding into a heavy bead, the others stopping on the middle layer. A few tiny air bubbles are trapped in the thickest pool, and every drip catches a bright soft highlight.

FINISHING. A barely-there haze of powdered sugar over the far rim of the top pancake, away from the honey. Nothing else — honey, comb and butter are the whole story. The pour lands toward the front-left so the browned pancake surface stays visible on the far side, and everything reads as one deliberate, appetizing plate: realistic portion size, no duplicate identical elements.

MATERIALS AND LIGHT. Premium food-icon look: slightly simplified, clean forms with believable, appetizing materials — matte tender pancake crumb with a faint velvety sheen only where it browned, waxy translucent honeycomb with glossy brimming cells, a semi-soft melting butter disc, and thick translucent honey with bright soft highlights. Soft studio softbox key light from the upper left with gentle warm ambient fill, a subtle rim of light along the top edges of the stack, and a faint, soft contact shadow directly beneath the stack only. Appetizing food-photography color grading: warm, fresh, clean whites, saturated but natural colours, no colour cast on the background. Shot as if with an 85 mm lens at a comfortable distance, everything in crisp focus.

CAMERA AND BACKGROUND. Three-quarter top-front view, the dessert centered with generous margin on all sides. Background: seamless solid pale sage (#DFEAE0), flat and even. Mood: an Australian-brunch-café indulgence, honey still moving, that makes you want to pick up a fork. No text, no watermark, no plate, no cutlery, no table, no hands, no people, no characters, no facial features, no extra objects.
```

**②** 같은 채팅에서:

```
Same exact honeycomb pancake stack, identical pancakes and identical topping arrangement — now seen in a straight-on front elevation view at table height, so the three pale cream side walls, the heavy honey drips running down the front, and the honeycomb chunk and melting butter disc on top are clearly visible. Keep every element exactly where it was; do not add, remove or move any topping between views, and keep the same colours and materials. Same seamless pale sage #DFEAE0 background, the dessert centered with generous margin, no plate, no extra objects.
```

**③** 같은 채팅에서:

```
Same exact honeycomb pancake stack, identical pancakes and identical topping arrangement — now seen directly from above in a top-down view, so the hexagonal cells of the honeycomb chunk, the butter disc and the pooled honey on the top pancake are fully visible and the lower pancakes peek out where the stack is offset. Keep every element exactly where it was; do not add, remove or move any topping between views, and keep the same colours and materials. Same seamless pale sage #DFEAE0 background, the dessert centered with generous margin, no plate, no extra objects.
```

---

# 배치 3 — experimental (5종, 게임 미노출)

호환성 판정표에는 있지만 v1 게임에는 안 뜬다(노출 = verified + conditional). 자산이 필요해지면 던지고, 아니면 건너뛴다.

## 올리브 팬케이크 `pancake--olive-flesh`

비고: 세이버리. 칼라마타 통·반(광택) + 페타 크럼블 + 방울토마토 + 허브 + 올리브오일. 시럽·생크림·단 과일이 나오면 폐기.

**①**

```
A semi-realistic stylized 3D dessert render of a tall stack of three thick, fluffy savoury pancakes topped with whole and halved Kalamata olives, crumbled feta, halved cherry tomatoes, fresh herbs and a glossy drizzle of extra-virgin olive oil — a single dessert presented as one object on a plain seamless backdrop, no plate, styled the way a pastry chef would plate it for a café menu.

PANCAKES. Three thick, tender pancakes stacked with a small, casual offset, as if placed by hand rather than aligned by a machine — the middle one shifted a little to the right, the top one a little back. Each pancake is a plump, pillowy round about 2.5 cm thick with a gently domed top and a soft rounded edge that bulges slightly outward where the batter rose in the pan; the stack is about 60% as tall as it is wide and occupies roughly 65% of the frame width, leaving generous empty background around it. These are savoury pancakes, so the crumb is a shade denser and the browning a shade deeper than a sweet stack: the side wall of each one is a pale golden-cream crumb (#EDD9A8) with a fine open texture and tiny air pockets, and the top face is griddle-browned in a soft blotchy gradient — deep golden brown (#A96F35) at the centre fading to warm gold (#D2A461) at the rim — with a few darker freckles and a light scatter of cracked black pepper baked into the surface. A few tiny pinprick pores sit near the rim of the top pancake, barely visible. Where the pancakes touch, the top one presses very slightly into the one below, so the edges kiss softly instead of floating. The whole stack looks warm, tender and freshly flipped — the honest irregularity of a handmade bake.

OLIVES. About seven Kalamata olives in glossy deep purple-black (#3E2A33), their skins catching soft highlights, no two the same size: three whole olives, one still with its wrinkled tip, leaning against each other near the front-left; four halves cut lengthwise showing the paler purple-brown flesh inside (#6B4A4F) and the hollow where the pit was, laid at different angles — two cut-face up on top, one tipped against a tomato, one sliding toward the rim. A little of their brine has left a small dark glossy smear on the pancake beneath them.

FETA. A generous crumble of feta (#FAF4E4) — irregular chunks and fine crumbs of clearly different sizes, some as big as a fingertip with sharp broken edges, others powder-fine — sprinkled over and around the olives, a few pieces resting on the olives themselves, a drift of crumbs across the browned top and a couple caught on a side wall. The feta is matte, dense and slightly damp-looking.

TOMATOES AND HERBS. Three cherry tomatoes (#D93A2E) halved, their glossy cut faces showing the seeds and jelly, placed cut-face up at different angles among the olives, one whole small tomato with a bit of green stem beside them. Fresh herbs: a few small oregano leaves (#4E7A3B) and roughly torn flat-leaf parsley (#3E7A45) sprinkled over everything, plus one small sprig of oregano resting on top.

OLIVE OIL AND FINISHING. A drizzle of extra-virgin olive oil (#C9B83A), clear, glossy and faintly green-gold, traced over the toppings so it pools in small glossy beads on the feta and the tomatoes, glazes the olives, and runs over the front edge in two slow, thin drips down the pale side walls, darkening the crumb it touches. A pinch of coarse sea salt flakes and a few grinds of cracked black pepper over the top. The toppings gather toward the front-left so the browned pancake surface stays visible on the opposite side, and the composition reads as one deliberate, appetizing arrangement — realistic portion size, no duplicate identical elements.

MATERIALS AND LIGHT. Premium food-icon look: slightly simplified, clean forms with believable, appetizing materials — matte tender pancake crumb with a faint velvety sheen only where it browned, glossy taut olive skins, matte crumbly feta, juicy glossy tomato cut faces, clear green-gold oil with bright small highlights, and soft matte herb leaves. Soft studio softbox key light from the upper left with gentle warm ambient fill, a subtle rim of light along the top edges of the stack, and a faint, soft contact shadow directly beneath the stack only. Appetizing food-photography color grading: warm, fresh, clean whites, saturated but natural colours, no colour cast on the background. Shot as if with an 85 mm lens at a comfortable distance, everything in crisp focus.

CAMERA AND BACKGROUND. Three-quarter top-front view, the dessert centered with generous margin on all sides. Background: seamless solid pale sage (#DFEAE0), flat and even. Mood: a bright Mediterranean savoury brunch — briny, herby and golden — that makes you want to pick up a fork. No text, no watermark, no plate, no cutlery, no table, no hands, no people, no characters, no facial features, no extra objects.
```

**②** 같은 채팅에서:

```
Same exact savoury olive pancake stack, identical pancakes and identical topping arrangement — now seen in a straight-on front elevation view at table height, so the three pale golden side walls, the olives, feta and tomatoes piled on top and the thin olive oil drips on the front are clearly visible. Keep every element exactly where it was; do not add, remove or move any topping between views, and keep the same colours and materials. Same seamless pale sage #DFEAE0 background, the dessert centered with generous margin, no plate, no extra objects.
```

**③** 같은 채팅에서:

```
Same exact savoury olive pancake stack, identical pancakes and identical topping arrangement — now seen directly from above in a top-down view, so the whole and halved olives, the feta crumble, the tomato halves, the herbs and the glossy oil pooling on the top pancake are fully visible and the lower pancakes peek out where the stack is offset. Keep every element exactly where it was; do not add, remove or move any topping between views, and keep the same colours and materials. Same seamless pale sage #DFEAE0 background, the dessert centered with generous margin, no plate, no extra objects.
```

## 계피가루 팬케이크 `pancake--cinnamon-ground`

비고: 윗면에 구워진 시나몬-설탕 스월(느슨·오프센터·끊김 1회) + 흰 크림치즈 글레이즈 지그재그 + 버터 + 시나몬 슈거. 완벽한 과녁 나선이면 폐기.

**①**

```
A semi-realistic stylized 3D dessert render of a tall stack of three thick, fluffy cinnamon roll pancakes, each with a dark cinnamon-sugar swirl baked into its top, drizzled with white cream cheese glaze, with a small pat of butter and a sprinkle of cinnamon sugar — a single dessert presented as one object on a plain seamless backdrop, no plate, styled the way a pastry chef would plate it for a café menu.

PANCAKES. Three thick, tender pancakes stacked with a small, casual offset, as if placed by hand rather than aligned by a machine — the middle one shifted a little to the right, the top one a little back. Each pancake is a plump, pillowy round about 2.5 cm thick with a gently domed top and a soft rounded edge that bulges slightly outward where the batter rose in the pan; the stack is about 60% as tall as it is wide and occupies roughly 65% of the frame width, leaving generous empty background around it. The batter itself carries a little ground cinnamon, so the side wall of each pancake is a warm cinnamon-cream crumb (#E2C193) with a fine open texture and tiny air pockets. The top face of each pancake is griddle-browned in a soft blotchy gradient — warm caramel (#B9793F) at the centre fading to light golden (#D9A76B) at the rim — and baked into that top face is the signature: a loose, hand-piped swirl of cinnamon-brown sugar (#6E3B1E) that starts a little off-centre and coils outward two and a half turns, its line thickening and thinning, breaking once where the piping bag skipped, sunk slightly into the surface as a darker caramelised groove with a soft toasted sheen. The middle and bottom pancakes show only the edge of their swirls where they peek out from under the layer above. A few tiny pinprick pores sit near the rim of the top pancake, barely visible. Where the pancakes touch, the top one presses very slightly into the one below, so the edges kiss softly instead of floating. The whole stack looks warm, tender and freshly flipped — the honest irregularity of a handmade bake.

CREAM CHEESE GLAZE. A loose, opaque cream cheese glaze (#F6EFE3), thin enough to pour but thick enough to hold a ribbon, has been drizzled over the stack in three or four loose zigzag lines that cross the swirl on the top pancake, collect in the grooves of the swirl, and spill over the front edge to run down the cinnamon-cream side walls in slow, uneven drips of different lengths — one reaching the bottom pancake and rounding into a soft bead, the others stopping on the middle layer. The glaze is smooth and semi-matte with a soft sheen along its thickest ribbons, and a little of the dark cinnamon sugar has bled into it where they meet.

BUTTER. One small square pat of butter (#F3DDA0), about 1.5 cm, sits near the centre of the swirl, still holding its shape with softened corners, its bottom edge just beginning to melt into a small glossy pool that mingles with the glaze.

FINISHING. A sprinkle of coarse cinnamon sugar — visible sugar crystals (#F1DEC0) mixed with cinnamon (#9A5B34) — over the glaze and the near rim, heavier in one spot where the fingers opened, and a soft haze of ground cinnamon drifting onto the far rim. Nothing else: swirl, glaze, butter and sugar are the whole story. The drizzle lands toward the front-left so part of the baked swirl stays clearly visible on the far side, and everything reads as one deliberate, appetizing plate — realistic portion size, no duplicate identical elements.

MATERIALS AND LIGHT. Premium food-icon look: slightly simplified, clean forms with believable, appetizing materials — matte tender pancake crumb with a faint velvety sheen only where it browned, a semi-matte pourable glaze with a soft sheen, a caramelised cinnamon-sugar swirl with a toasted gleam, a solid butter pat just starting to melt, and dry sparkling sugar crystals. Soft studio softbox key light from the upper left with gentle warm ambient fill, a subtle rim of light along the top edges of the stack, and a faint, soft contact shadow directly beneath the stack only. Appetizing food-photography color grading: warm, fresh, clean whites, saturated but natural colours, no colour cast on the background. Shot as if with an 85 mm lens at a comfortable distance, everything in crisp focus.

CAMERA AND BACKGROUND. Three-quarter top-front view, the dessert centered with generous margin on all sides. Background: seamless solid pale sage (#DFEAE0), flat and even. Mood: a warm American-diner cinnamon-roll breakfast, glaze still running, that makes you want to pick up a fork. No text, no watermark, no plate, no cutlery, no table, no hands, no people, no characters, no facial features, no extra objects.
```

**②** 같은 채팅에서:

```
Same exact cinnamon roll pancake stack, identical pancakes and identical topping arrangement — now seen in a straight-on front elevation view at table height, so the three cinnamon-cream side walls, the white glaze drips running down the front and the butter pat on top are clearly visible. Keep every element exactly where it was; do not add, remove or move any topping between views, and keep the same colours and materials. Same seamless pale sage #DFEAE0 background, the dessert centered with generous margin, no plate, no extra objects.
```

**③** 같은 채팅에서:

```
Same exact cinnamon roll pancake stack, identical pancakes and identical topping arrangement — now seen directly from above in a top-down view, so the dark cinnamon-sugar swirl baked into the top pancake, the zigzag of white glaze over it, the butter pat and the cinnamon sugar are fully visible and the lower pancakes peek out where the stack is offset. Keep every element exactly where it was; do not add, remove or move any topping between views, and keep the same colours and materials. Same seamless pale sage #DFEAE0 background, the dessert centered with generous margin, no plate, no extra objects.
```

## 건포도 팬케이크 `pancake--raisin-flesh`

비고: 럼에 불려 통통하고 윤기 나는 건포도 스푼 + 시럽 + 크림 + 시나몬 + 메이플. 옆벽 단면 3~4개만 — 윗면에 박힌 마른 건포도면 폐기.

**①**

```
A semi-realistic stylized 3D dessert render of a tall stack of three thick, fluffy buttermilk pancakes with a few raisins baked into the batter, topped with a dollop of whipped cream and a spoonful of plump rum-soaked raisins in their glossy amber syrup, with a dusting of cinnamon and a thin drizzle of maple syrup — a single dessert presented as one object on a plain seamless backdrop, no plate, styled the way a pastry chef would plate it for a café menu.

PANCAKES. Three thick, tender pancakes stacked with a small, casual offset, as if placed by hand rather than aligned by a machine — the middle one shifted a little to the right, the top one a little back. Each pancake is a plump, pillowy round about 2.5 cm thick with a gently domed top and a soft rounded edge that bulges slightly outward where the batter rose in the pan; the stack is about 60% as tall as it is wide and occupies roughly 65% of the frame width, leaving generous empty background around it. The top face of each pancake is griddle-browned in a soft, blotchy, uneven gradient — warm caramel brown (#B9793F) at the centre fading through toasty golden (#CF9455) into light golden (#D9A76B) toward the rim, with a few darker freckles. The side wall of every pancake is the pale cream of the risen crumb (#F1DDB0), a soft spongy band with a fine open texture, and because the batter had a handful of raisins mixed through it, three or four raisins show on the side walls as flat, dark, wrinkled ovals (#3B2418) flush with the crumb, cut through where the pancake was flipped and pressed, each a different size — not on the top face, only in the walls. A few tiny pinprick pores sit near the rim of the top pancake, barely visible. Where the pancakes touch, the top one presses very slightly into the one below, so the edges kiss softly instead of floating. The whole stack looks warm, tender and freshly flipped — the honest irregularity of a handmade bake.

WHIPPED CREAM. One generous dollop of lightly whipped cream (#FFF8EC), spoon-dropped rather than piped, sits slightly off-centre toward the front-left of the top pancake: soft rounded peaks with gentle folds, a matte velvety surface, its lower edge relaxing into a soft skirt against the warm pancake.

RUM RAISINS. A spoonful of rum-soaked raisins — about twenty, swollen plump and glossy from their soak, a deep red-brown to near-black (#4A2A1E) with their wrinkles softened into loose folds rather than dry creases, each a slightly different size and shape — spooned over the top of the cream and down its side, so a cluster sits nestled in the white, a dozen more tumble across the browned top pancake in a loose drift that thins toward the far rim, and two or three roll to the edge. They come with their soaking syrup: a translucent amber (#B8742C) glaze that coats every raisin, pools in small glossy beads between them, stains the cream a faint gold where it soaks in, and spills over the front edge in two slow drips of different lengths down the pale side walls.

MAPLE AND CINNAMON. A thin drizzle of maple syrup (#A85A1A), translucent and glossy, traced once across the cream and raisins and joining the raisin syrup on its way over the edge. A soft dusting of ground cinnamon (#9A5B34) over the cream and the near rim, heavier in one spot where the shaker paused, with a few grains settling on the raisins.

FINISHING. A barely-there haze of powdered sugar over the far rim of the top pancake. Two halves of a toasted walnut (#A9784A), their ridged surfaces catching the light, tucked against the base of the cream at different angles. The toppings gather toward the front-left so the browned pancake surface stays visible on the opposite side, and the composition reads as one deliberate, appetizing arrangement — realistic portion size, no duplicate identical elements.

MATERIALS AND LIGHT. Premium food-icon look: slightly simplified, clean forms with believable, appetizing materials — matte tender pancake crumb with a faint velvety sheen only where it browned, soft-matte cream, plump glossy syrup-coated raisins with softened folds, translucent amber syrup, dry ridged walnut halves and dry cinnamon dust. Soft studio softbox key light from the upper left with gentle warm ambient fill, a subtle rim of light along the top edges of the stack, and a faint, soft contact shadow directly beneath the stack only. Appetizing food-photography color grading: warm, fresh, clean whites, saturated but natural colours, no colour cast on the background. Shot as if with an 85 mm lens at a comfortable distance, everything in crisp focus.

CAMERA AND BACKGROUND. Three-quarter top-front view, the dessert centered with generous margin on all sides. Background: seamless solid pale sage (#DFEAE0), flat and even. Mood: a warm, spiced bakery-café plate — boozy plump raisins over cream — that makes you want to pick up a fork. No text, no watermark, no plate, no cutlery, no table, no hands, no people, no characters, no facial features, no extra objects.
```

**②** 같은 채팅에서:

```
Same exact rum raisin pancake stack, identical pancakes and identical topping arrangement — now seen in a straight-on front elevation view at table height, so the three pale cream side walls with a few flat raisin cross-sections in them, the syrup drips running down the front and the cream heaped with glossy raisins on top are clearly visible. Keep every element exactly where it was; do not add, remove or move any topping between views, and keep the same colours and materials. Same seamless pale sage #DFEAE0 background, the dessert centered with generous margin, no plate, no extra objects.
```

**③** 같은 채팅에서:

```
Same exact rum raisin pancake stack, identical pancakes and identical topping arrangement — now seen directly from above in a top-down view, so the drift of plump rum raisins over the cream and the top pancake, the syrup beads, the cinnamon dusting and the walnut halves are fully visible and the lower pancakes peek out where the stack is offset. Keep every element exactly where it was; do not add, remove or move any topping between views, and keep the same colours and materials. Same seamless pale sage #DFEAE0 background, the dessert centered with generous margin, no plate, no extra objects.
```

## 메이플 팬케이크 `pancake--maple-cube`

비고: 버터 조각 + 메이플 슈거 큐브가 따뜻한 시럽에 반쯤 녹는 중 + 시럽 부음 + 다진 피칸(통 피칸 아님) + 시나몬.

**①**

```
A semi-realistic stylized 3D dessert render of a tall stack of three thick, fluffy buttermilk pancakes topped with a pat of butter, small cubes of maple sugar half-dissolving in warm maple syrup poured over the top, and a handful of toasted chopped pecans — a single dessert presented as one object on a plain seamless backdrop, no plate, styled the way a pastry chef would plate it for a café menu.

PANCAKES. Three thick, tender pancakes stacked with a small, casual offset, as if placed by hand rather than aligned by a machine — the middle one shifted a little to the right, the top one a little back. Each pancake is a plump, pillowy round about 2.5 cm thick with a gently domed top and a soft rounded edge that bulges slightly outward where the batter rose in the pan; the stack is about 60% as tall as it is wide and occupies roughly 65% of the frame width, leaving generous empty background around it. The top face of each pancake is griddle-browned in a soft, blotchy, uneven gradient — warm caramel brown (#B9793F) at the centre where it sat longest on the hot pan, fading through toasty golden (#CF9455) into light golden (#D9A76B) toward the rim, with a few slightly darker freckles and one paler patch where a bubble lifted the batter, the way real pancakes never brown evenly. The side wall of every pancake is the pale cream of the risen crumb (#F1DDB0): a soft, spongy band with a fine open crumb texture, tiny irregular air pockets catching the light, meeting the browned top in a soft blurred edge rather than a hard line. A few tiny pinprick pores sit near the rim of the top pancake, barely visible. Where the pancakes touch, the top one presses very slightly into the one below, so the edges kiss softly instead of floating. The whole stack looks warm, tender and freshly flipped — the honest irregularity of a handmade bake.

BUTTER. One square pat of butter, about 2 cm across with slightly uneven cut edges, sits just off-centre on the top pancake — still a solid pale yellow square (#F3DDA0) with softened corners, its bottom edge just beginning to melt into a small glossy golden pool.

MAPLE SUGAR CUBES. About six small cubes of maple sugar (#D9A85C), roughly 1 cm but each a slightly different size with soft, slightly crumbly edges and its own tilt, gathered around the butter: two resting on the browned pancake still dry and sugary-matte, three half-dissolving where the warm syrup reached them — their lower halves gone glossy and translucent amber, their tops still pale and grainy — and one that has slid to the rim leaving a short glossy trail.

MAPLE SYRUP. Warm maple syrup (#A85A1A), translucent amber and slow, poured generously over the stack: it sheets across the top face, gathers around the butter and the cubes, spills over the edge at two places and runs down the pale side walls in several drips of different lengths and widths — one broad drip reaching the bottom pancake and rounding into a soft bead, thinner ones stopping on the middle layer. Where it runs it turns the crumb a darker glossy soaked gold and catches a bright highlight along every drip.

PECANS AND FINISHING. A handful of toasted pecans (#8F5E36), coarsely chopped into pieces of clearly different sizes — a few larger halves-of-halves with their ridged surfaces showing, several small broken bits — sprinkled over the top and the syrup, some stuck in the sugar cubes, a couple caught in a drip on the side. A very light dusting of ground cinnamon over the near rim. The toppings gather toward the front-left so the browned pancake surface stays visible on the opposite side, and the composition reads as one deliberate, appetizing arrangement — realistic portion size, no duplicate identical elements.

MATERIALS AND LIGHT. Premium food-icon look: slightly simplified, clean forms with believable, appetizing materials — matte tender pancake crumb with a faint velvety sheen only where it browned, a solid butter pat just starting to gleam at its base, grainy matte sugar cubes turning glossy where they dissolve, translucent glossy syrup, and dry ridged toasted pecans. Soft studio softbox key light from the upper left with gentle warm ambient fill, a subtle rim of light along the top edges of the stack, and a faint, soft contact shadow directly beneath the stack only. Appetizing food-photography color grading: warm, fresh, clean whites, saturated but natural colours, no colour cast on the background. Shot as if with an 85 mm lens at a comfortable distance, everything in crisp focus.

CAMERA AND BACKGROUND. Three-quarter top-front view, the dessert centered with generous margin on all sides. Background: seamless solid pale sage (#DFEAE0), flat and even. Mood: a rich North-American diner breakfast, syrup still moving over sugar and nuts, that makes you want to pick up a fork. No text, no watermark, no plate, no cutlery, no table, no hands, no people, no characters, no facial features, no extra objects.
```

**②** 같은 채팅에서:

```
Same exact maple pancake stack, identical pancakes and identical topping arrangement — now seen in a straight-on front elevation view at table height, so the three pale cream side walls, the syrup drips running down the front, and the butter, sugar cubes and pecans piled on top are clearly visible. Keep every element exactly where it was; do not add, remove or move any topping between views, and keep the same colours and materials. Same seamless pale sage #DFEAE0 background, the dessert centered with generous margin, no plate, no extra objects.
```

**③** 같은 채팅에서:

```
Same exact maple pancake stack, identical pancakes and identical topping arrangement — now seen directly from above in a top-down view, so the butter pat, the half-dissolving maple sugar cubes, the pooled syrup and the chopped pecans on the top pancake are fully visible and the lower pancakes peek out where the stack is offset. Keep every element exactly where it was; do not add, remove or move any topping between views, and keep the same colours and materials. Same seamless pale sage #DFEAE0 background, the dessert centered with generous margin, no plate, no extra objects.
```

## 유자 팬케이크 `pancake--yuzu-fresh`

비고: 유자 크림(연노랑) + 유자청 건더기(껍질 채 엉킴) + 시럽 + 캔디드 필 트위스트 + 민트. 생유자 슬라이스·레몬 톤이면 폐기.

**①**

```
A semi-realistic stylized 3D dessert render of a tall stack of three thick, fluffy buttermilk pancakes topped with a dollop of pale yellow yuzu cream, a spoonful of yuzu marmalade with fine shreds of peel, glossy yuzu syrup running down one side, and a twist of candied yuzu peel — a single dessert presented as one object on a plain seamless backdrop, no plate, styled the way a pastry chef would plate it for a café menu.

PANCAKES. Three thick, tender pancakes stacked with a small, casual offset, as if placed by hand rather than aligned by a machine — the middle one shifted a little to the right, the top one a little back. Each pancake is a plump, pillowy round about 2.5 cm thick with a gently domed top and a soft rounded edge that bulges slightly outward where the batter rose in the pan; the stack is about 60% as tall as it is wide and occupies roughly 65% of the frame width, leaving generous empty background around it. The top face of each pancake is griddle-browned in a soft, blotchy, uneven gradient — warm caramel brown (#B9793F) at the centre where it sat longest on the hot pan, fading through toasty golden (#CF9455) into light golden (#D9A76B) toward the rim, with a few slightly darker freckles and one paler patch where a bubble lifted the batter, the way real pancakes never brown evenly. The side wall of every pancake is the pale cream of the risen crumb (#F1DDB0): a soft, spongy band with a fine open crumb texture, tiny irregular air pockets catching the light, meeting the browned top in a soft blurred edge rather than a hard line. A few tiny pinprick pores sit near the rim of the top pancake, barely visible. Where the pancakes touch, the top one presses very slightly into the one below, so the edges kiss softly instead of floating. The whole stack looks warm, tender and freshly flipped — the honest irregularity of a handmade bake.

YUZU CREAM. One generous dollop of whipped cream folded with yuzu curd — a pale, soft yellow (#F5E7A8), lighter and more muted than lemon curd, with a faint marbling where the curd was not fully mixed in — sits slightly off-centre toward the front-left of the top pancake: soft rounded peaks, a spoon-dropped shape with gentle folds, a matte velvety surface, its lower edge relaxing into a soft skirt against the warm pancake.

YUZU MARMALADE. A spoonful of yuzu marmalade (yuja-cheong) rests on top of the cream and slides a little down its side: a glossy, translucent golden-amber jelly (#D9A431) packed with fine shreds of yuzu peel (#C9A22A) — thin, slightly curled strips of different lengths, some with a hint of green-yellow rind, tangled loosely rather than laid flat — with a few shreds escaping onto the browned pancake below. The marmalade catches bright soft highlights and looks sticky and fresh.

SYRUP. The thin syrup from the marmalade (#E3B84A), clear and glossy, has run off the spoonful over the front edge of the top pancake in two slow drips of different lengths down the pale side walls, turning the crumb it touches a darker soaked gold, with a small glossy pool forming where the top and middle pancakes meet.

FINISHING. One twist of candied yuzu peel (#D4B13A), a thin curled strip about 4 cm long with a slightly bumpy rind, balanced on the cream. A barely-there haze of powdered sugar over the far rim of the top pancake. One small sprig of fresh mint with two leaves (#3E7A45) tucked against the cream. The toppings gather toward the front-left so the browned pancake surface stays visible on the opposite side, and the composition reads as one deliberate, appetizing arrangement — realistic portion size, no duplicate identical elements.

MATERIALS AND LIGHT. Premium food-icon look: slightly simplified, clean forms with believable, appetizing materials — matte tender pancake crumb with a faint velvety sheen only where it browned, soft-matte pale-yellow cream, glossy translucent marmalade with fine peel shreds, clear glossy syrup, a slightly waxy candied peel twist, waxy mint leaves. Soft studio softbox key light from the upper left with gentle warm ambient fill, a subtle rim of light along the top edges of the stack, and a faint, soft contact shadow directly beneath the stack only. Appetizing food-photography color grading: warm, fresh, clean whites, saturated but natural colours, no colour cast on the background. Shot as if with an 85 mm lens at a comfortable distance, everything in crisp focus.

CAMERA AND BACKGROUND. Three-quarter top-front view, the dessert centered with generous margin on all sides. Background: seamless solid pale sage (#DFEAE0), flat and even. Mood: a fresh, fragrant Korean-café dessert — citrus-bright and honeyed — that makes you want to pick up a fork. No text, no watermark, no plate, no cutlery, no table, no hands, no people, no characters, no facial features, no extra objects.
```

**②** 같은 채팅에서:

```
Same exact yuzu pancake stack, identical pancakes and identical topping arrangement — now seen in a straight-on front elevation view at table height, so the three pale cream side walls, the yuzu cream and marmalade piled on top, the peel twist and the syrup drips on the front are clearly visible. Keep every element exactly where it was; do not add, remove or move any topping between views, and keep the same colours and materials. Same seamless pale sage #DFEAE0 background, the dessert centered with generous margin, no plate, no extra objects.
```

**③** 같은 채팅에서:

```
Same exact yuzu pancake stack, identical pancakes and identical topping arrangement — now seen directly from above in a top-down view, so the pale yellow cream, the tangle of peel shreds in the marmalade, the peel twist and the mint are fully visible and the lower pancakes peek out where the stack is offset. Keep every element exactly where it was; do not add, remove or move any topping between views, and keep the same colours and materials. Same seamless pale sage #DFEAE0 background, the dessert centered with generous margin, no plate, no extra objects.
```

