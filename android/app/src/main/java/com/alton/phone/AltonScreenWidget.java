package com.alton.phone;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.graphics.Color;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.style.ForegroundColorSpan;
import android.widget.RemoteViews;

/** Today's screen time, the top three apps, and a ring chart (needs Usage access). */
public class AltonScreenWidget extends AppWidgetProvider {

    private static final int[] LINES = { R.id.st_a0, R.id.st_a1, R.id.st_a2 };
    private static final int[] COLS = { WidgetKit.ACCENT, Color.rgb(46, 123, 255), Color.rgb(61, 220, 132) };

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) render(ctx, mgr, id);
    }

    static void refresh(Context ctx) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        for (int id : mgr.getAppWidgetIds(new ComponentName(ctx, AltonScreenWidget.class))) render(ctx, mgr, id);
    }

    private static void render(Context ctx, AppWidgetManager mgr, int id) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_screen);
        if (!WidgetKit.usageAllowed(ctx)) {
            v.setTextViewText(R.id.st_total, "Tap to allow");
            v.setTextViewText(R.id.st_a0, "Turn on Usage access");
            v.setTextViewText(R.id.st_a1, "for Alton");
            v.setTextViewText(R.id.st_a2, "");
            v.setOnClickPendingIntent(R.id.st_root, WidgetKit.openIntent(ctx, WidgetKit.usageSettings(), 31));
            mgr.updateAppWidget(id, v);
            return;
        }
        WidgetKit.ScreenTime st = WidgetKit.screenTime(ctx);
        v.setTextViewText(R.id.st_total, WidgetKit.duration(st.total));
        for (int i = 0; i < 3; i++) {
            if (i < st.names.size()) {
                SpannableString s = new SpannableString("▍ " + st.names.get(i));
                s.setSpan(new ForegroundColorSpan(COLS[i]), 0, 1, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
                v.setTextViewText(LINES[i], s);
            } else v.setTextViewText(LINES[i], "");
        }
        float density = ctx.getResources().getDisplayMetrics().density;
        v.setImageViewBitmap(R.id.st_chart, WidgetKit.donut(st.times, st.total, density));
        v.setOnClickPendingIntent(R.id.st_root, WidgetKit.wellbeingTap(ctx, 32));
        mgr.updateAppWidget(id, v);
    }
}
