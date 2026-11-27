package com.alton.phone;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInstaller;

/** The result of an update Alton handed to Android's installer (see SelfUpdate). */
public class UpdateReceiver extends BroadcastReceiver {
    @Override
    @SuppressWarnings("deprecation")
    public void onReceive(Context ctx, Intent intent) {
        SharedPreferences p = SelfUpdate.prefs(ctx);
        int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, -999);
        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            // Android wants a tap on its Install screen (the first time, or on older Android).
            Intent confirm = intent.getParcelableExtra(Intent.EXTRA_INTENT);
            p.edit().putString("state", "confirm").apply();
            if (confirm != null) {
                confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                try {
                    ctx.startActivity(confirm);
                } catch (Exception e) {
                    p.edit().putString("state", "downloaded").putString("error", "Open Alton and tap the update banner to finish.").apply();
                }
            }
        } else if (status == PackageInstaller.STATUS_SUCCESS) {
            p.edit().putString("state", "done").remove("error").apply();
        } else {
            String msg = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE);
            p.edit()
                .putString("state", "downloaded")
                .putString("error", "The update didn't install" + (msg == null ? "" : ": " + msg))
                .apply();
        }
    }
}
