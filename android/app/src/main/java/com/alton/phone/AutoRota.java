package com.alton.phone;

import android.app.KeyguardManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ResolveInfo;
import android.media.AudioManager;
import android.os.BatteryManager;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;

/**
 * Reads the shift app by itself while the phone charges, so the user never has to watch it:
 * after the charger goes in, once the phone has been left on the home screen (unlocked, nothing
 * playing, untouched for 15 s), it reads the rota and hands the text to Alton. At most once a
 * day, or sooner if the shift app has posted a notification (e.g. a new rota).
 */
final class AutoRota {

    private static final String PREFS = "alton_autorota";
    private static final Handler main = new Handler(Looper.getMainLooper());
    static volatile boolean running = false;

    private AutoRota() {}

    static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** The shift app posted something: read it again on the next charge. */
    static void notePosted(Context ctx, String pkg) {
        SharedPreferences p = prefs(ctx);
        if (pkg != null && pkg.equals(p.getString("pkg", ""))) p.edit().putBoolean("fresh", true).apply();
    }

    static void onPowerConnected(final Context ctx) {
        SharedPreferences p = prefs(ctx);
        if (!p.getBoolean("on", false) || p.getString("pkg", "").isEmpty() || running) return;
        boolean due = p.getBoolean("fresh", false) || System.currentTimeMillis() - p.getLong("last", 0) > 20 * 3600_000L;
        if (!due) return;
        final int[] tries = { 0 };
        final Runnable[] check = new Runnable[1];
        check[0] = () -> {
            String why = blocker(ctx);
            if (why == null) {
                start(ctx);
                return;
            }
            // Screen off or locked: wait for the next charge. Otherwise keep waiting a little.
            if (!"busy".equals(why) || tries[0]++ >= 8) return;
            main.postDelayed(check[0], 15_000);
        };
        main.postDelayed(check[0], 20_000);
    }

    /** Null when it's a good moment; "off" (screen off/locked/unplugged) or "busy" (in use). */
    private static String blocker(Context ctx) {
        PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
        KeyguardManager km = (KeyguardManager) ctx.getSystemService(Context.KEYGUARD_SERVICE);
        BatteryManager bm = (BatteryManager) ctx.getSystemService(Context.BATTERY_SERVICE);
        if (pm == null || !pm.isInteractive()) return "off";
        if (km != null && km.isKeyguardLocked()) return "off";
        if (bm != null && !bm.isCharging() && !WidgetKit.charging(ctx)) return "off";
        ScreenReader sr = ScreenReader.get();
        if (sr == null) return "off";
        AudioManager am = (AudioManager) ctx.getSystemService(Context.AUDIO_SERVICE);
        if (am != null && (am.isMusicActive() || am.getMode() != AudioManager.MODE_NORMAL)) return "busy";
        String front = sr.frontPackage();
        if (!front.equals(home(ctx)) && !front.equals(ctx.getPackageName())) return "busy";
        if (System.currentTimeMillis() - ScreenReader.lastActivity < 15_000) return "busy";
        return null;
    }

    private static String home(Context ctx) {
        Intent h = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME);
        ResolveInfo ri = ctx.getPackageManager().resolveActivity(h, 0);
        return ri != null && ri.activityInfo != null ? ri.activityInfo.packageName : "";
    }

    @SuppressWarnings("deprecation")
    private static void start(final Context ctx) {
        final SharedPreferences p = prefs(ctx);
        String pkg = p.getString("pkg", "");
        Intent launch = ctx.getPackageManager().getLaunchIntentForPackage(pkg);
        if (launch == null) return;
        running = true;
        // Keep the screen on while it reads (the phone was left alone, so it would time out).
        PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
        final PowerManager.WakeLock wl = pm == null
            ? null
            : pm.newWakeLock(PowerManager.SCREEN_BRIGHT_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP, "alton:rota");
        if (wl != null) wl.acquire(150_000);
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        ctx.startActivity(launch);
        AppReader.run(ctx, pkg, p.getString("tap", ""), p.getString("next", ""), p.getInt("weeks", 2), (lines, err, front) -> {
            running = false;
            if (wl != null && wl.isHeld()) wl.release();
            StringBuilder sb = new StringBuilder();
            for (String s : lines) sb.append(s).append('\n');
            SharedPreferences.Editor e = p.edit().putLong("last", System.currentTimeMillis()).putBoolean("fresh", false);
            if (sb.length() > 0 && pkg.equals(front)) e.putString("text", sb.toString()).putLong("at", System.currentTimeMillis());
            e.apply();
            // Back to Alton, which adds the shifts.
            Intent back = new Intent(ctx, MainActivity.class);
            back.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
            try {
                ctx.startActivity(back);
            } catch (Exception ignored) {}
        });
    }
}
