# 빵 이미지 생성 프롬프트

1. `breads/<id>.json`의 `prompt_flat`을 외부 이미지 생성기(ChatGPT 등)에 복붙해 1:1 1024 이미지를 생성한다.
2. 생성된 이미지를 `assets/breads/src/<id>.png`로 저장한다.
3. 가능하면 `views`에 나온 다른 각도로도 재생성해 `assets/breads/src/<id>-2.png`, `<id>-3.png`로 저장한다(멀티뷰 image-to-3D용).
4. 저장된 이미지를 image-to-3D 도구에 넣어 GLB로 변환한다.
