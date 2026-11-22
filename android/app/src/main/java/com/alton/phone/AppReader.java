package com.alton.phone;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import java.util.ArrayList;
import java.util.List;
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
    /** Where the last read's step log is kept (so a failed or automatic read can be shown too). */
    static final String PREFS = "alton_reader";

    /** The step log of the read in progress: what it saw and tapped, for "Copy log". */
    private static final List<String> LOG = new ArrayList<>();
    private static long logStart = 0;

    private static void log(String s) {
        synchronized (LOG) {
            if (LOG.size() < 300) LOG.add(String.format(java.util.Locale.ROOT, "%5.1fs  %s", (System.currentTimeMillis() - logStart) / 1000.0, s));
        }
    }

    private static void saveLog(Context ctx) {
        StringBuilder sb = new StringBuilder();
        synchronized (LOG) {
            for (String s : LOG) sb.append(s).append('\n');
        }
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString("log", sb.toString())
            .putLong("at", System.currentTimeMillis())
            .apply();
    }

    private AppReader() {}

    static void run(final Context ctx, final String pkg, final String tapFirst, final String nextName, final int weeks, final Done finished) {
        synchronized (LOG) {
            LOG.clear();
        }
        logStart = System.currentTimeMillis();
        log("Reading " + pkg + " · tab ‘" + (tapFirst == null ? "" : tapFirst) + "’ · next ‘" + (nextName == null ? "" : nextName) + "’ · weeks " + weeks
            + " · " + android.os.Build.MANUFACTURER + " " + android.os.Build.MODEL + ", Android " + android.os.Build.VERSION.RELEASE);
        // Every way out logs the result and keeps the log.
        final Done done = (l, err, front) -> {
            log("Finished: " + l.size() + " lines" + (front == null || front.isEmpty() ? "" : " · front " + front) + (err == null ? "" : " · " + err));
            saveLog(ctx);
            finished.done(l, err, front);
        };
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
                log("Error: screen reading (Accessibility) was switched off");
                done.done(lines, "Screen reading was switched off.", seen[0]);
                return;
            }
            seen[0] = sr.frontPackage();
            switch (st[0]) {
                case 0: // wait for the app to be in front (splash screens, sign-in)
                    if (!pkg.equals(seen[0]) && st[1]++ < 8) {
                        log("Waiting for the app: in front is " + seen[0]);
                        main.postDelayed(step[0], 1500);
                        return;
                    }
                    log(pkg.equals(seen[0]) ? "App is in front" : "Gave up waiting: in front is " + seen[0]);
                    st[0] = 1;
                    st[1] = 0;
                    main.postDelayed(step[0], 2500);
                    return;
                case 1: { // go to the tab asked for: the rota (the one set, else "Schedule"…) or shift trades
                    boolean tapped = false;
                    if (tapFirst != null && !tapFirst.isEmpty()) {
                        tapped = sr.tapTab(tapFirst);
                        log("Tab ‘" + tapFirst + "’: " + (tapped ? "tapped " : "") + ScreenReader.lastTap);
                    }
                    // Shift trades never fall back to the rota: reading the rota as "trades" misleads.
                    String[] others = trades
                        ? new String[] { "Shift Trade", "Shift Trades", "Trades", "Trade", "Shift Swap", "Swaps", "Open Shifts", "Marketplace" }
                        : new String[] { "Schedule", "My schedule", "Rota", "My rota", "My shifts", "Shifts" };
                    if (!tapped)
                        for (String t : others)
                            if (sr.tapTab(t)) {
                                tapped = true;
                                log("Tab ‘" + t + "’: tapped " + ScreenReader.lastTap);
                                break;
                            }
                    if (!tapped) log("No tab found (try " + (st[1] + 1) + "): " + ScreenReader.lastTap);
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
                        log("Week view: tapped " + ScreenReader.lastTap);
                        main.postDelayed(step[0], 2000);
                        return;
                    }
                    log("Week view: not tapped (" + ScreenReader.lastTap + ")");
                    main.post(step[0]);
                    return;
                case 2: { // read this week: wait until it has loaded, then scroll down for the rest
                    Set<String> page = ScreenReader.newLines();
                    sr.collectApp(pkg, page);
                    // (An empty trades list never "looks loaded": wait less for it.)
                    if (st[2] == 0 && !AltonNativePlugin.looksLoaded(page) && st[1]++ < (trades ? 4 : 12)) {
                        log("Week " + (st[3] + 1) + ": not loaded yet (" + page.size() + " lines on screen), waiting");
                        main.postDelayed(step[0], 2000);
                        return;
                    }
                    int before = lines.size();
                    lines.addAll(page);
                    st[2]++;
                    log("Week " + (st[3] + 1) + " page " + st[2] + ": " + page.size() + " lines on screen, " + (lines.size() - before) + " new"
                        + (st[2] == 1 && !AltonNativePlugin.looksLoaded(page) ? " (never looked loaded)" : ""));
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
                    boolean next = sr.tapNextWeek(nextName);
                    log("Next week: " + (next ? "tapped " : "not found: ") + ScreenReader.lastTap);
                    if (!next) {
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
