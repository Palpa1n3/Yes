package com.alton.phone;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.widget.RemoteViews;

/** Battery of the phone and connected earbuds / watch. Narrow: 2 rings, wider: 3, full width: 4. */
public class AltonBatteryWidget extends AppWidgetProvider {

    private static final int[] CELLS = { 2, 3, 4 };
    private static final int[][] SIZES = { { 0, 0 }, { 170, 0 }, { 230, 0 } };

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
        for (int id : mgr.getAppWidgetIds(new ComponentName(ctx, AltonBatteryWidget.class))) render(ctx, mgr, id);
    }

    private static void render(final Context ctx, AppWidgetManager mgr, int id) {
        final float density = ctx.getResources().getDisplayMetrics().density;
        mgr.updateAppWidget(id, WidgetKit.sized(ctx, mgr, id, SIZES, i -> {
            RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_battery);
            v.setImageViewBitmap(R.id.bt_rings, WidgetKit.batteryRow(ctx, density, CELLS[i]));
            // Like the battery widget it replaces: tapping opens battery settings.
            v.setOnClickPendingIntent(R.id.bt_rings, WidgetKit.openIntent(ctx, new Intent(Intent.ACTION_POWER_USAGE_SUMMARY), 22));
            return v;
        }));
    }
}
