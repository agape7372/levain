package com.zaballgam.levain;

import android.graphics.Color;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // 구형 WebView(<140) 폴백에서 시스템바 인셋이 네이티브 패딩으로 처리될 때
        // 드러나는 배경을 앱 베이지(#E8D9C4)로 — 상태바 뒤 흰 띠 시각오류 방지 (docs/QA.md D)
        int levainBg = Color.parseColor("#E8D9C4");
        getWindow().getDecorView().setBackgroundColor(levainBg);
        if (bridge != null && bridge.getWebView() != null) {
            bridge.getWebView().setBackgroundColor(levainBg);
            Object parent = bridge.getWebView().getParent();
            if (parent instanceof android.view.View) {
                ((android.view.View) parent).setBackgroundColor(levainBg);
            }
        }
    }
}
