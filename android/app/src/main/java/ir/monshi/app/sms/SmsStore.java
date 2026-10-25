package ir.monshi.app.sms;

import android.content.Context;
import android.content.SharedPreferences;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import org.json.JSONException;
import org.json.JSONObject;

/** پیامک‌های زمان‌بندی‌شده و وضعیتشان را ذخیره می‌کند تا پس از بسته شدن برنامه یا ری‌استارت گوشی از بین نروند. */
public final class SmsStore {

    public static final String STATUS_SCHEDULED = "scheduled";
    public static final String STATUS_SENT = "sent";
    public static final String STATUS_FAILED = "failed";
    public static final String STATUS_MISSED = "missed";

    private static final String PREFS = "monshi_sms";
    private static final String KEY = "items";

    private SmsStore() {}

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static synchronized JSONObject all(Context context) {
        try {
            return new JSONObject(prefs(context).getString(KEY, "{}"));
        } catch (JSONException e) {
            return new JSONObject();
        }
    }

    private static synchronized void saveAll(Context context, JSONObject items) {
        prefs(context).edit().putString(KEY, items.toString()).apply();
    }

    public static synchronized void put(Context context, JSONObject item) throws JSONException {
        JSONObject items = all(context);
        items.put(item.getString("id"), item);
        saveAll(context, items);
    }

    public static synchronized JSONObject get(Context context, String id) {
        return all(context).optJSONObject(id);
    }

    public static synchronized void remove(Context context, String id) {
        JSONObject items = all(context);
        items.remove(id);
        saveAll(context, items);
    }

    public static synchronized void setStatus(Context context, String id, String status, String error) {
        JSONObject items = all(context);
        JSONObject item = items.optJSONObject(id);
        if (item == null) return;
        try {
            item.put("status", status);
            item.put("updatedAt", System.currentTimeMillis());
            if (error != null) item.put("error", error);
            else item.remove("error");
            items.put(id, item);
        } catch (JSONException ignored) {
            return;
        }
        saveAll(context, items);
    }

    public static synchronized List<JSONObject> list(Context context) {
        JSONObject items = all(context);
        List<JSONObject> out = new ArrayList<>();
        Iterator<String> keys = items.keys();
        while (keys.hasNext()) {
            JSONObject item = items.optJSONObject(keys.next());
            if (item != null) out.add(item);
        }
        return out;
    }

    /** موارد قدیمی (بیش از ۳۰ روز) را پاک می‌کند */
    public static synchronized void prune(Context context) {
        long limit = System.currentTimeMillis() - 30L * 24 * 3600 * 1000;
        JSONObject items = all(context);
        List<String> old = new ArrayList<>();
        Iterator<String> keys = items.keys();
        while (keys.hasNext()) {
            String key = keys.next();
            JSONObject item = items.optJSONObject(key);
            if (item != null && !STATUS_SCHEDULED.equals(item.optString("status")) && item.optLong("at") < limit) old.add(key);
        }
        for (String key : old) items.remove(key);
        saveAll(context, items);
    }
}
