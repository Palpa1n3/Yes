package com.alton.phone;

import android.Manifest;
import android.app.AlarmManager;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothClass;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.os.Build;
import android.app.AppOpsManager;
import android.app.PendingIntent;
import android.app.usage.UsageEvents;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.os.BatteryManager;
import android.os.Process;
import android.provider.Settings;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONObject;

/** Shared pieces for Alton's home-screen widgets: weather, battery, alarms, screen time, drawing. */
final class WidgetKit {

    static final String PREFS = "alton_widget";
    static final int ACCENT = Color.rgb(63, 208, 255);

    private WidgetKit() {}

    static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static void refreshAll(Context ctx) {
        try {
            AltonWidget.refresh(ctx);
            AltonWeatherWidget.refresh(ctx);
            AltonClockWidget.refresh(ctx);
            AltonScreenWidget.refresh(ctx);
        } catch (Exception ignored) {}
    }

    static PendingIntent openApp(Context ctx, String action, int code) {
        Intent i = new Intent(ctx, MainActivity.class);
        if (action != null) i.setAction(action);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(ctx, code, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static PendingIntent openIntent(Context ctx, Intent i, int code) {
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return PendingIntent.getActivity(ctx, code, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /* ── Weather (Open-Meteo, from the location the app last saved) ── */

    static String wmoText(int c) {
        if (c == 0) return "Clear";
        if (c <= 2) return "Partly cloudy";
        if (c == 3) return "Cloudy";
        if (c == 45 || c == 48) return "Fog";
        if (c >= 51 && c <= 57) return "Drizzle";
        if (c >= 61 && c <= 67) return "Rain";
        if ((c >= 71 && c <= 77) || c == 85 || c == 86) return "Snow";
        if (c >= 80 && c <= 82) return "Showers";
        if (c >= 95) return "Thunderstorms";
        return "Weather";
    }

    static String wmoIcon(int c, boolean day) {
        if (c == 0) return day ? "☀️" : "🌙";
        if (c <= 2) return day ? "🌤️" : "☁️";
        if (c == 3) return "☁️";
        if (c == 45 || c == 48) return "🌫️";
        if (c >= 95) return "⛈️";
        if ((c >= 71 && c <= 77) || c == 85 || c == 86) return "🌨️";
        if (c >= 51) return "🌧️";
        return "🌥️";
    }

    static boolean weatherStale(Context ctx) {
        return System.currentTimeMillis() - prefs(ctx).getLong("wxAt", 0) > 25 * 60_000L;
    }

    static JSONObject weather(Context ctx) {
        try {
            String s = prefs(ctx).getString("wx", null);
            return s == null ? null : new JSONObject(s);
        } catch (Exception e) {
            return null;
        }
    }

    /** Fetches the forecast on a background thread, then runs done (on that thread). */
    static void fetchWeather(final Context ctx, final Runnable done) {
        final SharedPreferences p = prefs(ctx);
        final float lat = p.getFloat("lat", 999f);
        final float lon = p.getFloat("lon", 999f);
        if (lat > 90f) {
            done.run();
            return;
        }
        new Thread(() -> {
            try {
                URL url = new URL(
                    "https://api.open-meteo.com/v1/forecast?latitude=" + lat + "&longitude=" + lon
                        + "&current=temperature_2m,weather_code,is_day"
                        + "&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=5"
                );
                HttpURLConnection c = (HttpURLConnection) url.openConnection();
                c.setConnectTimeout(8000);
                c.setReadTimeout(8000);
                StringBuilder sb = new StringBuilder();
                try (BufferedReader r = new BufferedReader(new InputStreamReader(c.getInputStream()))) {
                    String line;
                    while ((line = r.readLine()) != null) sb.append(line);
                }
                JSONObject j = new JSONObject(sb.toString());
                JSONObject cur = j.getJSONObject("current");
                JSONObject d = j.getJSONObject("daily");
                JSONArray time = d.getJSONArray("time");
                JSONArray code = d.getJSONArray("weather_code");
                JSONArray hi = d.getJSONArray("temperature_2m_max");
                JSONArray lo = d.getJSONArray("temperature_2m_min");
                SimpleDateFormat in = new SimpleDateFormat("yyyy-MM-dd", Locale.UK);
                SimpleDateFormat out = new SimpleDateFormat("EEE", Locale.UK);
                JSONArray days = new JSONArray();
                for (int i = 0; i < time.length(); i++) {
                    JSONObject o = new JSONObject();
                    o.put("d", out.format(in.parse(time.getString(i))));
                    o.put("c", code.getInt(i));
                    o.put("hi", Math.round(hi.getDouble(i)));
                    o.put("lo", Math.round(lo.getDouble(i)));
                    days.put(o);
                }
                JSONObject w = new JSONObject();
                w.put("temp", Math.round(cur.getDouble("temperature_2m")));
                w.put("code", cur.getInt("weather_code"));
                w.put("day", cur.getInt("is_day") == 1);
                w.put("days", days);
                p.edit().putString("wx", w.toString()).putLong("wxAt", System.currentTimeMillis()).apply();
            } catch (Exception ignored) {
                // keep the last forecast
            }
            done.run();
        }).start();
    }

    /* ── Battery and next alarm ── */

    static int battery(Context ctx) {
        Intent b = ctx.registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
        if (b == null) return -1;
        int level = b.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
        int scale = b.getIntExtra(BatteryManager.EXTRA_SCALE, 100);
        return level < 0 ? -1 : Math.round(level * 100f / Math.max(1, scale));
    }

    static boolean charging(Context ctx) {
        Intent b = ctx.registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
        if (b == null) return false;
        int st = b.getIntExtra(BatteryManager.EXTRA_STATUS, -1);
        return st == BatteryManager.BATTERY_STATUS_CHARGING || st == BatteryManager.BATTERY_STATUS_FULL;
    }

    static String nextAlarm(Context ctx) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null || am.getNextAlarmClock() == null) return "";
        long t = am.getNextAlarmClock().getTriggerTime();
        Calendar c = Calendar.getInstance();
        Calendar a = Calendar.getInstance();
        a.setTimeInMillis(t);
        boolean today = c.get(Calendar.DAY_OF_YEAR) == a.get(Calendar.DAY_OF_YEAR);
        return new SimpleDateFormat(today ? "HH:mm" : "EEE HH:mm", Locale.UK).format(a.getTime());
    }

    /* ── Connected Bluetooth devices' batteries (earbuds, headphones, watches…) ── */

    static final class Device {
        String name;
        int level;
        String icon;
    }

    static boolean bluetoothAllowed(Context ctx) {
        return Build.VERSION.SDK_INT < 31
            || ctx.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED;
    }

    /** Connected devices that report a battery level (most earbuds do; many watches don't). */
    static List<Device> devices(Context ctx) {
        List<Device> out = new ArrayList<>();
        if (!bluetoothAllowed(ctx)) return out;
        try {
            BluetoothManager bm = (BluetoothManager) ctx.getSystemService(Context.BLUETOOTH_SERVICE);
            BluetoothAdapter ad = bm == null ? null : bm.getAdapter();
            if (ad == null || !ad.isEnabled()) return out;
            for (BluetoothDevice d : ad.getBondedDevices()) {
                try {
                    Object conn = d.getClass().getMethod("isConnected").invoke(d);
                    if (!(conn instanceof Boolean) || !((Boolean) conn)) continue;
                    Object lvl = d.getClass().getMethod("getBatteryLevel").invoke(d);
                    int level = lvl instanceof Integer ? (Integer) lvl : -1;
                    if (level < 0) continue;
                    Device dv = new Device();
                    dv.name = d.getName() == null ? "Device" : d.getName();
                    dv.level = level;
                    BluetoothClass bc = d.getBluetoothClass();
                    int major = bc == null ? 0 : bc.getMajorDeviceClass();
                    dv.icon = major == BluetoothClass.Device.Major.AUDIO_VIDEO
                        ? "🎧"
                        : major == BluetoothClass.Device.Major.WEARABLE ? "⌚" : "🔵";
                    out.add(dv);
                    if (out.size() >= 3) break;
                } catch (Exception ignored) {}
            }
        } catch (SecurityException ignored) {}
        return out;
    }

    /** A row of battery rings: the phone first, then connected devices. */
    static Bitmap batteryRow(Context ctx, float density) {
        List<String> icons = new ArrayList<>();
        List<Integer> levels = new ArrayList<>();
        icons.add(charging(ctx) ? "⚡" : "📱");
        levels.add(battery(ctx));
        for (Device d : devices(ctx)) {
            icons.add(d.icon);
            levels.add(d.level);
        }
        int cell = Math.round(74 * density);
        int h = Math.round(84 * density);
        Bitmap b = Bitmap.createBitmap(cell * 4, h, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(b);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeWidth(5 * density);
        p.setStrokeCap(Paint.Cap.ROUND);
        Paint t = new Paint(Paint.ANTI_ALIAS_FLAG);
        t.setTextAlign(Paint.Align.CENTER);
        float r = 24 * density;
        for (int i = 0; i < 4; i++) {
            float cx = cell * i + cell / 2f;
            float cy = 30 * density;
            RectF rr = new RectF(cx - r, cy - r, cx + r, cy + r);
            p.setColor(Color.argb(80, 160, 190, 210));
            cv.drawArc(rr, 135, 270, false, p);
            if (i >= levels.size()) continue;
            int pct = levels.get(i);
            p.setColor(pct <= 15 ? Color.rgb(255, 77, 94) : pct <= 30 ? Color.rgb(255, 181, 71) : Color.rgb(61, 220, 132));
            if (pct > 0) cv.drawArc(rr, 135, 270 * Math.min(100, pct) / 100f, false, p);
            t.setTextSize(18 * density);
            cv.drawText(icons.get(i), cx, cy + 7 * density, t);
            t.setColor(Color.WHITE);
            t.setTextSize(13 * density);
            t.setFakeBoldText(true);
            cv.drawText(pct < 0 ? "–" : pct + "%", cx, h - 4 * density, t);
            t.setFakeBoldText(false);
        }
        return b;
    }

    /** Alton's holo avatar for the widget: glowing rings and ticks around a bright core. */
    static Bitmap avatar(float density) {
        int size = Math.round(96 * density);
        Bitmap b = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(b);
        float c = size / 2f;
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setStyle(Paint.Style.STROKE);
        p.setColor(ACCENT);
        int[] radii = { 44, 36, 28 };
        int[] alpha = { 90, 200, 130 };
        float[][] arcs = { { 0, 360 }, { -60, 250 }, { 40, 220 } };
        for (int i = 0; i < radii.length; i++) {
            float r = radii[i] * density;
            p.setAlpha(alpha[i]);
            p.setStrokeWidth((i == 1 ? 4 : 2) * density);
            cv.drawArc(new RectF(c - r, c - r, c + r, c + r), arcs[i][0], arcs[i][1], false, p);
        }
        p.setAlpha(160);
        p.setStrokeWidth(1.5f * density);
        for (int i = 0; i < 24; i++) {
            double a = Math.PI * 2 * i / 24;
            float r1 = 40 * density;
            float r2 = (i % 6 == 0 ? 34 : 37) * density;
            cv.drawLine(c + (float) Math.cos(a) * r1, c + (float) Math.sin(a) * r1, c + (float) Math.cos(a) * r2, c + (float) Math.sin(a) * r2, p);
        }
        Paint core = new Paint(Paint.ANTI_ALIAS_FLAG);
        core.setColor(ACCENT);
        core.setAlpha(60);
        cv.drawCircle(c, c, 18 * density, core);
        core.setAlpha(255);
        core.setColor(Color.rgb(220, 246, 255));
        cv.drawCircle(c, c, 8 * density, core);
        return b;
    }

    static String greeting(Context ctx) {
        int h = Calendar.getInstance().get(Calendar.HOUR_OF_DAY);
        String g = h < 5 ? "Good night" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
        String name = prefs(ctx).getString("user", "");
        return name.isEmpty() ? g : g + ", " + name;
    }

    /* ── Screen time (needs Usage access) ── */

    @SuppressWarnings("deprecation")
    static boolean usageAllowed(Context ctx) {
        AppOpsManager ops = (AppOpsManager) ctx.getSystemService(Context.APP_OPS_SERVICE);
        if (ops == null) return false;
        int mode = ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), ctx.getPackageName());
        return mode == AppOpsManager.MODE_ALLOWED;
    }

    static Intent usageSettings() {
        return new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS);
    }

    static final class ScreenTime {
        long total;
        final List<String> names = new ArrayList<>();
        final List<Long> times = new ArrayList<>();
    }

    @SuppressWarnings("deprecation")
    static ScreenTime screenTime(Context ctx) {
        ScreenTime st = new ScreenTime();
        UsageStatsManager usm = (UsageStatsManager) ctx.getSystemService(Context.USAGE_STATS_SERVICE);
        if (usm == null) return st;
        long now = System.currentTimeMillis();
        Calendar c = Calendar.getInstance();
        c.set(Calendar.HOUR_OF_DAY, 0);
        c.set(Calendar.MINUTE, 0);
        c.set(Calendar.SECOND, 0);
        c.set(Calendar.MILLISECOND, 0);
        PackageManager pm = ctx.getPackageManager();
        Set<String> skip = new HashSet<>();
        skip.add("com.android.systemui");
        Intent home = new Intent(Intent.ACTION_MAIN);
        home.addCategory(Intent.CATEGORY_HOME);
        for (ResolveInfo r : pm.queryIntentActivities(home, 0)) skip.add(r.activityInfo.packageName);
        final Map<String, Long> per = new HashMap<>();
        UsageEvents ev = usm.queryEvents(c.getTimeInMillis(), now);
        UsageEvents.Event e = new UsageEvents.Event();
        String current = null;
        long since = 0;
        while (ev.hasNextEvent()) {
            ev.getNextEvent(e);
            int t = e.getEventType();
            String p = e.getPackageName();
            if (t == UsageEvents.Event.MOVE_TO_FOREGROUND) {
                if (current != null) add(per, current, e.getTimeStamp() - since);
                current = p;
                since = e.getTimeStamp();
            } else if (t == UsageEvents.Event.MOVE_TO_BACKGROUND) {
                if (p.equals(current)) {
                    add(per, current, e.getTimeStamp() - since);
                    current = null;
                }
            } else if (t == 16) { // screen off
                if (current != null) add(per, current, e.getTimeStamp() - since);
                current = null;
            }
        }
        if (current != null) add(per, current, now - since);
        List<String> keys = new ArrayList<>();
        for (String k : per.keySet()) if (!skip.contains(k)) keys.add(k);
        Collections.sort(keys, (a, b) -> Long.compare(per.get(b), per.get(a)));
        for (String k : keys) st.total += per.get(k);
        for (int i = 0; i < Math.min(3, keys.size()); i++) {
            String k = keys.get(i);
            String label = k;
            try {
                label = pm.getApplicationLabel(pm.getApplicationInfo(k, 0)).toString();
            } catch (Exception ignored) {}
            st.names.add(label);
            st.times.add(per.get(k));
        }
        return st;
    }

    private static void add(Map<String, Long> m, String k, long ms) {
        if (ms <= 0 || ms > 12 * 3600_000L) return;
        Long v = m.get(k);
        m.put(k, (v == null ? 0 : v) + ms);
    }

    static String duration(long ms) {
        long m = ms / 60_000;
        if (m < 60) return m + " m";
        return (m / 60) + " h " + (m % 60) + " m";
    }

    /* ── Drawing ── */

    /** A ring with a percentage (battery). */
    static Bitmap ring(int pct, boolean charging, float density) {
        int size = Math.round(64 * density);
        Bitmap b = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(b);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeWidth(6 * density);
        p.setStrokeCap(Paint.Cap.ROUND);
        float pad = 5 * density;
        RectF r = new RectF(pad, pad, size - pad, size - pad);
        p.setColor(Color.argb(70, 160, 190, 210));
        cv.drawArc(r, 135, 270, false, p);
        int col = pct <= 15 ? Color.rgb(255, 77, 94) : pct <= 30 ? Color.rgb(255, 181, 71) : Color.rgb(61, 220, 132);
        p.setColor(col);
        if (pct > 0) cv.drawArc(r, 135, 270 * Math.min(100, pct) / 100f, false, p);
        Paint t = new Paint(Paint.ANTI_ALIAS_FLAG);
        t.setColor(Color.WHITE);
        t.setTextAlign(Paint.Align.CENTER);
        t.setTextSize(15 * density);
        t.setFakeBoldText(true);
        String label = pct < 0 ? "–" : (charging ? "⚡" : "") + pct;
        cv.drawText(label, size / 2f, size / 2f + 6 * density, t);
        return b;
    }

    /** A doughnut chart of shares (screen time). */
    static Bitmap donut(List<Long> parts, long total, float density) {
        int size = Math.round(72 * density);
        Bitmap b = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(b);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeWidth(12 * density);
        float pad = 8 * density;
        RectF r = new RectF(pad, pad, size - pad, size - pad);
        p.setColor(Color.argb(90, 130, 150, 170));
        cv.drawArc(r, 0, 360, false, p);
        int[] cols = { ACCENT, Color.rgb(46, 123, 255), Color.rgb(61, 220, 132) };
        float start = -90;
        for (int i = 0; i < parts.size() && total > 0; i++) {
            float sweep = 360f * parts.get(i) / total;
            p.setColor(cols[i % cols.length]);
            cv.drawArc(r, start, Math.max(1, sweep - 2), false, p);
            start += sweep;
        }
        return b;
    }
}
