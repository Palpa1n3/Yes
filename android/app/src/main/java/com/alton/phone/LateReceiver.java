package com.alton.phone;

import android.Manifest;
import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.telephony.SmsManager;
import java.util.ArrayList;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * The leave-by heads-up with a "Running late" button. The app schedules each one here (an
 * alarm at the time), this receiver posts the notification, and tapping the button sends the
 * saved text by SMS straight away, without opening Alton (the tap is the user's go-ahead).
 * Settings live in this app's private storage only.
 */
public class LateReceiver extends BroadcastReceiver {

    static final String SHOW = "com.alton.phone.LATE_SHOW";
    static final String SEND = "com.alton.phone.LATE_SEND";
    private static final String PREFS = "alton_late";
    private static final String CHANNEL = "alton_leave";

    static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static PendingIntent alarmIntent(Context ctx, int id, String title, String body, boolean late, boolean msgs) {
        Intent i = new Intent(ctx, LateReceiver.class).setAction(SHOW).putExtra("id", id);
        if (title != null) i.putExtra("title", title).putExtra("body", body).putExtra("late", late).putExtra("msgs", msgs);
        return PendingIntent.getBroadcast(ctx, id, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** Replace the scheduled leave-by heads-ups (an empty list clears them). */
    static void schedule(Context ctx, JSONArray items, String to, String text, String name) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        SharedPreferences p = prefs(ctx);
        try {
            JSONArray old = new JSONArray(p.getString("ids", "[]"));
            for (int i = 0; i < old.length(); i++)
                if (am != null) am.cancel(alarmIntent(ctx, old.getInt(i), null, null, false, false));
        } catch (Exception ignored) {}
        JSONArray ids = new JSONArray();
        for (int i = 0; i < items.length(); i++) {
            JSONObject o = items.optJSONObject(i);
            if (o == null || am == null) continue;
            long at = o.optLong("at");
            if (at <= System.currentTimeMillis()) continue;
            int id = o.optInt("id");
            PendingIntent pi = alarmIntent(ctx, id, o.optString("title"), o.optString("body"),
                o.optBoolean("late", true), o.optBoolean("msgs", false));
            try {
                if (Build.VERSION.SDK_INT >= 31 && !am.canScheduleExactAlarms())
                    am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
                else am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
                ids.put(id);
            } catch (SecurityException e) {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
                ids.put(id);
            }
        }
        p.edit()
            .putString("ids", ids.toString())
            .putString("to", to == null ? "" : to)
            .putString("text", text == null ? "" : text)
            .putString("name", name == null ? "" : name)
            .apply();
    }

    @Override
    public void onReceive(Context ctx, Intent intent) {
        String action = intent.getAction();
        int id = intent.getIntExtra("id", 7400);
        if (SHOW.equals(action)) {
            String body = intent.getStringExtra("body");
            // End of shift: add the messages that came in during it.
            if (intent.getBooleanExtra("msgs", false)) {
                String m = MessageListener.summaryLine(System.currentTimeMillis() - 12 * 3_600_000L);
                if (!m.isEmpty()) body = (body == null || body.isEmpty() || body.startsWith("Nothing else") ? "" : body + "\n") + m;
            }
            show(ctx, id, intent.getStringExtra("title"), body, intent.getBooleanExtra("late", true));
        }
        else if (SEND.equals(action)) send(ctx, id);
    }

    private static Notification.Builder builder(Context ctx) {
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26 && nm != null)
            nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Time to leave", NotificationManager.IMPORTANCE_HIGH));
        Intent open = new Intent(ctx, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        PendingIntent pi = PendingIntent.getActivity(ctx, 7401, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(ctx, CHANNEL) : new Notification.Builder(ctx);
        return b.setSmallIcon(ctx.getApplicationInfo().icon).setContentIntent(pi).setAutoCancel(true);
    }

    private static void show(Context ctx, int id, String title, String body, boolean late) {
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        Notification.Builder b = builder(ctx)
            .setContentTitle(title == null ? "Time to leave" : title)
            .setContentText(body == null ? "" : body.split("\n")[0])
            .setStyle(new Notification.BigTextStyle().bigText(body == null ? "" : body));
        SharedPreferences p = prefs(ctx);
        if (late && !p.getString("to", "").isEmpty()) {
            Intent send = new Intent(ctx, LateReceiver.class).setAction(SEND).putExtra("id", id);
            PendingIntent sp = PendingIntent.getBroadcast(ctx, id + 1, send, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            b.addAction(new Notification.Action.Builder(null, "Running late", sp).build());
        }
        try {
            nm.notify(id, b.build());
        } catch (SecurityException ignored) {}
    }

    @SuppressWarnings("deprecation")
    private static void send(Context ctx, int id) {
        SharedPreferences p = prefs(ctx);
        String to = p.getString("to", "");
        String text = p.getString("text", "");
        String name = p.getString("name", to);
        String result;
        if (to.isEmpty() || text.isEmpty()) result = "No number or message saved for Running late.";
        else if (ctx.checkSelfPermission(Manifest.permission.SEND_SMS) != PackageManager.PERMISSION_GRANTED)
            result = "Couldn't send: allow Alton to send texts (open Alton once and send a text).";
        else {
            try {
                SmsManager sm = Build.VERSION.SDK_INT >= 31 ? ctx.getSystemService(SmsManager.class) : SmsManager.getDefault();
                ArrayList<String> parts = sm.divideMessage(text);
                sm.sendMultipartTextMessage(to, null, parts, null, null);
                result = "Sent to " + name + ": " + text;
            } catch (Exception e) {
                result = "The text couldn't be sent.";
            }
        }
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        try {
            nm.notify(id, builder(ctx).setContentTitle(result.startsWith("Sent") ? "✓ " + result : result).build());
        } catch (SecurityException ignored) {}
    }
}
