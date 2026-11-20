package com.alton.phone;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(IntentLinksPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
