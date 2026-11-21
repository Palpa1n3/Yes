package com.alton.phone;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.provider.AlarmClock;
import android.widget.RemoteViews;

/** Date and a big clock, with the phone's battery ring, the weather, next shift and next alarm. */
public class AltonClockWidget extends AppWidgetProvider {

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) render(ctx, mgr, id);
    }

    static void refresh(Context ctx) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        for (int id : mgr.getAppWidgetIds(new ComponentName(ctx, AltonClockWidget.class))) render(ctx, mgr, id);
    }

    private static void render(Context ctx, AppWidgetManager mgr, int id) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_clock);
        float density = ctx.getResources().getDisplayMetrics().density;
        v.setImageViewBitmap(R.id.ck_rings, WidgetKit.batteryRow(ctx, density));
        String alarm = WidgetKit.nextAlarm(ctx);
        v.setTextViewText(R.id.ck_alarm, alarm.isEmpty() ? "" : "⏰ " + alarm);
        v.setOnClickPendingIntent(R.id.ck_time, WidgetKit.openIntent(ctx, new Intent(AlarmClock.ACTION_SHOW_ALARMS), 21));
        v.setOnClickPendingIntent(R.id.ck_rings, WidgetKit.openApp(ctx, null, 22));
        mgr.updateAppWidget(id, v);
    }
}
