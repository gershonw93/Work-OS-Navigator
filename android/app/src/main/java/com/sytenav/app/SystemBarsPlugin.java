package com.sytenav.app;

import android.graphics.Color;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * How the page tells the phone what colour to paint behind the status bar and
 * the navigation bar. See MainActivity for why the bands exist at all.
 *
 * Called from components/layout/native-shell.tsx with the colours actually on
 * screen at the top and bottom edges, as #RRGGBB. Android only - iOS draws the
 * page under its bars and pads with env(safe-area-inset-*), which WKWebView
 * has always reported.
 */
@CapacitorPlugin(name = "SyteNavBars")
public class SystemBarsPlugin extends Plugin {

    @PluginMethod
    public void setColors(PluginCall call) {
        final int top;
        final int bottom;
        try {
            top = Color.parseColor(call.getString("top", "#FFFFFF"));
            bottom = Color.parseColor(call.getString("bottom", "#FFFFFF"));
        } catch (IllegalArgumentException e) {
            call.reject("Colours must be #RRGGBB");
            return;
        }
        getActivity().runOnUiThread(() -> {
            ((MainActivity) getActivity()).setBarColors(top, bottom);
            call.resolve();
        });
    }
}
