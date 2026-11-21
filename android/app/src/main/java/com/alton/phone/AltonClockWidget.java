package com.alton.phone;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.provider.AlarmClock;
import android.widget.RemoteViews;

/** The date and time on its own. Small: just the time. Medium: date + time. Big: date + time with seconds. */
public class AltonClockWidget extends AppWidgetProvider {

    private static final int[] LAYOUTS = { R.layout.widget_clock_s, R.layout.widget_clock_m, R.layout.widget_clock };
    private static final int[][] SIZES = { { 0, 0 }, { 140, 90 }, { 240, 130 } };

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) render(ctx, mgr, id);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context ctx, AppWidgetManager mgr, int id, Bundle opts) {
        render(ctx, mgr, id);
    }

    static void refresh(Context ctx) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        for (int id : mgr.getAppWidgetIds(new ComponentName(ctx, AltonClockWidget.class))) render(ctx, mgr, id);
    }

    private static void render(final Context ctx, AppWidgetManager mgr, int id) {
        mgr.updateAppWidget(id, WidgetKit.sized(ctx, mgr, id, SIZES, i -> {
            RemoteViews v = new RemoteViews(ctx.getPackageName(), LAYOUTS[i]);
            // Like the clock it replaces: tapping it opens your alarms.
            v.setOnClickPendingIntent(R.id.ck_clock, WidgetKit.openIntent(ctx, new Intent(AlarmClock.ACTION_SHOW_ALARMS), 21));
            return v;
        }));
    }
}
