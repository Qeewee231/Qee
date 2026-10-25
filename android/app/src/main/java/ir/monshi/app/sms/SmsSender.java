package ir.monshi.app.sms;

import android.Manifest;
import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.telephony.SmsManager;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import ir.monshi.app.MainActivity;
import ir.monshi.app.R;
import java.util.ArrayList;
import org.json.JSONObject;

/** ارسال پیامک، زمان‌بندی با AlarmManager و اطلاع‌رسانی نتیجه به کاربر */
public final class SmsSender {

    public static final String ACTION_SEND = "ir.monshi.app.SEND_SCHEDULED_SMS";
    public static final String EXTRA_ID = "id";
    /** یادآوری‌هایی که به‌خاطر خاموش بودن گوشی جا ماندند تا این مدت بعد هنوز ارسال می‌شوند */
    public static final long LATE_WINDOW_MS = 6L * 3600 * 1000;
    private static final String CHANNEL_ID = "monshi_sms_status";

    private SmsSender() {}

    public static boolean hasPermission(Context context) {
        return ContextCompat.checkSelfPermission(context, Manifest.permission.SEND_SMS) == PackageManager.PERMISSION_GRANTED;
    }

    /** پیامک را فوراً می‌فرستد؛ در صورت خطا پیام خطا را برمی‌گرداند و در صورت موفقیت null */
    public static String send(Context context, String phone, String message) {
        if (!hasPermission(context)) return "اجازهٔ ارسال پیامک داده نشده است";
        try {
            SmsManager sms;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                sms = context.getSystemService(SmsManager.class);
            } else {
                sms = SmsManager.getDefault();
            }
            if (sms == null) return "این دستگاه امکان ارسال پیامک ندارد";
            ArrayList<String> parts = sms.divideMessage(message);
            if (parts.size() > 1) sms.sendMultipartTextMessage(phone, null, parts, null, null);
            else sms.sendTextMessage(phone, null, message, null, null);
            return null;
        } catch (Exception e) {
            return e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName();
        }
    }

    private static PendingIntent alarmIntent(Context context, String id) {
        Intent intent = new Intent(context, SmsAlarmReceiver.class);
        intent.setAction(ACTION_SEND);
        intent.setData(Uri.parse("monshi-sms://" + Uri.encode(id)));
        intent.putExtra(EXTRA_ID, id);
        return PendingIntent.getBroadcast(context, id.hashCode(), intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    public static boolean canScheduleExact(Context context) {
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.S || (am != null && am.canScheduleExactAlarms());
    }

    public static void setAlarm(Context context, String id, long at) {
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        PendingIntent pi = alarmIntent(context, id);
        if (canScheduleExact(context)) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
        else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
    }

    public static void cancelAlarm(Context context, String id) {
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am != null) am.cancel(alarmIntent(context, id));
    }

    /** یک مورد ذخیره‌شده را ارسال و وضعیتش را ثبت می‌کند */
    public static synchronized void deliver(Context context, String id) {
        JSONObject item = SmsStore.get(context, id);
        if (item == null || !SmsStore.STATUS_SCHEDULED.equals(item.optString("status"))) return;
        String name = item.optString("name", item.optString("phone"));
        if (System.currentTimeMillis() - item.optLong("at") > LATE_WINDOW_MS) {
            SmsStore.setStatus(context, id, SmsStore.STATUS_MISSED, "گوشی در زمان ارسال خاموش بود");
            notifyUser(context, id, "پیامک یادآوری ارسال نشد", "پیامک به " + name + " به موقع ارسال نشد (گوشی خاموش بود).");
            return;
        }
        String error = send(context, item.optString("phone"), item.optString("message"));
        if (error == null) {
            SmsStore.setStatus(context, id, SmsStore.STATUS_SENT, null);
            notifyUser(context, id, "پیامک یادآوری ارسال شد ✓", "برای " + name + ": " + item.optString("message"));
        } else {
            SmsStore.setStatus(context, id, SmsStore.STATUS_FAILED, error);
            notifyUser(context, id, "ارسال پیامک ناموفق بود", "به " + name + ": " + error);
        }
    }

    /** پس از روشن شدن گوشی، همهٔ پیامک‌های در انتظار دوباره زمان‌بندی می‌شوند */
    public static void rescheduleAll(Context context) {
        long now = System.currentTimeMillis();
        for (JSONObject item : SmsStore.list(context)) {
            if (!SmsStore.STATUS_SCHEDULED.equals(item.optString("status"))) continue;
            String id = item.optString("id");
            long at = item.optLong("at");
            if (at <= now) deliver(context, id);
            else setAlarm(context, id, at);
        }
        SmsStore.prune(context);
    }

    private static void notifyUser(Context context, String id, String title, String text) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
            && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = context.getSystemService(NotificationManager.class);
            if (nm != null && nm.getNotificationChannel(CHANNEL_ID) == null) {
                nm.createNotificationChannel(new NotificationChannel(CHANNEL_ID, "وضعیت پیامک‌ها", NotificationManager.IMPORTANCE_DEFAULT));
            }
        }
        Intent open = new Intent(context, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent content = PendingIntent.getActivity(context, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder b = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_monshi)
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(text))
            .setContentIntent(content)
            .setAutoCancel(true);
        try {
            NotificationManagerCompat.from(context).notify(("sms-" + id).hashCode(), b.build());
        } catch (SecurityException ignored) {
            // اجازهٔ اعلان در همین لحظه گرفته شده است
        }
    }
}
