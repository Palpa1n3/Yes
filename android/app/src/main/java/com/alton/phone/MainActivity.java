package com.alton.phone;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(IntentLinksPlugin.class);
        registerPlugin(AltonNativePlugin.class);
        super.onCreate(savedInstanceState);
        String mode = modeFor(getIntent());
        if (mode != null) {
            AltonNativePlugin.assistPending = true;
            AltonNativePlugin.assistMode = mode;
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        String mode = modeFor(intent);
        if (mode != null) AltonNativePlugin.assistOpened(mode);
    }

    /** Opened by the assistant button or a widget button: what to start with. */
    private static String modeFor(Intent i) {
        if (i == null || i.getAction() == null) return null;
        if (Intent.ACTION_ASSIST.equals(i.getAction()) || AltonWidget.DRIVE.equals(i.getAction())) return "drive";
        if (AltonWidget.TALK.equals(i.getAction())) return "talk";
        return null;
    }
}
