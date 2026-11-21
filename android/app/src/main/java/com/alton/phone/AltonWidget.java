package com.alton.phone;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;

/** Alton's home-screen widget: next shift, weather, next reminder, and Talk / Drive buttons. */
public class AltonWidget extends AppWidgetProvider {

    static final String PREFS = "alton_widget";
    static final String TALK = "com.alton.phone.TALK";
    static final String DRIVE = "com.alton.phone.DRIVE";

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) render(ctx, mgr, id);
    }

    /** Called by the app whenever what it shows changes. */
    public static void refresh(Context ctx) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, AltonWidget.class));
        for (int id : ids) render(ctx, mgr, id);
    }

    private static PendingIntent open(Context ctx, String action, int code) {
        Intent i = new Intent(ctx, MainActivity.class);
        if (action != null) i.setAction(action);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(ctx, code, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static void render(Context ctx, AppWidgetManager mgr, int id) {
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.alton_widget);
        v.setTextViewText(R.id.w_title, p.getString("title", "ALTON"));
        v.setTextViewText(R.id.w_line1, p.getString("line1", "Open Alton once to fill this in"));
        v.setTextViewText(R.id.w_line2, p.getString("line2", ""));
        v.setTextViewText(R.id.w_line3, p.getString("line3", ""));
        v.setOnClickPendingIntent(R.id.w_root, open(ctx, null, 1));
        v.setOnClickPendingIntent(R.id.w_talk, open(ctx, TALK, 2));
        v.setOnClickPendingIntent(R.id.w_drive, open(ctx, DRIVE, 3));
        mgr.updateAppWidget(id, v);
    }
}
