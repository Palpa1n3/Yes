package com.alton.phone;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import java.util.Set;

/**
 * Reads the rota in the user's shift app (the app must already be opening): waits for it, taps
 * the Schedule tab, reads and scrolls each week, then moves to the next week. Used by the
 * "read my shift app" tool and by the automatic read while charging.
 */
final class AppReader {

    interface Done {
        void done(Set<String> lines, String err, String front);
    }

    private static final Handler main = new Handler(Looper.getMainLooper());

    private AppReader() {}

    static void run(final Context ctx, final String pkg, final String tapFirst, final String nextName, final int weeks, final Done done) {
        final Set<String> lines = ScreenReader.newLines();
        // stage, tries in this stage, pages read this week, weeks read
        final int[] st = { 0, 0, 0, 0 };
        final String[] seen = { "" };
        final String[] note = { null };
        // Reading open shifts / swaps rather than the rota.
        final String tf = tapFirst == null ? "" : tapFirst.toLowerCase(java.util.Locale.ROOT);
        final boolean trades = tf.contains("trade") || tf.contains("swap") || tf.contains("open shift");
        final Runnable[] step = new Runnable[1];
        step[0] = () -> {
            ScreenReader sr = ScreenReader.get();
            if (sr == null) {
                done.done(lines, "Screen reading was switched off.", seen[0]);
                return;
            }
            seen[0] = sr.frontPackage();
            switch (st[0]) {
                case 0: // wait for the app to be in front (splash screens, sign-in)
                    if (!pkg.equals(seen[0]) && st[1]++ < 8) {
                        main.postDelayed(step[0], 1500);
                        return;
                    }
                    st[0] = 1;
                    st[1] = 0;
                    main.postDelayed(step[0], 2500);
                    return;
                case 1: { // go to the tab asked for: the rota (the one set, else "Schedule"…) or shift trades
                    boolean tapped = false;
                    if (tapFirst != null && !tapFirst.isEmpty()) tapped = sr.tapTab(tapFirst);
                    // Shift trades never fall back to the rota: reading the rota as "trades" misleads.
                    String[] others = trades
                        ? new String[] { "Shift Trade", "Shift Trades", "Trades", "Trade", "Shift Swap", "Swaps", "Open Shifts", "Marketplace" }
                        : new String[] { "Schedule", "My schedule", "Rota", "My rota", "My shifts", "Shifts" };
                    if (!tapped)
                        for (String t : others)
                            if (sr.tapTab(t)) {
                                tapped = true;
                                break;
                            }
                    // Not there yet (still loading)? Try again a few times.
                    if (!tapped && st[1]++ < 3) {
                        main.postDelayed(step[0], 2000);
                        return;
                    }
                    if (!tapped)
                        note[0] = "Couldn't find the \"" + (tapFirst == null || tapFirst.isEmpty() ? "Schedule" : tapFirst)
                            + "\" tab, so this is whatever screen the app opened on.";
                    // Shift trades: no Day/Week switch, no next week.
                    st[0] = trades ? 2 : 5;
                    st[1] = 0;
                    main.postDelayed(step[0], tapped ? 2500 : 500);
                    return;
                }
                case 5: // Day / Week / Month views: read a week at a time
                    st[0] = 2;
                    if (sr.tapTab("Week")) {
                        main.postDelayed(step[0], 2000);
                        return;
                    }
                    main.post(step[0]);
                    return;
                case 2: { // read this week: wait until it has loaded, then scroll down for the rest
                    Set<String> page = ScreenReader.newLines();
                    sr.collectApp(pkg, page);
                    // (An empty trades list never "looks loaded": wait less for it.)
                    if (st[2] == 0 && !AltonNativePlugin.looksLoaded(page) && st[1]++ < (trades ? 4 : 12)) {
                        main.postDelayed(step[0], 2000);
                        return;
                    }
                    int before = lines.size();
                    lines.addAll(page);
                    st[2]++;
                    if (st[2] < 8 && (st[2] == 1 || lines.size() > before) && sr.scrollDown()) {
                        main.postDelayed(step[0], 1300);
                        return;
                    }
                    st[3]++;
                    st[0] = 3;
                    main.post(step[0]);
                    return;
                }
                default: // next week: back to the top, then the date bar's "next"
                    if (st[3] >= weeks) {
                        done.done(lines, note[0], seen[0]);
                        return;
                    }
                    sr.scrollToTop();
                    if (!sr.tapNextWeek(nextName)) {
                        note[0] = "Read this week only: couldn't find the button for the next week. "
                            + "Set its name in Settings › Phone powers.";
                        done.done(lines, note[0], seen[0]);
                        return;
                    }
                    lines.add("— next week —");
                    st[0] = 2;
                    st[1] = 0;
                    st[2] = 0;
                    main.postDelayed(step[0], 2500);
            }
        };
        main.postDelayed(step[0], 2000);
    }
}
