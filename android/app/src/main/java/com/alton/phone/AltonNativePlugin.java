package com.alton.phone;

import android.Manifest;
import android.app.Activity;
import android.media.AudioManager;
import android.os.Build;
import android.telephony.SmsManager;
import android.view.KeyEvent;
import android.view.WindowManager;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.annotation.ActivityCallback;
import java.util.ArrayList;
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
        @Permission(alias = "sms", strings = { Manifest.permission.SEND_SMS }),
    }
)
public class AltonNativePlugin extends Plugin {

    private final Handler main = new Handler(Looper.getMainLooper());
    private static AltonNativePlugin instance;
    /** Opened as the phone's assistant (long-press / side key): start listening straight away. */
    static volatile boolean assistPending = false;

    @Override
    public void load() {
        instance = this;
    }

    /** Called by MainActivity when Alton is opened as the assistant while already running. */
    static void assistOpened() {
        assistPending = true;
        final AltonNativePlugin p = instance;
        if (p != null) p.main.post(() -> p.notifyListeners("assist", new JSObject()));
    }

    /** Called by MessageListener when a new message notification arrives. */
    static void newMessage(final JSObject m) {
        final AltonNativePlugin p = instance;
        if (p != null) p.main.post(() -> p.notifyListeners("message", m));
    }

    /** Reading new messages out loud: "off", "headphones" or "always", and quiet hours. */
    @PluginMethod
    public void setAnnounce(PluginCall call) {
        String mode = call.getString("mode", "off");
        if (!"off".equals(mode) && !"headphones".equals(mode) && !"always".equals(mode)) mode = "off";
        Integer from = call.getInt("quietFrom", 23);
        Integer to = call.getInt("quietTo", 7);
        Double rate = call.getDouble("rate", 1.0);
        Announcer.save(getContext(), mode, from == null ? 23 : from, to == null ? 7 : to, rate == null ? 1f : rate.floatValue());
        call.resolve();
    }

    @PluginMethod
    public void takeAssist(PluginCall call) {
        boolean was = assistPending;
        assistPending = false;
        call.resolve(new JSObject().put("assist", was));
    }

    /* ── Hands-free helpers: screen on while driving, music keys, volume ── */

    @PluginMethod
    public void keepScreenOn(PluginCall call) {
        final boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        final Activity a = getActivity();
        if (a == null) {
            call.reject("No screen");
            return;
        }
        a.runOnUiThread(() -> {
            if (on) a.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            else a.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        });
        call.resolve();
    }

    @PluginMethod
    public void media(PluginCall call) {
        String action = call.getString("action", "");
        AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        if (am == null) {
            call.reject("No audio");
            return;
        }
        int code;
        switch (action) {
            case "next": code = KeyEvent.KEYCODE_MEDIA_NEXT; break;
            case "previous": code = KeyEvent.KEYCODE_MEDIA_PREVIOUS; break;
            case "pause": code = KeyEvent.KEYCODE_MEDIA_PAUSE; break;
            case "play": code = KeyEvent.KEYCODE_MEDIA_PLAY; break;
            case "play_pause": code = KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE; break;
            case "volume_up":
                am.adjustStreamVolume(AudioManager.STREAM_MUSIC, AudioManager.ADJUST_RAISE, AudioManager.FLAG_SHOW_UI);
                call.resolve();
                return;
            case "volume_down":
                am.adjustStreamVolume(AudioManager.STREAM_MUSIC, AudioManager.ADJUST_LOWER, AudioManager.FLAG_SHOW_UI);
                call.resolve();
                return;
            default:
                call.reject("Unknown action");
                return;
        }
        am.dispatchMediaKeyEvent(new KeyEvent(KeyEvent.ACTION_DOWN, code));
        am.dispatchMediaKeyEvent(new KeyEvent(KeyEvent.ACTION_UP, code));
        call.resolve();
    }

    /* ── Texts: send an SMS (only after the user said or tapped yes) ── */

    @PluginMethod
    public void sendSms(PluginCall call) {
        if (getPermissionState("sms") != PermissionState.GRANTED) {
            requestPermissionForAlias("sms", call, "smsCallback");
            return;
        }
        doSendSms(call);
    }

    @PermissionCallback
    private void smsCallback(PluginCall call) {
        if (getPermissionState("sms") != PermissionState.GRANTED) {
            call.reject("Permission to send texts was not given.");
            return;
        }
        doSendSms(call);
    }

    @SuppressWarnings("deprecation")
    private void doSendSms(PluginCall call) {
        String to = call.getString("to", "");
        String text = call.getString("text", "");
        if (to == null || to.trim().isEmpty() || text == null || text.trim().isEmpty()) {
            call.reject("Need a number and a message.");
            return;
        }
        try {
            SmsManager sm = Build.VERSION.SDK_INT >= 31 ? getContext().getSystemService(SmsManager.class) : SmsManager.getDefault();
            ArrayList<String> parts = sm.divideMessage(text);
            sm.sendMultipartTextMessage(to.trim(), null, parts, null, null);
            call.resolve();
        } catch (Exception e) {
            call.reject("The text couldn't be sent.");
        }
    }

    /* ── Contact picker (the phone's own; no permission needed) ── */

    @PluginMethod
    public void pickContact(PluginCall call) {
        Intent i = new Intent(Intent.ACTION_PICK, ContactsContract.CommonDataKinds.Phone.CONTENT_URI);
        startActivityForResult(call, i, "contactPicked");
    }

    @ActivityCallback
    private void contactPicked(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
            call.reject("No contact chosen.");
            return;
        }
        String[] cols = {
            ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
            ContactsContract.CommonDataKinds.Phone.NUMBER,
        };
        try (Cursor c = getContext().getContentResolver().query(data.getData(), cols, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                JSObject o = new JSObject();
                o.put("name", c.getString(0) == null ? "" : c.getString(0));
                o.put("phone", c.getString(1) == null ? "" : c.getString(1));
                call.resolve(o);
                return;
            }
        } catch (Exception ignored) {}
        call.reject("Couldn't read that contact.");
    }

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
        else if ("assistant".equals(which)) i = new Intent(Settings.ACTION_VOICE_INPUT_SETTINGS);
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
        int limit = q.isEmpty() ? 3000 : 15;
        String[] cols = {
            ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
            ContactsContract.CommonDataKinds.Phone.NUMBER,
        };
        JSArray out = new JSArray();
        try (Cursor c = getContext().getContentResolver().query(
            ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
            cols,
            q.isEmpty() ? null : ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME + " LIKE ?",
            q.isEmpty() ? null : new String[] { "%" + q + "%" },
            ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME + " ASC"
        )) {
            while (c != null && c.moveToNext() && out.length() < limit) {
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
        final String tapFirst = call.getString("tap", "");
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
        // stage, tries in this stage, pages read
        final int[] st = { 0, 0, 0 };
        final String[] seen = { "" };
        final Runnable[] step = new Runnable[1];
        step[0] = () -> {
            ScreenReader sr = ScreenReader.get();
            if (sr == null) {
                finishRead(call, ctx, lines, "Screen reading was switched off.", seen[0]);
                return;
            }
            seen[0] = sr.frontPackage();
            switch (st[0]) {
                case 0: // wait for the app to be in front (splash screens, sign-in)
                    if (!pkg.equals(seen[0]) && st[1]++ < 6) {
                        main.postDelayed(step[0], 1500);
                        return;
                    }
                    st[0] = 1;
                    st[1] = 0;
                    main.postDelayed(step[0], 2500); // let it load the rota
                    return;
                case 1: // open the rota tab if one is named
                    st[0] = 2;
                    if (tapFirst != null && !tapFirst.isEmpty() && sr.tapText(tapFirst)) {
                        main.postDelayed(step[0], 2500);
                        return;
                    }
                    main.post(step[0]);
                    return;
                default: // read, waiting a little if it's still loading, then scroll for more
                    int before = lines.size();
                    sr.collectApp(pkg, lines);
                    if (lines.size() < 6 && st[1]++ < 3) {
                        main.postDelayed(step[0], 2000);
                        return;
                    }
                    st[2]++;
                    if (st[2] < 8 && lines.size() > before && sr.scrollDown()) main.postDelayed(step[0], 1300);
                    else finishRead(call, ctx, lines, null, seen[0]);
            }
        };
        main.postDelayed(step[0], 2000);
    }

    /**
     * Sends a Snapchat chat message: opens Snapchat, goes to Chat, opens the friend by the name
     * shown in the chat list, types the message and presses send, then comes back to Alton.
     * Only called after the user has confirmed the message (a tap, or "send it" while driving).
     */
    @PluginMethod
    public void snapSend(final PluginCall call) {
        final String name = call.getString("name", "").trim();
        final String text = call.getString("text", "").trim();
        final Context ctx = getContext();
        final String pkg = "com.snapchat.android";
        if (name.isEmpty() || text.isEmpty()) {
            call.reject("Need who to send to and what to say.");
            return;
        }
        if (!ScreenReader.isEnabled(ctx) || ScreenReader.get() == null) {
            call.reject("Turn on “Read my shift app” in Phone powers first (Snapchat uses the same permission).");
            return;
        }
        Intent launch = ctx.getPackageManager().getLaunchIntentForPackage(pkg);
        if (launch == null) {
            call.reject("Snapchat isn't installed.");
            return;
        }
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        ctx.startActivity(launch);
        final int[] stage = { 0, 0 };
        final Runnable[] step = new Runnable[1];
        step[0] = () -> {
            ScreenReader sr = ScreenReader.get();
            if (sr == null) {
                endSnap(call, ctx, "Screen reading was switched off.");
                return;
            }
            switch (stage[0]) {
                case 0: // Snapchat open: go to the Chat tab
                    if (!pkg.equals(sr.frontPackage()) && stage[1]++ < 3) {
                        main.postDelayed(step[0], 1500);
                        return;
                    }
                    sr.tapText("Chat");
                    stage[0] = 1;
                    stage[1] = 0;
                    main.postDelayed(step[0], 1800);
                    return;
                case 1: // find the friend in the list (scrolling down a few times)
                    if (sr.tapText(name)) {
                        stage[0] = 2;
                        main.postDelayed(step[0], 2200);
                        return;
                    }
                    if (stage[1]++ < 5 && sr.scrollDown()) {
                        main.postDelayed(step[0], 1200);
                        return;
                    }
                    endSnap(call, ctx, "Couldn't find “" + name + "” in your Snapchat chats.");
                    return;
                case 2: // type it
                    if (!sr.typeText(text)) {
                        if (stage[1]++ < 2) {
                            main.postDelayed(step[0], 1200);
                            return;
                        }
                        endSnap(call, ctx, "Couldn't find the chat box in Snapchat.");
                        return;
                    }
                    stage[0] = 3;
                    main.postDelayed(step[0], 700);
                    return;
                default: // send
                    boolean sent = sr.pressSend();
                    final boolean ok = sent;
                    main.postDelayed(() -> endSnap(call, ctx, ok ? null : "Typed it, but couldn't press Send: check Snapchat."), 900);
            }
        };
        main.postDelayed(step[0], 3000);
    }

    private void endSnap(PluginCall call, Context ctx, String err) {
        Intent back = new Intent(ctx, MainActivity.class);
        back.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
        try {
            ctx.startActivity(back);
        } catch (Exception ignored) {}
        if (err == null) call.resolve();
        else call.reject(err);
    }

    private void finishRead(PluginCall call, Context ctx, Set<String> lines, String err, String front) {
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
        JSObject r = new JSObject();
        r.put("text", sb.toString());
        r.put("front", front == null ? "" : front);
        r.put("lines", lines.size());
        call.resolve(r);
    }
}
