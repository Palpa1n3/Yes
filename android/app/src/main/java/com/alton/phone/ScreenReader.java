package com.alton.phone;

import android.accessibilityservice.AccessibilityService;
import android.content.ComponentName;
import android.content.Context;
import android.provider.Settings;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * Reads the text on screen when Alton asks (to read the rota in the user's shift app). It does
 * nothing on its own: it only reads while Alton has opened the shift app for that purpose.
 */
public class ScreenReader extends AccessibilityService {

    private static ScreenReader instance;
    /** When the user last touched something (clicks, scrolls, typing, switching apps). */
    static volatile long lastActivity = 0;
    private final android.content.BroadcastReceiver power = new android.content.BroadcastReceiver() {
        @Override
        public void onReceive(Context c, android.content.Intent i) {
            AutoRota.onPowerConnected(c.getApplicationContext());
        }
    };

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
        // The charger going in is when the rota can be read by itself (see AutoRota).
        android.content.IntentFilter f = new android.content.IntentFilter(android.content.Intent.ACTION_POWER_CONNECTED);
        try {
            if (android.os.Build.VERSION.SDK_INT >= 33) registerReceiver(power, f, Context.RECEIVER_NOT_EXPORTED);
            else registerReceiver(power, f);
        } catch (Exception ignored) {}
    }

    @Override
    public boolean onUnbind(android.content.Intent intent) {
        instance = null;
        try {
            unregisterReceiver(power);
        } catch (Exception ignored) {}
        return super.onUnbind(intent);
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (!AutoRota.running) lastActivity = System.currentTimeMillis();
    }

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

    /** Scrolls the first scrollable list back to the top (a few pages up). */
    public void scrollToTop() {
        for (int i = 0; i < 10; i++) {
            AccessibilityNodeInfo s = findScrollable(getRootInActiveWindow(), 0);
            if (s == null || !s.performAction(AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD)) return;
        }
    }

    private static final java.util.regex.Pattern DATEISH = java.util.regex.Pattern.compile(
        "\\b\\d{1,2}(st|nd|rd|th)?\\s?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)|\\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\s\\d{1,2}\\b|\\b\\d{1,2}/\\d{1,2}\\b",
        java.util.regex.Pattern.CASE_INSENSITIVE
    );

    /**
     * Goes to the next week in a rota: a button named like "next" (or the user's own name for it),
     * else the control just to the right of the date bar at the top (an arrow or the next date tab).
     */
    public boolean tapNextWeek(String own) {
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null) return false;
        if (own != null && !own.trim().isEmpty() && tapText(own)) {
            lastTap = "your button ‘" + own + "’";
            return true;
        }
        for (String t : new String[] { "Next week", "Next", "Forward", "›", ">", "→", "Following week" })
            if (tapText(t)) {
                lastTap = "button ‘" + t + "’";
                return true;
            }
        if (tapContaining(new String[] { "next week", "next period", "go forward" })) {
            lastTap = "a button containing ‘next week/period’";
            return true;
        }
        // The date bar: the highest date-looking text in the top part of the screen.
        android.graphics.Rect screen = new android.graphics.Rect();
        root.getBoundsInScreen(screen);
        List<AccessibilityNodeInfo> all = new java.util.ArrayList<>();
        flatten(root, all, 0);
        AccessibilityNodeInfo header = null;
        android.graphics.Rect hb = new android.graphics.Rect();
        for (AccessibilityNodeInfo n : all) {
            CharSequence t = n.getText() != null ? n.getText() : n.getContentDescription();
            if (t == null || t.length() > 40 || !DATEISH.matcher(t).find()) continue;
            android.graphics.Rect b = new android.graphics.Rect();
            n.getBoundsInScreen(b);
            if (b.top > screen.top + screen.height() * 0.4) continue;
            if (header == null || b.top < hb.top) {
                header = n;
                hb.set(b);
            }
        }
        if (header == null) {
            lastTap = "no ‘Next’ button and no date text near the top";
            return false;
        }
        // The nearest tappable thing to its right on the same row.
        AccessibilityNodeInfo best = null;
        int bestDx = Integer.MAX_VALUE;
        for (AccessibilityNodeInfo n : all) {
            if (!n.isClickable() || n.equals(header)) continue;
            android.graphics.Rect b = new android.graphics.Rect();
            n.getBoundsInScreen(b);
            if (Math.abs(b.centerY() - hb.centerY()) > hb.height() + 20) continue;
            if (b.centerX() <= hb.centerX() || b.contains(hb)) continue;
            int dx = b.left - hb.right;
            if (dx < -hb.width() / 2) continue;
            if (Math.abs(dx) < bestDx) {
                bestDx = Math.abs(dx);
                best = n;
            }
        }
        if (best == null) {
            lastTap = "date text " + describe(header, null) + " but nothing tappable to its right";
            return false;
        }
        boolean ok = best.performAction(AccessibilityNodeInfo.ACTION_CLICK);
        lastTap = "right of date " + describe(header, null) + " → " + describe(best, null) + (ok ? "" : " — tap refused");
        return ok;
    }

    private void flatten(AccessibilityNodeInfo n, List<AccessibilityNodeInfo> out, int depth) {
        if (n == null || depth > 40 || out.size() > 800) return;
        out.add(n);
        for (int i = 0; i < n.getChildCount(); i++) flatten(n.getChild(i), out, depth + 1);
    }

    /**
     * Taps a tab by name. When the name shows more than once (a "SCHEDULE" heading and the
     * Schedule button in the bottom bar), it taps the lowest one on screen: the navigation bar.
     */
    /** What the last tap found (for the reader's step log). */
    static volatile String lastTap = "";

    /** "‘Schedule’ button at 540,2210 (270×140)". */
    static String describe(AccessibilityNodeInfo n, CharSequence label) {
        if (n == null) return "nothing";
        android.graphics.Rect b = new android.graphics.Rect();
        n.getBoundsInScreen(b);
        CharSequence cls = n.getClassName();
        String c = cls == null ? "view" : cls.toString().replaceAll(".*\\.", "");
        CharSequence t = label != null ? label : n.getText() != null ? n.getText() : n.getContentDescription();
        String s = t == null ? "" : t.toString().replace('\n', ' ');
        if (s.length() > 40) s = s.substring(0, 40) + "…";
        return "‘" + s + "’ " + c + " at " + b.centerX() + "," + b.centerY() + " (" + b.width() + "×" + b.height() + ")"
            + (n.isClickable() ? "" : " not clickable");
    }

    /** Short labels in the lower part of the screen (the tab bar), to show what was there. */
    private static String labelsSeen(List<AccessibilityNodeInfo> all, android.graphics.Rect screen) {
        StringBuilder sb = new StringBuilder();
        int n = 0;
        for (AccessibilityNodeInfo x : all) {
            CharSequence t = x.getText() != null ? x.getText() : x.getContentDescription();
            if (t == null || t.length() == 0 || t.length() > 30) continue;
            android.graphics.Rect b = new android.graphics.Rect();
            x.getBoundsInScreen(b);
            if (b.top < screen.top + screen.height() * 0.6) continue;
            if (n++ > 0) sb.append(", ");
            sb.append("‘").append(t.toString().replace('\n', ' ')).append("’");
            if (n >= 14) break;
        }
        return n == 0 ? "no labels in the lower part of the screen" : sb.toString();
    }

    public boolean tapTab(String target) {
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null) {
            lastTap = "no window to read";
            return false;
        }
        String want = tabName(target);
        if (want.isEmpty()) return false;
        List<AccessibilityNodeInfo> all = new java.util.ArrayList<>();
        flatten(root, all, 0);
        AccessibilityNodeInfo best = null;
        CharSequence bestLabel = null;
        int bestScore = 0;
        int bestTop = Integer.MIN_VALUE;
        for (AccessibilityNodeInfo n : all) {
            int score = Math.max(labelScore(n.getText(), want), labelScore(n.getContentDescription(), want));
            if (score == 0) continue;
            AccessibilityNodeInfo c = clickableFor(n, all);
            if (c == null) continue;
            android.graphics.Rect b = new android.graphics.Rect();
            c.getBoundsInScreen(b);
            // Exact names beat loose ones; then the lowest on screen (the bottom navigation bar).
            if (score > bestScore || (score == bestScore && b.top > bestTop)) {
                bestScore = score;
                bestTop = b.top;
                best = c;
                bestLabel = n.getText() != null ? n.getText() : n.getContentDescription();
            }
        }
        if (best == null) {
            android.graphics.Rect screen = new android.graphics.Rect();
            root.getBoundsInScreen(screen);
            lastTap = "no ‘" + target + "’; seen: " + labelsSeen(all, screen);
            return false;
        }
        boolean ok = best.performAction(AccessibilityNodeInfo.ACTION_CLICK);
        lastTap = (bestScore == 2 ? "" : "(loose match) ") + describe(best, bestLabel) + (ok ? "" : " — tap refused");
        return ok;
    }

    /** "Schedule, Tab 2 of 4" / "SCHEDULE (3)" / "Shift Trade selected" → "schedule" / "shift trade". */
    static String tabName(CharSequence cs) {
        if (cs == null) return "";
        String s = cs.toString().toLowerCase(java.util.Locale.ROOT);
        s = s.replaceAll("\\btab\\s*\\d+\\s*(of|/)\\s*\\d+", " ")
            .replaceAll("\\b(not selected|selected|button|tab|double tap to activate|new)\\b", " ")
            .replaceAll("[^a-z ]+", " ")
            .replaceAll("\\s+", " ")
            .trim();
        return s;
    }

    /** 2 = the label is exactly the name (after tidying), 1 = a short label starting with it, 0 = no. */
    private static int labelScore(CharSequence cs, String want) {
        if (cs == null || cs.length() == 0 || cs.length() > 80) return 0;
        for (String line : cs.toString().split("[\\n,]")) {
            if (tabName(line).equals(want)) return 2;
        }
        String all = tabName(cs);
        if (all.equals(want)) return 2;
        if (all.length() <= want.length() + 14 && (all.startsWith(want + " ") || all.endsWith(" " + want))) return 1;
        return 0;
    }

    /** The node to tap for a label: itself or a tappable parent, else the smallest tappable thing
     *  that covers the label's middle (some apps put the touch area beside the text). */
    private static AccessibilityNodeInfo clickableFor(AccessibilityNodeInfo n, List<AccessibilityNodeInfo> all) {
        AccessibilityNodeInfo c = n;
        int up = 0;
        while (c != null && !c.isClickable() && up++ < 8) c = c.getParent();
        if (c != null && c.isClickable()) return c;
        android.graphics.Rect r = new android.graphics.Rect();
        n.getBoundsInScreen(r);
        if (r.isEmpty()) return null;
        int cx = r.centerX();
        int cy = r.centerY();
        AccessibilityNodeInfo best = null;
        long bestArea = Long.MAX_VALUE;
        android.graphics.Rect b = new android.graphics.Rect();
        for (AccessibilityNodeInfo m : all) {
            if (!m.isClickable()) continue;
            m.getBoundsInScreen(b);
            if (!b.contains(cx, cy)) continue;
            long area = (long) b.width() * b.height();
            if (area < bestArea) {
                bestArea = area;
                best = m;
            }
        }
        return best;
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

    /** Taps the first short item whose text or description contains one of these words. */
    public boolean tapContaining(String[] words) {
        AccessibilityNodeInfo n = findContaining(getRootInActiveWindow(), words, 0);
        while (n != null && !n.isClickable()) n = n.getParent();
        return n != null && n.performAction(AccessibilityNodeInfo.ACTION_CLICK);
    }

    private AccessibilityNodeInfo findContaining(AccessibilityNodeInfo n, String[] words, int depth) {
        if (n == null || depth > 40) return null;
        for (CharSequence cs : new CharSequence[] { n.getText(), n.getContentDescription() }) {
            if (cs == null || cs.length() > 40) continue;
            String s = cs.toString().toLowerCase();
            for (String w : words) if (s.contains(w)) return n;
        }
        for (int i = 0; i < n.getChildCount(); i++) {
            AccessibilityNodeInfo f = findContaining(n.getChild(i), words, depth + 1);
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
