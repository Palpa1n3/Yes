package com.alton.phone;

import android.accessibilityservice.AccessibilityService;
import android.content.ComponentName;
import android.content.Context;
import android.provider.Settings;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import java.util.LinkedHashSet;
import java.util.Set;

/**
 * Reads the text on screen when Alton asks (to read the rota in the user's shift app). It does
 * nothing on its own: it only reads while Alton has opened the shift app for that purpose.
 */
public class ScreenReader extends AccessibilityService {

    private static ScreenReader instance;

    public static boolean isEnabled(Context ctx) {
        String flat = Settings.Secure.getString(ctx.getContentResolver(), Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
        if (flat == null) return false;
        ComponentName me = new ComponentName(ctx, ScreenReader.class);
        return flat.contains(me.flattenToString()) || flat.contains(me.flattenToShortString());
    }

    public static ScreenReader get() {
        return instance;
    }

    @Override
    protected void onServiceConnected() {
        instance = this;
    }

    @Override
    public boolean onUnbind(android.content.Intent intent) {
        instance = null;
        return super.onUnbind(intent);
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {}

    @Override
    public void onInterrupt() {}

    /** Package name of the app in front, or "". */
    public String frontPackage() {
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null || root.getPackageName() == null) return "";
        return root.getPackageName().toString();
    }

    /** The text in this app's windows (not the keyboard or pop-ups from others). */
    public void collectApp(String pkg, Set<String> lines) {
        boolean any = false;
        try {
            for (android.view.accessibility.AccessibilityWindowInfo w : getWindows()) {
                AccessibilityNodeInfo root = w.getRoot();
                if (root != null && root.getPackageName() != null && pkg.equals(root.getPackageName().toString())) {
                    walk(root, lines, 0);
                    any = true;
                }
            }
        } catch (Exception ignored) {}
        if (!any) collect(lines);
    }

    /** All the text on screen, in reading order, one line per item. */
    public void collect(Set<String> lines) {
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root != null) walk(root, lines, 0);
    }

    private void walk(AccessibilityNodeInfo n, Set<String> lines, int depth) {
        if (n == null || depth > 40 || lines.size() > 600) return;
        CharSequence t = n.getText();
        if (t == null || t.length() == 0) t = n.getContentDescription();
        if (t != null) {
            String s = t.toString().trim();
            if (!s.isEmpty() && s.length() < 300) lines.add(s);
        }
        for (int i = 0; i < n.getChildCount(); i++) walk(n.getChild(i), lines, depth + 1);
    }

    /** Scrolls the first scrollable list down a page. False when nothing can scroll. */
    public boolean scrollDown() {
        AccessibilityNodeInfo root = getRootInActiveWindow();
        AccessibilityNodeInfo s = findScrollable(root, 0);
        return s != null && s.performAction(AccessibilityNodeInfo.ACTION_SCROLL_FORWARD);
    }

    private AccessibilityNodeInfo findScrollable(AccessibilityNodeInfo n, int depth) {
        if (n == null || depth > 40) return null;
        if (n.isScrollable()) return n;
        for (int i = 0; i < n.getChildCount(); i++) {
            AccessibilityNodeInfo f = findScrollable(n.getChild(i), depth + 1);
            if (f != null) return f;
        }
        return null;
    }

    /** Taps the first item whose text or description is exactly this (any case). */
    public boolean tapText(String target) {
        AccessibilityNodeInfo n = find(getRootInActiveWindow(), target.trim().toLowerCase(), 0);
        while (n != null && !n.isClickable()) n = n.getParent();
        return n != null && n.performAction(AccessibilityNodeInfo.ACTION_CLICK);
    }

    private AccessibilityNodeInfo find(AccessibilityNodeInfo n, String target, int depth) {
        if (n == null || depth > 40) return null;
        CharSequence t = n.getText();
        CharSequence d = n.getContentDescription();
        if ((t != null && t.toString().trim().toLowerCase().equals(target))
            || (d != null && d.toString().trim().toLowerCase().equals(target))) return n;
        for (int i = 0; i < n.getChildCount(); i++) {
            AccessibilityNodeInfo f = find(n.getChild(i), target, depth + 1);
            if (f != null) return f;
        }
        return null;
    }

    /** Types into the first text box on screen. */
    public boolean typeText(String text) {
        AccessibilityNodeInfo box = findEditable(getRootInActiveWindow(), 0);
        if (box == null) return false;
        box.performAction(AccessibilityNodeInfo.ACTION_FOCUS);
        android.os.Bundle args = new android.os.Bundle();
        args.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text);
        return box.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args);
    }

    private AccessibilityNodeInfo findEditable(AccessibilityNodeInfo n, int depth) {
        if (n == null || depth > 40) return null;
        if (n.isEditable()) return n;
        for (int i = 0; i < n.getChildCount(); i++) {
            AccessibilityNodeInfo f = findEditable(n.getChild(i), depth + 1);
            if (f != null) return f;
        }
        return null;
    }

    /** Presses Send: a button described as "Send", else the keyboard's enter on the text box. */
    public boolean pressSend() {
        if (tapText("Send") || tapText("Send message") || tapText("Send chat")) return true;
        if (android.os.Build.VERSION.SDK_INT >= 30) {
            AccessibilityNodeInfo box = findEditable(getRootInActiveWindow(), 0);
            return box != null
                && box.performAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_IME_ENTER.getId());
        }
        return false;
    }

    public static Set<String> newLines() {
        return new LinkedHashSet<>();
    }
}
