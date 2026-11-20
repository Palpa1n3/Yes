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
        if (getIntent() != null && Intent.ACTION_ASSIST.equals(getIntent().getAction())) AltonNativePlugin.assistPending = true;
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (intent != null && Intent.ACTION_ASSIST.equals(intent.getAction())) AltonNativePlugin.assistOpened();
    }
}
