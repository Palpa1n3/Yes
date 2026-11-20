package com.alton.phone;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.database.Cursor;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.provider.AlarmClock;
import android.provider.CalendarContract;
import android.provider.ContactsContract;
import android.provider.Settings;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.Collections;
import java.util.List;
import java.util.Set;
import java.util.TimeZone;
import org.json.JSONObject;

/** Alton's phone powers: messages, alarms, calendar, contacts and reading the shift app. */
@CapacitorPlugin(
    name = "AltonNative",
    permissions = {
        @Permission(alias = "calendar", strings = { Manifest.permission.READ_CALENDAR, Manifest.permission.WRITE_CALENDAR }),
        @Permission(alias = "contacts", strings = { Manifest.permission.READ_CONTACTS }),
    }
)
public class AltonNativePlugin extends Plugin {

    private final Handler main = new Handler(Looper.getMainLooper());

    private static long num(PluginCall call, String key) {
        Object v = call.getData().opt(key);
        return v instanceof Number ? ((Number) v).longValue() : 0L;
    }

    /* ── What's switched on ── */

    @PluginMethod
    public void status(PluginCall call) {
        JSObject r = new JSObject();
        r.put("messages", MessageListener.isEnabled(getContext()));
        r.put("screenReader", ScreenReader.isEnabled(getContext()));
        r.put("calendar", getPermissionState("calendar") == PermissionState.GRANTED);
        r.put("contacts", getPermissionState("contacts") == PermissionState.GRANTED);
        call.resolve(r);
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        String which = call.getString("which", "app");
        Intent i;
        if ("messages".equals(which)) i = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
        else if ("screenReader".equals(which)) i = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
        else i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getContext().getPackageName()));
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject("Couldn't open that settings page.");
        }
    }

    @PluginMethod
    public void requestAccess(PluginCall call) {
        String alias = call.getString("which", "calendar");
        if (!"calendar".equals(alias) && !"contacts".equals(alias)) {
            call.reject("Unknown permission");
            return;
        }
        if (getPermissionState(alias) == PermissionState.GRANTED) {
            call.resolve(new JSObject().put("granted", true));
            return;
        }
        requestPermissionForAlias(alias, call, "accessCallback");
    }

    @PermissionCallback
    private void accessCallback(PluginCall call) {
        String alias = call.getString("which", "calendar");
        call.resolve(new JSObject().put("granted", getPermissionState(alias) == PermissionState.GRANTED));
    }

    /* ── Messages (needs Notification access) ── */

    @PluginMethod
    public void getMessages(PluginCall call) {
        if (!MessageListener.isEnabled(getContext())) {
            call.reject("Notification access is off.");
            return;
        }
        call.resolve(new JSObject().put("messages", MessageListener.recentMessages()));
    }

    @PluginMethod
    public void replyMessage(PluginCall call) {
        String id = call.getString("id");
        String text = call.getString("text");
        if (id == null || text == null || text.trim().isEmpty()) {
            call.reject("Nothing to send.");
            return;
        }
        String err = MessageListener.reply(getContext(), id, text.trim());
        if (err == null) call.resolve();
        else call.reject(err);
    }

    /* ── Alarms: set (or switch on) a Clock alarm without opening the Clock app ── */

    @PluginMethod
    public void setAlarm(PluginCall call) {
        Integer hour = call.getInt("hour");
        Integer minute = call.getInt("minute");
        if (hour == null || minute == null) {
            call.reject("Missing time");
            return;
        }
        Intent i = new Intent(AlarmClock.ACTION_SET_ALARM);
        i.putExtra(AlarmClock.EXTRA_HOUR, hour);
        i.putExtra(AlarmClock.EXTRA_MINUTES, minute);
        i.putExtra(AlarmClock.EXTRA_MESSAGE, call.getString("label", "Alton"));
        i.putExtra(AlarmClock.EXTRA_SKIP_UI, true);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject("No clock app accepted the alarm.");
        }
    }

    /* ── Calendar (needs the Calendar permission) ── */

    @PluginMethod
    public void calendarEvents(PluginCall call) {
        if (getPermissionState("calendar") != PermissionState.GRANTED) {
            call.reject("Calendar permission is off.");
            return;
        }
        long from = num(call, "from");
        long to = num(call, "to");
        Uri.Builder b = CalendarContract.Instances.CONTENT_URI.buildUpon();
        ContentUris.appendId(b, from);
        ContentUris.appendId(b, to);
        String[] cols = {
            CalendarContract.Instances.TITLE,
            CalendarContract.Instances.BEGIN,
            CalendarContract.Instances.END,
            CalendarContract.Instances.ALL_DAY,
            CalendarContract.Instances.EVENT_LOCATION,
        };
        JSArray out = new JSArray();
        try (Cursor c = getContext().getContentResolver().query(b.build(), cols, null, null, CalendarContract.Instances.BEGIN + " ASC")) {
            while (c != null && c.moveToNext() && out.length() < 200) {
                JSObject o = new JSObject();
                o.put("title", c.getString(0) == null ? "" : c.getString(0));
                o.put("start", c.getLong(1));
                o.put("end", c.getLong(2));
                o.put("allDay", c.getInt(3) == 1);
                o.put("location", c.getString(4) == null ? "" : c.getString(4));
                out.put(o);
            }
        } catch (Exception e) {
            call.reject("Couldn't read the calendar.");
            return;
        }
        call.resolve(new JSObject().put("events", out));
    }

    /** The calendar to add to: the main one the phone's owner can write to. */
    private long writableCalendar(ContentResolver cr) {
        String[] cols = { CalendarContract.Calendars._ID, CalendarContract.Calendars.IS_PRIMARY };
        String where = CalendarContract.Calendars.CALENDAR_ACCESS_LEVEL + ">=" + CalendarContract.Calendars.CAL_ACCESS_CONTRIBUTOR
            + " AND " + CalendarContract.Calendars.VISIBLE + "=1";
        long best = -1;
        try (Cursor c = cr.query(CalendarContract.Calendars.CONTENT_URI, cols, where, null, null)) {
            while (c != null && c.moveToNext()) {
                if (best < 0) best = c.getLong(0);
                if (c.getInt(1) == 1) return c.getLong(0);
            }
        } catch (Exception ignored) {}
        return best;
    }

    @PluginMethod
    public void addEvents(PluginCall call) {
        if (getPermissionState("calendar") != PermissionState.GRANTED) {
            call.reject("Calendar permission is off.");
            return;
        }
        JSArray events = call.getArray("events", new JSArray());
        ContentResolver cr = getContext().getContentResolver();
        long cal = writableCalendar(cr);
        if (cal < 0) {
            call.reject("No calendar on the phone can be written to.");
            return;
        }
        int added = 0;
        String tz = TimeZone.getDefault().getID();
        for (int i = 0; i < events.length(); i++) {
            JSONObject e = events.optJSONObject(i);
            if (e == null) continue;
            long start = e.optLong("start");
            long end = e.optLong("end");
            if (start <= 0 || end <= start) continue;
            ContentValues v = new ContentValues();
            v.put(CalendarContract.Events.CALENDAR_ID, cal);
            v.put(CalendarContract.Events.TITLE, e.optString("title", "Work"));
            v.put(CalendarContract.Events.DESCRIPTION, e.optString("notes", ""));
            v.put(CalendarContract.Events.EVENT_LOCATION, e.optString("location", ""));
            v.put(CalendarContract.Events.DTSTART, start);
            v.put(CalendarContract.Events.DTEND, end);
            v.put(CalendarContract.Events.EVENT_TIMEZONE, tz);
            try {
                Uri u = cr.insert(CalendarContract.Events.CONTENT_URI, v);
                if (u == null) continue;
                added++;
                int remind = e.optInt("remindMinutes", 0);
                if (remind > 0) {
                    ContentValues r = new ContentValues();
                    r.put(CalendarContract.Reminders.EVENT_ID, ContentUris.parseId(u));
                    r.put(CalendarContract.Reminders.MINUTES, remind);
                    r.put(CalendarContract.Reminders.METHOD, CalendarContract.Reminders.METHOD_ALERT);
                    cr.insert(CalendarContract.Reminders.CONTENT_URI, r);
                }
            } catch (Exception ignored) {}
        }
        call.resolve(new JSObject().put("added", added));
    }

    /* ── Contacts (needs the Contacts permission) ── */

    @PluginMethod
    public void findContacts(PluginCall call) {
        if (getPermissionState("contacts") != PermissionState.GRANTED) {
            call.reject("Contacts permission is off.");
            return;
        }
        String q = call.getString("name", "").trim();
        if (q.isEmpty()) {
            call.resolve(new JSObject().put("contacts", new JSArray()));
            return;
        }
        String[] cols = {
            ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
            ContactsContract.CommonDataKinds.Phone.NUMBER,
        };
        JSArray out = new JSArray();
        try (Cursor c = getContext().getContentResolver().query(
            ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
            cols,
            ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME + " LIKE ?",
            new String[] { "%" + q + "%" },
            ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME + " ASC"
        )) {
            while (c != null && c.moveToNext() && out.length() < 15) {
                JSObject o = new JSObject();
                o.put("name", c.getString(0) == null ? "" : c.getString(0));
                o.put("phone", c.getString(1) == null ? "" : c.getString(1));
                out.put(o);
            }
        } catch (Exception e) {
            call.reject("Couldn't read contacts.");
            return;
        }
        call.resolve(new JSObject().put("contacts", out));
    }

    /* ── Apps, and reading the shift app's screen (needs Accessibility) ── */

    @PluginMethod
    public void listApps(PluginCall call) {
        PackageManager pm = getContext().getPackageManager();
        Intent i = new Intent(Intent.ACTION_MAIN);
        i.addCategory(Intent.CATEGORY_LAUNCHER);
        List<ResolveInfo> list = pm.queryIntentActivities(i, 0);
        Collections.sort(list, new ResolveInfo.DisplayNameComparator(pm));
        JSArray out = new JSArray();
        for (ResolveInfo r : list) {
            JSObject o = new JSObject();
            o.put("name", r.loadLabel(pm).toString());
            o.put("package", r.activityInfo.packageName);
            out.put(o);
        }
        call.resolve(new JSObject().put("apps", out));
    }

    @PluginMethod
    public void readApp(final PluginCall call) {
        final String pkg = call.getString("package", "");
        final Context ctx = getContext();
        if (!ScreenReader.isEnabled(ctx) || ScreenReader.get() == null) {
            call.reject("Screen reading is off.");
            return;
        }
        Intent launch = ctx.getPackageManager().getLaunchIntentForPackage(pkg);
        if (launch == null) {
            call.reject("That app isn't installed.");
            return;
        }
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        ctx.startActivity(launch);
        final Set<String> lines = ScreenReader.newLines();
        final int[] pages = { 0 };
        final Runnable[] step = new Runnable[1];
        step[0] = () -> {
            ScreenReader sr = ScreenReader.get();
            if (sr == null) {
                finishRead(call, ctx, lines, "Screen reading was switched off.");
                return;
            }
            if (!pkg.equals(sr.frontPackage()) && pages[0] == 0) {
                // Still opening (or it opened a sign-in screen): give it a little longer once.
                pages[0] = 1;
                main.postDelayed(step[0], 2500);
                return;
            }
            sr.collect(lines);
            pages[0]++;
            if (pages[0] < 6 && sr.scrollDown()) main.postDelayed(step[0], 1200);
            else finishRead(call, ctx, lines, null);
        };
        main.postDelayed(step[0], 3500);
    }

    private void finishRead(PluginCall call, Context ctx, Set<String> lines, String err) {
        // Back to Alton.
        Intent back = new Intent(ctx, MainActivity.class);
        back.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
        try {
            ctx.startActivity(back);
        } catch (Exception ignored) {}
        if (err != null && lines.isEmpty()) {
            call.reject(err);
            return;
        }
        StringBuilder sb = new StringBuilder();
        for (String s : lines) sb.append(s).append('\n');
        call.resolve(new JSObject().put("text", sb.toString()));
    }
}
