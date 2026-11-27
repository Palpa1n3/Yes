package com.alton.phone;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.InstallSourceInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageInstaller;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.os.Build;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Arrays;

/**
 * Alton updating itself. The new APK is downloaded in the background, checked (same app, signed
 * with the same key) and handed to Android's PackageInstaller. Once Alton has installed itself
 * this way it is the "installer of record", and on Android 12+ later updates need no Install
 * screen at all (USER_ACTION_NOT_REQUIRED). When Android still wants a confirmation,
 * UpdateReceiver opens its screen.
 */
public final class SelfUpdate {
    private SelfUpdate() {}

    public interface Progress {
        void percent(int p);
    }

    static File apkFile(Context ctx) {
        return new File(ctx.getCacheDir(), "alton-update.apk");
    }

    static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences("alton_update", Context.MODE_PRIVATE);
    }

    /** Only Alton's own release downloads. */
    static boolean allowedUrl(String url) {
        return url != null && url.startsWith("https://github.com/") && url.endsWith(".apk");
    }

    /** Download (if this URL isn't downloaded already) and check it. Runs off the main thread. */
    static void download(Context ctx, String url, Progress progress) throws Exception {
        if (!allowedUrl(url)) throw new Exception("Not an Alton update link.");
        SharedPreferences p = prefs(ctx);
        File out = apkFile(ctx);
        if (url.equals(p.getString("url", "")) && out.exists() && out.length() > 0 && verify(ctx, out)) {
            progress.percent(100);
            return;
        }
        File part = new File(ctx.getCacheDir(), "alton-update.apk.part");
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setInstanceFollowRedirects(true);
        c.setConnectTimeout(20_000);
        c.setReadTimeout(60_000);
        int code = c.getResponseCode();
        // GitHub sends release files from another host: follow the redirect by hand if needed.
        for (int hops = 0; (code == 301 || code == 302 || code == 307 || code == 308) && hops < 5; hops++) {
            String next = c.getHeaderField("Location");
            c.disconnect();
            if (next == null || !next.startsWith("https://")) throw new Exception("Bad download link.");
            c = (HttpURLConnection) new URL(next).openConnection();
            c.setConnectTimeout(20_000);
            c.setReadTimeout(60_000);
            code = c.getResponseCode();
        }
        if (code != 200) throw new Exception("Download failed (" + code + ")");
        long total = c.getContentLengthLong();
        long got = 0;
        int last = -1;
        try (InputStream in = c.getInputStream(); FileOutputStream fo = new FileOutputStream(part)) {
            byte[] buf = new byte[64 * 1024];
            int n;
            while ((n = in.read(buf)) > 0) {
                fo.write(buf, 0, n);
                got += n;
                if (total > 0) {
                    int pc = (int) (got * 100 / total);
                    if (pc != last) {
                        last = pc;
                        progress.percent(Math.min(99, pc));
                    }
                }
            }
        } finally {
            c.disconnect();
        }
        if (!verify(ctx, part)) {
            part.delete();
            throw new Exception("The download isn't a genuine Alton update, so it wasn't installed.");
        }
        if (out.exists()) out.delete();
        if (!part.renameTo(out)) throw new Exception("Couldn't save the update.");
        p.edit().putString("url", url).putString("state", "downloaded").remove("error").apply();
        progress.percent(100);
    }

    /** The file is Alton (same package name) signed with the same key as the installed app. */
    @SuppressWarnings("deprecation")
    static boolean verify(Context ctx, File apk) {
        try {
            PackageManager pm = ctx.getPackageManager();
            int flags = Build.VERSION.SDK_INT >= 28 ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
            PackageInfo theirs = pm.getPackageArchiveInfo(apk.getAbsolutePath(), flags);
            PackageInfo ours = pm.getPackageInfo(ctx.getPackageName(), flags);
            if (theirs == null || !ctx.getPackageName().equals(theirs.packageName)) return false;
            Signature[] a;
            Signature[] b;
            if (Build.VERSION.SDK_INT >= 28) {
                if (theirs.signingInfo == null || ours.signingInfo == null) return false;
                a = theirs.signingInfo.getApkContentsSigners();
                b = ours.signingInfo.getApkContentsSigners();
            } else {
                a = theirs.signatures;
                b = ours.signatures;
            }
            if (a == null || b == null || a.length == 0) return false;
            String[] sa = new String[a.length];
            String[] sb = new String[b.length];
            for (int i = 0; i < a.length; i++) sa[i] = a[i].toCharsString();
            for (int i = 0; i < b.length; i++) sb[i] = b[i].toCharsString();
            Arrays.sort(sa);
            Arrays.sort(sb);
            return Arrays.equals(sa, sb);
        } catch (Exception e) {
            return false;
        }
    }

    /** Is an update downloaded and ready to install? */
    static boolean ready(Context ctx) {
        File f = apkFile(ctx);
        return f.exists() && f.length() > 0 && "downloaded".equals(prefs(ctx).getString("state", ""));
    }

    /** Can this update go in without Android's Install screen (Android 12+, Alton installed itself)? */
    static boolean silentPossible(Context ctx) {
        if (Build.VERSION.SDK_INT < 31) return false;
        try {
            InstallSourceInfo src = ctx.getPackageManager().getInstallSourceInfo(ctx.getPackageName());
            return ctx.getPackageName().equals(src.getInstallingPackageName());
        } catch (Exception e) {
            return false;
        }
    }

    /** Hand the downloaded APK to Android's installer. UpdateReceiver gets the result. */
    static void install(Context ctx) throws Exception {
        File apk = apkFile(ctx);
        if (!apk.exists() || !verify(ctx, apk)) throw new Exception("No checked update to install.");
        PackageInstaller pi = ctx.getPackageManager().getPackageInstaller();
        PackageInstaller.SessionParams params =
            new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
        params.setAppPackageName(ctx.getPackageName());
        if (Build.VERSION.SDK_INT >= 31) params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED);
        int id = pi.createSession(params);
        try (PackageInstaller.Session s = pi.openSession(id)) {
            try (InputStream in = new FileInputStream(apk); OutputStream o = s.openWrite("alton.apk", 0, apk.length())) {
                byte[] buf = new byte[64 * 1024];
                int n;
                while ((n = in.read(buf)) > 0) o.write(buf, 0, n);
                s.fsync(o);
            }
            Intent done = new Intent(ctx, UpdateReceiver.class);
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            // The system adds the result to this intent, so it must be mutable (Android 12+).
            if (Build.VERSION.SDK_INT >= 31) flags |= PendingIntent.FLAG_MUTABLE;
            PendingIntent pend = PendingIntent.getBroadcast(ctx, id, done, flags);
            prefs(ctx).edit().putString("state", "installing").remove("error").apply();
            s.commit(pend.getIntentSender());
        }
    }
}
