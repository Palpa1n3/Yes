package com.alton.phone;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.widget.RemoteViews;
import java.util.Calendar;
import org.json.JSONArray;
import org.json.JSONObject;

/** Weather now, a one-line outlook, where you are, and the next 4 days. Refreshes itself. */
public class AltonWeatherWidget extends AppWidgetProvider {

    private static final int[] DAY = { R.id.wx_d0, R.id.wx_d1, R.id.wx_d2, R.id.wx_d3 };
    private static final int[] ICON = { R.id.wx_i0, R.id.wx_i1, R.id.wx_i2, R.id.wx_i3 };
    private static final int[] TEMP = { R.id.wx_t0, R.id.wx_t1, R.id.wx_t2, R.id.wx_t3 };

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

    static void refresh(Context ctx) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        for (int id : mgr.getAppWidgetIds(new ComponentName(ctx, AltonWeatherWidget.class))) render(ctx, mgr, id);
    }

    private static void render(Context ctx, AppWidgetManager mgr, int id) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_weather);
        v.setOnClickPendingIntent(R.id.wx_root, WidgetKit.openApp(ctx, null, 11));
        JSONObject w = WidgetKit.weather(ctx);
        String place = WidgetKit.prefs(ctx).getString("place", "");
        v.setTextViewText(R.id.wx_place, place.isEmpty() ? "" : "📍 " + place);
        if (w == null) {
            v.setTextViewText(R.id.wx_icon, "🌥️");
            v.setTextViewText(R.id.wx_temp, "–");
            v.setTextViewText(R.id.wx_line, "Open Alton once (with location on) to start the weather");
            mgr.updateAppWidget(id, v);
            return;
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
                    v.setTextViewText(ICON[i], WidgetKit.wmoIcon(d.optInt("c"), true));
                    v.setTextViewText(TEMP[i], d.optInt("hi") + "°  " + d.optInt("lo") + "°");
                }
            }
        } catch (Exception ignored) {}
        screen(ctx, v);
        mgr.updateAppWidget(id, v);
    }

    /** The screen-time strip under the weather. */
    private static void screen(Context ctx, RemoteViews v) {
        if (!WidgetKit.usageAllowed(ctx)) {
            v.setTextViewText(R.id.ws_total, "Screen time");
            v.setTextViewText(R.id.ws_apps, "Tap here to allow Usage access");
            v.setOnClickPendingIntent(R.id.ws_strip, WidgetKit.openIntent(ctx, WidgetKit.usageSettings(), 13));
            return;
        }
        WidgetKit.ScreenTime st = WidgetKit.screenTime(ctx);
        v.setTextViewText(R.id.ws_total, WidgetKit.duration(st.total));
        int[] cols = { WidgetKit.ACCENT, android.graphics.Color.rgb(46, 123, 255), android.graphics.Color.rgb(61, 220, 132) };
        android.text.SpannableStringBuilder sb = new android.text.SpannableStringBuilder();
        for (int i = 0; i < st.names.size(); i++) {
            int at = sb.length();
            sb.append("▍");
            sb.setSpan(new android.text.style.ForegroundColorSpan(cols[i]), at, at + 1, android.text.Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
            sb.append(" ").append(st.names.get(i)).append(i < st.names.size() - 1 ? "   " : "");
        }
        v.setTextViewText(R.id.ws_apps, sb);
        float density = ctx.getResources().getDisplayMetrics().density;
        v.setImageViewBitmap(R.id.ws_chart, WidgetKit.donut(st.times, st.total, density));
        v.setOnClickPendingIntent(R.id.ws_strip, WidgetKit.openApp(ctx, null, 14));
    }
}
