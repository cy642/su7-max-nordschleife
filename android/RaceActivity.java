package io.github.cy642.nordrun;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.ByteArrayInputStream;
import java.io.IOException;

public final class RaceActivity extends Activity {
    static final String GAME = "https://appassets.androidplatform.net/game/index.html";
    private WebView game;
    private UpdateController updates;

    private void immersive() {
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN |
            View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN |
            View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
    }

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        // Reserve real cutouts at both landscape edges so a camera hole cannot hide a control.
        WindowManager.LayoutParams layout = getWindow().getAttributes();
        layout.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_NEVER;
        getWindow().setAttributes(layout);
        immersive();
        game = new WebView(this);
        game.setBackgroundColor(0xff102630);
        game.setOverScrollMode(View.OVER_SCROLL_NEVER);
        game.getSettings().setJavaScriptEnabled(true);
        game.getSettings().setDomStorageEnabled(true);
        game.getSettings().setUseWideViewPort(true);
        game.getSettings().setAllowFileAccess(false);
        game.getSettings().setAllowContentAccess(false);
        updates = new UpdateController(this, game, state);
        game.setWebViewClient(new WebViewClient() {
            @Override public void onPageFinished(WebView view, String url) {
                if (GAME.equals(url)) updates.publishVersion();
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                if (GAME.equals(request.getUrl().toString())) {
                    try {
                        return new WebResourceResponse("text/html", "utf-8", getAssets().open("index.html"));
                    } catch (IOException e) { throw new IllegalStateException(e); }
                }
                // The model, sounds and textures are embedded. Let Chromium handle blob/data URLs.
                String scheme = request.getUrl().getScheme();
                if ("https".equals(scheme) || "http".equals(scheme))
                    return new WebResourceResponse("text/plain", "utf-8", 404, "Not found", null, new ByteArrayInputStream(new byte[0]));
                return null;
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (GAME.equals(uri.toString())) return false;
                if ("nordrun://update/check".equals(uri.toString())) {
                    if (request.hasGesture() && request.isForMainFrame() && GAME.equals(view.getUrl())) updates.open();
                    return true;
                }
                if (request.hasGesture() && request.isForMainFrame() && "https".equals(uri.getScheme())) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (ActivityNotFoundException ignored) {}
                }
                return true;
            }
        });
        setContentView(game);
        game.loadUrl(GAME);
    }

    @Override public void onWindowFocusChanged(boolean focused) {
        super.onWindowFocusChanged(focused);
        if (focused) immersive();
    }
    @Override public void onBackPressed() {
        game.evaluateJavascript("window.nordBack && window.nordBack()", result -> {
            if (!"true".equals(result)) finish();
        });
    }
    @Override protected void onPause() {
        updates.pause();
        game.evaluateJavascript("window.dispatchEvent(new Event('blur'))", null);
        game.onPause(); super.onPause();
    }
    @Override protected void onResume() {
        super.onResume(); game.onResume(); immersive(); updates.resume();
    }
    @Override protected void onSaveInstanceState(Bundle state) {
        super.onSaveInstanceState(state);
        updates.saveState(state);
    }
    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        updates.activityResult(request, result);
    }
    @Override protected void onDestroy() {
        updates.destroy(); game.destroy(); super.onDestroy();
    }
}
