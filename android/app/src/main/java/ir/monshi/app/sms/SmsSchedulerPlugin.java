package ir.monshi.app.sms;

import android.Manifest;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * پل بین برنامهٔ وب و ارسال پیامک اندروید.
 * متدها: schedule, cancel, sendNow, list, checkPermissions, requestPermissions
 */
@CapacitorPlugin(name = "SmsScheduler", permissions = { @Permission(alias = "sms", strings = { Manifest.permission.SEND_SMS }) })
public class SmsSchedulerPlugin extends Plugin {

    @Override
    public void load() {
        SmsSender.rescheduleAll(getContext());
    }

    @PluginMethod
    public void schedule(PluginCall call) {
        String id = call.getString("id");
        String phone = call.getString("phone");
        String message = call.getString("message");
        long at = call.getData().optLong("at", -1);
        if (id == null || phone == null || message == null || at <= 0) {
            call.reject("id, phone, message و at لازم است");
            return;
        }
        JSONObject existing = SmsStore.get(getContext(), id);
        if (existing != null && !SmsStore.STATUS_SCHEDULED.equals(existing.optString("status"))
            && existing.optLong("at") == at && phone.equals(existing.optString("phone"))) {
            // قبلاً ارسال شده؛ دوباره نفرست
            call.resolve(toJs(existing));
            return;
        }
        try {
            JSONObject item = new JSONObject();
            item.put("id", id);
            item.put("phone", phone);
            item.put("name", call.getString("name", phone));
            item.put("message", message);
            item.put("at", at);
            item.put("status", SmsStore.STATUS_SCHEDULED);
            SmsStore.put(getContext(), item);
            if (at <= System.currentTimeMillis()) SmsSender.deliver(getContext(), id);
            else SmsSender.setAlarm(getContext(), id, at);
            call.resolve(toJs(SmsStore.get(getContext(), id)));
        } catch (JSONException e) {
            call.reject(e.getMessage());
        }
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        String id = call.getString("id");
        if (id == null) {
            call.reject("id لازم است");
            return;
        }
        SmsSender.cancelAlarm(getContext(), id);
        JSONObject item = SmsStore.get(getContext(), id);
        if (item != null && SmsStore.STATUS_SCHEDULED.equals(item.optString("status"))) SmsStore.remove(getContext(), id);
        call.resolve();
    }

    @PluginMethod
    public void sendNow(PluginCall call) {
        if (getPermissionState("sms") != PermissionState.GRANTED) {
            requestPermissionForAlias("sms", call, "sendNowAfterPermission");
            return;
        }
        doSendNow(call);
    }

    @PermissionCallback
    private void sendNowAfterPermission(PluginCall call) {
        if (getPermissionState("sms") == PermissionState.GRANTED) doSendNow(call);
        else call.reject("اجازهٔ ارسال پیامک داده نشد");
    }

    private void doSendNow(PluginCall call) {
        String phone = call.getString("phone");
        String message = call.getString("message");
        if (phone == null || message == null) {
            call.reject("phone و message لازم است");
            return;
        }
        String error = SmsSender.send(getContext(), phone, message);
        if (error == null) call.resolve();
        else call.reject(error);
    }

    @PluginMethod
    public void list(PluginCall call) {
        JSArray items = new JSArray();
        for (JSONObject item : SmsStore.list(getContext())) items.put(toJs(item));
        JSObject ret = new JSObject();
        ret.put("items", items);
        ret.put("exactAlarms", SmsSender.canScheduleExact(getContext()));
        call.resolve(ret);
    }

    private static JSObject toJs(JSONObject item) {
        try {
            return JSObject.fromJSONObject(item);
        } catch (JSONException e) {
            return new JSObject();
        }
    }
}
