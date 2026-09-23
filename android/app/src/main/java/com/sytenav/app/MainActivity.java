package com.sytenav.app;

import android.content.res.Configuration;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.ColorFilter;
import android.graphics.Paint;
import android.graphics.PixelFormat;
import android.graphics.Rect;
import android.graphics.drawable.Drawable;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import androidx.core.graphics.ColorUtils;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

/**
 * THE APP DRAWS BETWEEN THE SYSTEM BARS, ON EVERY ANDROID VERSION.
 *
 * Google Play requires targetSdk 36, and from Android 16 an app targeting 36
 * is drawn EDGE TO EDGE - under the clock and under the gesture bar - with no
 * way to opt out (windowOptOutEdgeToEdgeEnforcement is ignored at 36). The CSS
 * pads by env(safe-area-inset-*), but Android's WebView only reports real
 * values on recent versions, so on many phones they read 0 and SyteNav's top
 * bar would sit under the status bar.
 *
 * So the insets are handled HERE, natively, on every version: edge to edge is
 * switched on everywhere (one behaviour, not one per Android release), and the
 * content view is PADDED by the system bars and the keyboard. The WebView is
 * never under a bar, the insets are CONSUMED so env() reads 0 and the CSS does
 * not pad a second time, and the keyboard shrinks the WebView the way
 * adjustResize used to - which is what the overlays' --vv-h logic expects.
 *
 * The padded bands behind the bars are painted by BarsBackground in the
 * colours the PAGE reports (SystemBarsPlugin, called from native-shell.tsx),
 * because the app's light/dark theme is chosen inside the app and can disagree
 * with the phone's - a band from the phone's setting would put a dark clock on
 * a dark band.
 */
public class MainActivity extends BridgeActivity {

    private final BarsBackground bars = new BarsBackground();

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Before super.onCreate: Capacitor builds the bridge there, and a
        // plugin registered after it is invisible to the page.
        registerPlugin(SystemBarsPlugin.class);
        super.onCreate(savedInstanceState);

        Window window = getWindow();
        WindowCompat.setDecorFitsSystemWindows(window, false);
        // Transparent so the bands below show through. Ignored from Android 15
        // (already transparent there) and deprecated at 35 - still needed on
        // every older phone, where the default bar colour would cover the band.
        window.setStatusBarColor(Color.TRANSPARENT);
        window.setNavigationBarColor(Color.TRANSPARENT);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            // Otherwise Android lays a translucent scrim over 3-button
            // navigation and the band reads as a grey smear.
            window.setNavigationBarContrastEnforced(false);
        }

        // Until the page reports its colours: SyteNav's own paper and ink, by
        // the phone's night mode. Replaced within a second of the page loading.
        boolean night = (getResources().getConfiguration().uiMode
            & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        int initial = night ? Color.parseColor("#0F1113") : Color.parseColor("#F3F4EF");
        setBarColors(initial, initial);

        View content = findViewById(android.R.id.content);
        content.setBackground(bars);
        ViewCompat.setOnApplyWindowInsetsListener(content, (v, insets) -> {
            Insets sys = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
            // The keyboard REPLACES the bottom bar's inset rather than adding
            // to it: when it is up, the gesture bar is behind it.
            v.setPadding(sys.left, sys.top, sys.right, Math.max(sys.bottom, ime.bottom));
            bars.setTopHeight(sys.top);
            return WindowInsetsCompat.CONSUMED;
        });
    }

    /** Paint the two bands, and pick clock/icon colours that read on them. */
    void setBarColors(int top, int bottom) {
        bars.setColors(top, bottom);
        WindowInsetsControllerCompat controller =
            WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        controller.setAppearanceLightStatusBars(isLight(top));
        controller.setAppearanceLightNavigationBars(isLight(bottom));
    }

    private static boolean isLight(int color) {
        return ColorUtils.calculateLuminance(color) > 0.5;
    }

    /**
     * The content view's background: the status-bar band in one colour and the
     * rest (of which only the bottom band is ever visible - the WebView covers
     * the middle) in another. The dashboard's top chrome is `panel` while its
     * bottom tab bar can differ, so one colour for both would be wrong for one.
     */
    static final class BarsBackground extends Drawable {
        private final Paint paint = new Paint();
        private int top = Color.WHITE;
        private int bottom = Color.WHITE;
        private int topHeight = 0;

        void setColors(int top, int bottom) {
            this.top = top;
            this.bottom = bottom;
            invalidateSelf();
        }

        void setTopHeight(int px) {
            this.topHeight = px;
            invalidateSelf();
        }

        @Override
        public void draw(Canvas canvas) {
            Rect b = getBounds();
            paint.setColor(bottom);
            canvas.drawRect(b, paint);
            paint.setColor(top);
            canvas.drawRect(b.left, b.top, b.right, b.top + topHeight, paint);
        }

        @Override public void setAlpha(int alpha) { }
        @Override public void setColorFilter(ColorFilter filter) { }
        @Override public int getOpacity() { return PixelFormat.OPAQUE; }
    }
}
