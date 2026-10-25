package ir.monshi.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import ir.monshi.app.contacts.ContactPickerPlugin;
import ir.monshi.app.sms.SmsSchedulerPlugin;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SmsSchedulerPlugin.class);
        registerPlugin(ContactPickerPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
