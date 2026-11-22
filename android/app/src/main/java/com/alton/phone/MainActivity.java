package com.alton.phone;

import android.content.Intent;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebView;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(IntentLinksPlugin.class);
        registerPlugin(AltonNativePlugin.class);
        super.onCreate(savedInstanceState);
        String mode = modeFor(getIntent());
        if (mode != null) {
            AltonNativePlugin.assistPending = true;
            AltonNativePlugin.assistMode = mode;
        }
        watchKeyboard();
    }

    private int lastKb = -1;

    /**
     * The app draws edge to edge (Android 15), so the keyboard slides over the page instead of
     * shrinking it. Measure how much of the WebView the keyboard covers and tell the page
     * (CSS var --kb, class "kb" on <html>), which lifts the chat box above it. Only reads insets,
     * so Capacitor's own system-bar margins are left alone.
     */
    private void watchKeyboard() {
        final View root = getWindow().getDecorView();
        root.getViewTreeObserver().addOnGlobalLayoutListener(() -> {
            WebView wv = getBridge() == null ? null : getBridge().getWebView();
            if (wv == null) return;
            WindowInsetsCompat ins = ViewCompat.getRootWindowInsets(root);
            int ime = ins == null || !ins.isVisible(WindowInsetsCompat.Type.ime())
                ? 0
                : ins.getInsets(WindowInsetsCompat.Type.ime()).bottom;
            int covered = 0;
            if (ime > 0) {
                int[] loc = new int[2];
                wv.getLocationOnScreen(loc);
                int[] rootLoc = new int[2];
                root.getLocationOnScreen(rootLoc);
                int kbTop = rootLoc[1] + root.getHeight() - ime;
                covered = Math.max(0, loc[1] + wv.getHeight() - kbTop);
            }
            float density = getResources().getDisplayMetrics().density;
            int css = Math.round(covered / density);
            if (css == lastKb) return;
            lastKb = css;
            wv.evaluateJavascript(
                "(function(){var d=document.documentElement;d.style.setProperty('--kb','" + css + "px');"
                    + "d.classList.toggle('kb'," + (css > 0) + ");"
                    + "window.dispatchEvent(new Event('altonkb'));})()",
                null
            );
        });
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        String mode = modeFor(intent);
        if (mode != null) AltonNativePlugin.assistOpened(mode);
    }

    /** Opened by the assistant button or a widget button: what to start with. */
    private static String modeFor(Intent i) {
        if (i == null || i.getAction() == null) return null;
        if (Intent.ACTION_ASSIST.equals(i.getAction()) || AltonWidget.DRIVE.equals(i.getAction())) return "drive";
        if (AltonWidget.TALK.equals(i.getAction())) return "talk";
        return null;
    }
}
