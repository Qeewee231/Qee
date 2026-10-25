package ir.monshi.app.sms;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** سر موعد (حتی وقتی برنامه بسته است) فراخوانی می‌شود و پیامک را می‌فرستد. */
public class SmsAlarmReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (SmsSender.ACTION_SEND.equals(action)) {
            String id = intent.getStringExtra(SmsSender.EXTRA_ID);
            if (id != null) SmsSender.deliver(context, id);
        } else if (Intent.ACTION_BOOT_COMPLETED.equals(action)
            || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)
            || Intent.ACTION_TIME_CHANGED.equals(action)
            || "android.app.action.SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED".equals(action)) {
            SmsSender.rescheduleAll(context);
        }
    }
}
