package ir.monshi.app.contacts;

import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.ContactsContract;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * انتخاب یک شماره از مخاطبین گوشی با صفحهٔ انتخاب خود اندروید.
 * به اجازهٔ خواندن همهٔ مخاطبین نیاز ندارد؛ فقط همان مخاطبی که کاربر انتخاب می‌کند در دسترس برنامه قرار می‌گیرد.
 */
@CapacitorPlugin(name = "ContactPicker")
public class ContactPickerPlugin extends Plugin {

    @PluginMethod
    public void pick(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_PICK, ContactsContract.CommonDataKinds.Phone.CONTENT_URI);
        startActivityForResult(call, intent, "onPicked");
    }

    @ActivityCallback
    private void onPicked(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            JSObject ret = new JSObject();
            ret.put("cancelled", true);
            call.resolve(ret);
            return;
        }
        Uri uri = result.getData().getData();
        String[] projection = { ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME, ContactsContract.CommonDataKinds.Phone.NUMBER };
        try (Cursor cursor = getContext().getContentResolver().query(uri, projection, null, null, null)) {
            if (cursor == null || !cursor.moveToFirst()) {
                call.reject("مخاطب خوانده نشد");
                return;
            }
            JSObject ret = new JSObject();
            ret.put("name", cursor.getString(0));
            ret.put("phone", cursor.getString(1));
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("مخاطب خوانده نشد: " + e.getMessage());
        }
    }
}
