package com.alton.phone;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.os.Bundle;
import android.widget.RemoteViews;
import java.util.Calendar;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * The weather on its own, changing with its size. Small: icon + temperature. Wide and short:
 * plus the outlook. Tall: plus where you are. Big: plus the next 4 days. Refreshes itself.
 */
public class AltonWeatherWidget extends AppWidgetProvider {

    private static final int[] DAY = { R.id.wx_d0, R.id.wx_d1, R.id.wx_d2, R.id.wx_d3 };
    private static final int[] ICON = { R.id.wx_i0, R.id.wx_i1, R.id.wx_i2, R.id.wx_i3 };
    private static final int[] TEMP = { R.id.wx_t0, R.id.wx_t1, R.id.wx_t2, R.id.wx_t3 };
    private static final int[] LAYOUTS = {
        R.layout.widget_weather_s, R.layout.widget_weather_w, R.layout.widget_weather_m, R.layout.widget_weather,
    };
    private static final int[][] SIZES = { { 0, 0 }, { 200, 40 }, { 110, 140 }, { 250, 140 } };

    @Override
    public void onUpdate(final Context ctx, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) render(ctx, mgr, id);
        if (WidgetKit.weatherStale(ctx)) {
            final PendingResult pr = goAsync();
            WidgetKit.fetchWeather(ctx, () -> {
                WidgetKit.refreshAll(ctx);
                pr.finish();
            });
        }
    }

    @Override
    public void onAppWidgetOptionsChanged(Context ctx, AppWidgetManager mgr, int id, Bundle opts) {
        render(ctx, mgr, id);
    }

    static void refresh(Context ctx) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        for (int id : mgr.getAppWidgetIds(new ComponentName(ctx, AltonWeatherWidget.class))) render(ctx, mgr, id);
    }

    private static void render(final Context ctx, AppWidgetManager mgr, int id) {
        mgr.updateAppWidget(id, WidgetKit.sized(ctx, mgr, id, SIZES, i -> look(ctx, LAYOUTS[i])));
    }

    /** One look, filled in. Views a smaller look doesn't have are simply skipped. */
    private static RemoteViews look(Context ctx, int layout) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), layout);
        v.setOnClickPendingIntent(R.id.wx_root, WidgetKit.weatherTap(ctx, 11));
        JSONObject w = WidgetKit.weather(ctx);
        String place = WidgetKit.prefs(ctx).getString("place", "");
        v.setTextViewText(R.id.wx_place, place.isEmpty() ? "" : "📍 " + place);
        if (w == null) {
            v.setTextViewText(R.id.wx_icon, "🌥️");
            v.setTextViewText(R.id.wx_temp, "–");
            v.setTextViewText(R.id.wx_line, "Open Alton once (with location on) to start the weather");
            return v;
        }
        try {
            boolean day = w.optBoolean("day", true);
            v.setTextViewText(R.id.wx_icon, WidgetKit.wmoIcon(w.optInt("code"), day));
            v.setTextViewText(R.id.wx_temp, w.optInt("temp") + "°");
            JSONArray days = w.optJSONArray("days");
            if (days != null && days.length() > 0) {
                boolean evening = Calendar.getInstance().get(Calendar.HOUR_OF_DAY) >= 17 && days.length() > 1;
                JSONObject o = days.getJSONObject(evening ? 1 : 0);
                v.setTextViewText(
                    R.id.wx_line,
                    WidgetKit.wmoText(o.optInt("c")) + (evening ? " tomorrow" : " today") + ". High of " + o.optInt("hi") + "°"
                );
                for (int i = 0; i < 4; i++) {
                    if (i >= days.length()) break;
                    JSONObject d = days.getJSONObject(i);
                    v.setTextViewText(DAY[i], d.optString("d"));
                    v.setTextViewText(ICON[i], WidgetKit.wmoIcon(d.optInt("c"), true) + " " + WidgetKit.wmoIcon(d.optInt("c"), false));
                    v.setTextViewText(TEMP[i], d.optInt("hi") + "° " + d.optInt("lo") + "°");
                }
            }
        } catch (Exception ignored) {}
        return v;
    }
}
