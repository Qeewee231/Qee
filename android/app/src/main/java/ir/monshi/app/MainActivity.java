package ir.monshi.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import ir.monshi.app.sms.SmsSchedulerPlugin;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SmsSchedulerPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
