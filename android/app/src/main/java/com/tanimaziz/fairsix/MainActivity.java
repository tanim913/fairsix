package com.tanimaziz.fairsix;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.content.res.Configuration;
import android.os.Build;
import android.widget.FrameLayout;
import android.view.WindowInsets;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

// Fairsix for Android: a full-screen WebView around the hosted game.
public class MainActivity extends Activity {
    static final String HOME = "https://tanim913.github.io/fairsix/";
    static final String HOST = "tanim913.github.io";
    static final String PATH = "/fairsix";
    private WebView web;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        // Keep the screen on while the app is open, so this phone keeps sealing rolls.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        boolean night = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        int ground = night ? 0xFF0C1A1E : 0xFFE4EEEA;

        // The page sits inside the system bars: the frame takes their insets as
        // padding and paints them in the app's ground colour (Android 15 draws
        // apps edge to edge, under the status bar, otherwise).
        FrameLayout frame = new FrameLayout(this);
        frame.setBackgroundColor(ground);
        frame.setOnApplyWindowInsetsListener((v, insets) -> {
            int l, t, r, b;
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets i = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                l = i.left; t = i.top; r = i.right; b = i.bottom;
            } else {
                l = insets.getSystemWindowInsetLeft(); t = insets.getSystemWindowInsetTop();
                r = insets.getSystemWindowInsetRight(); b = insets.getSystemWindowInsetBottom();
            }
            v.setPadding(l, t, r, b);
            return insets;
        });
        if (Build.VERSION.SDK_INT >= 23 && !night) {
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
                    | (Build.VERSION.SDK_INT >= 26 ? View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR : 0));
        }
        getWindow().setStatusBarColor(ground);
        getWindow().setNavigationBarColor(ground);

        web = new WebView(this);
        web.setBackgroundColor(ground);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setSupportZoom(false);
        s.setTextZoom(100);
        web.addJavascriptInterface(new Bridge(), "FairsixAndroid");
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (isOurs(u)) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) { }
                return true;
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError err) {
                if (req.isForMainFrame()) view.loadUrl("file:///android_asset/offline.html");
            }
        });
        frame.addView(web, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(frame);

        if (state != null) web.restoreState(state);
        else web.loadUrl(startUrl(getIntent()));
    }

    private static boolean isOurs(Uri u) {
        return u != null && "https".equals(u.getScheme()) && HOST.equals(u.getHost())
                && u.getPath() != null && u.getPath().startsWith(PATH);
    }

    private static String startUrl(Intent intent) {
        Uri data = intent == null ? null : intent.getData();
        return isOurs(data) ? data.toString() : HOME;
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (isOurs(intent.getData())) web.loadUrl(intent.getData().toString());
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        web.destroy();
        super.onDestroy();
    }

    // Exposed to the page as window.FairsixAndroid.
    class Bridge {
        @JavascriptInterface
        public void share(String text) {
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType("text/plain");
            send.putExtra(Intent.EXTRA_TEXT, text);
            runOnUiThread(() -> startActivity(Intent.createChooser(send, "Share room")));
        }

        @JavascriptInterface
        public void retry() {
            runOnUiThread(() -> web.loadUrl(HOME));
        }
    }
}
