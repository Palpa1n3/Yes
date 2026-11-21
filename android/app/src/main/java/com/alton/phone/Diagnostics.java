package com.alton.phone;

import android.app.ActivityManager;
import android.app.usage.StorageStats;
import android.app.usage.StorageStatsManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Environment;
import android.os.PowerManager;
import android.os.Process;
import android.os.StatFs;
import android.os.SystemClock;
import android.os.storage.StorageManager;
import android.provider.Settings;
import com.getcapacitor.JSObject;

/** A health check of the phone, for "why is my phone slow / hot / draining?". Read-only. */
final class Diagnostics {

    private Diagnostics() {}

    static JSObject collect(Context ctx) {
        JSObject r = new JSObject();
        r.put("device", Build.MANUFACTURER + " " + Build.MODEL);
        r.put("android", Build.VERSION.RELEASE + " (API " + Build.VERSION.SDK_INT + ")");
        r.put("uptimeHours", SystemClock.elapsedRealtime() / 3_600_000.0);

        // Battery
        Intent b = ctx.registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
        if (b != null) {
            JSObject bat = new JSObject();
            int level = b.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
            int scale = b.getIntExtra(BatteryManager.EXTRA_SCALE, 100);
            bat.put("percent", level < 0 ? -1 : Math.round(level * 100f / Math.max(1, scale)));
            bat.put("tempC", b.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, 0) / 10.0);
            bat.put("voltageMv", b.getIntExtra(BatteryManager.EXTRA_VOLTAGE, 0));
            int st = b.getIntExtra(BatteryManager.EXTRA_STATUS, -1);
            bat.put("charging", st == BatteryManager.BATTERY_STATUS_CHARGING || st == BatteryManager.BATTERY_STATUS_FULL);
            int h = b.getIntExtra(BatteryManager.EXTRA_HEALTH, 0);
            bat.put(
                "health",
                h == BatteryManager.BATTERY_HEALTH_GOOD ? "good"
                    : h == BatteryManager.BATTERY_HEALTH_OVERHEAT ? "overheating"
                    : h == BatteryManager.BATTERY_HEALTH_DEAD ? "worn out"
                    : h == BatteryManager.BATTERY_HEALTH_OVER_VOLTAGE ? "over voltage"
                    : h == BatteryManager.BATTERY_HEALTH_COLD ? "cold"
                    : "unknown"
            );
            int cycles = b.getIntExtra("android.os.extra.CYCLE_COUNT", -1);
            if (cycles >= 0) bat.put("cycles", cycles);
            r.put("battery", bat);
        }

        // Memory
        ActivityManager am = (ActivityManager) ctx.getSystemService(Context.ACTIVITY_SERVICE);
        if (am != null) {
            ActivityManager.MemoryInfo mi = new ActivityManager.MemoryInfo();
            am.getMemoryInfo(mi);
            JSObject mem = new JSObject();
            mem.put("totalGb", mi.totalMem / 1e9);
            mem.put("freeGb", mi.availMem / 1e9);
            mem.put("low", mi.lowMemory);
            r.put("memory", mem);
        }

        // Storage
        try {
            StatFs fs = new StatFs(Environment.getDataDirectory().getPath());
            JSObject sto = new JSObject();
            sto.put("totalGb", fs.getTotalBytes() / 1e9);
            sto.put("freeGb", fs.getAvailableBytes() / 1e9);
            r.put("storage", sto);
        } catch (Exception ignored) {}

        // Power saving and heat
        PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
        if (pm != null) {
            r.put("powerSaving", pm.isPowerSaveMode());
            if (Build.VERSION.SDK_INT >= 29) {
                int t = pm.getCurrentThermalStatus();
                r.put(
                    "thermal",
                    t == PowerManager.THERMAL_STATUS_NONE ? "normal"
                        : t == PowerManager.THERMAL_STATUS_LIGHT ? "warm"
                        : t == PowerManager.THERMAL_STATUS_MODERATE ? "hot (slowing down a little)"
                        : "very hot (slowing down a lot)"
                );
            }
        }

        // Network
        try {
            ConnectivityManager cm = (ConnectivityManager) ctx.getSystemService(Context.CONNECTIVITY_SERVICE);
            Network n = cm == null ? null : cm.getActiveNetwork();
            NetworkCapabilities c = n == null ? null : cm.getNetworkCapabilities(n);
            JSObject net = new JSObject();
            if (c == null) net.put("type", "offline");
            else {
                net.put("type", c.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ? "wifi" : c.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) ? "mobile data" : "other");
                net.put("internet", c.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED));
                net.put("downMbps", c.getLinkDownstreamBandwidthKbps() / 1000.0);
            }
            r.put("network", net);
        } catch (Exception ignored) {}

        // Animation speed (slow animations make everything, the keyboard included, feel slow)
        try {
            r.put("animationScale", Settings.Global.getFloat(ctx.getContentResolver(), Settings.Global.ANIMATOR_DURATION_SCALE, 1f));
        } catch (Exception ignored) {}

        // The keyboard app
        try {
            String ime = Settings.Secure.getString(ctx.getContentResolver(), Settings.Secure.DEFAULT_INPUT_METHOD);
            ComponentName cn = ime == null ? null : ComponentName.unflattenFromString(ime);
            if (cn != null) {
                PackageManager pmg = ctx.getPackageManager();
                JSObject k = new JSObject();
                String pkg = cn.getPackageName();
                k.put("package", pkg);
                PackageInfo pi = pmg.getPackageInfo(pkg, 0);
                k.put("name", pmg.getApplicationLabel(pi.applicationInfo).toString());
                k.put("version", pi.versionName == null ? "" : pi.versionName);
                k.put("updated", pi.lastUpdateTime);
                if (Build.VERSION.SDK_INT >= 26 && WidgetKit.usageAllowed(ctx)) {
                    StorageStatsManager ssm = (StorageStatsManager) ctx.getSystemService(Context.STORAGE_STATS_SERVICE);
                    StorageStats ss = ssm.queryStatsForPackage(StorageManager.UUID_DEFAULT, pkg, Process.myUserHandle());
                    k.put("cacheMb", ss.getCacheBytes() / 1e6);
                    k.put("dataMb", ss.getDataBytes() / 1e6);
                }
                r.put("keyboard", k);
            }
        } catch (Exception ignored) {}

        // Most-used apps today (needs Usage access)
        if (WidgetKit.usageAllowed(ctx)) {
            WidgetKit.ScreenTime st = WidgetKit.screenTime(ctx);
            r.put("screenTimeToday", WidgetKit.duration(st.total));
            StringBuilder top = new StringBuilder();
            for (int i = 0; i < st.names.size(); i++)
                top.append(i > 0 ? ", " : "").append(st.names.get(i)).append(" ").append(WidgetKit.duration(st.times.get(i)));
            r.put("topApps", top.toString());
        }
        return r;
    }
}
