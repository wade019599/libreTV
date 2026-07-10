package com.libretv.wrapper;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.SharedPreferences;
import android.content.pm.ActivityInfo;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.ConsoleMessage;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

public class MainActivity extends Activity {
    private static final String PREFS_NAME = "jmtv_app";
    private static final String PREF_LINE_MODE = "line_mode";
    private static final String LINE_MODE_PRIMARY = "primary";
    private static final String LINE_MODE_BACKUP = "backup";
    private WebView webView;
    private View customView;
    private WebChromeClient.CustomViewCallback customViewCallback;
    private int originalOrientation;
    private String primarySiteUrl = "";
    private String backupSiteUrl = "";
    private String lineMode = LINE_MODE_PRIMARY;
    private String loadedLineMode = LINE_MODE_PRIMARY;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().setStatusBarColor(Color.BLACK);
        getWindow().setNavigationBarColor(Color.BLACK);

        webView = new WebView(this);
        webView.setBackgroundColor(Color.BLACK);
        setContentView(webView);

        configureFullscreen();
        configureWebView(webView);

        primarySiteUrl = normalizeSiteUrl(BuildConfig.LIBRETV_SITE_URL);
        backupSiteUrl = normalizeOptionalSiteUrl(BuildConfig.LIBRETV_BACKUP_SITE_URL);
        if (backupSiteUrl.equals(primarySiteUrl)) {
            backupSiteUrl = "";
        }
        lineMode = getSharedPreferences(PREFS_NAME, MODE_PRIVATE).getString(PREF_LINE_MODE, LINE_MODE_PRIMARY);
        if (!LINE_MODE_BACKUP.equals(lineMode) || backupSiteUrl.isEmpty()) {
            lineMode = LINE_MODE_PRIMARY;
        }
        loadedLineMode = lineMode;
        if (savedInstanceState == null) {
            String targetUrl = LINE_MODE_BACKUP.equals(lineMode) ? backupSiteUrl : primarySiteUrl;
            webView.loadUrl(withAppVersionParam(targetUrl));
        } else {
            webView.restoreState(savedInstanceState);
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void configureWebView(WebView targetWebView) {
        WebSettings settings = targetWebView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setSupportZoom(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        String deviceToken = "tv".equals(BuildConfig.JMTV_DEVICE_TYPE) ? "JMTV-TV" : "JMTV-Phone";
        settings.setUserAgentString(settings.getUserAgentString() + " JMTV-Android " + deviceToken);
        targetWebView.addJavascriptInterface(new AppBridge(), "JMTVApp");

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(targetWebView, true);

        targetWebView.setFocusable(true);
        targetWebView.setFocusableInTouchMode(true);
        targetWebView.requestFocus();
        targetWebView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage consoleMessage) {
                android.util.Log.d(
                        "JMTV-WebView",
                        consoleMessage.message() + " -- " + consoleMessage.sourceId() + ":" + consoleMessage.lineNumber()
                );
                return true;
            }

            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                if (customView != null) {
                    callback.onCustomViewHidden();
                    return;
                }

                customView = view;
                customViewCallback = callback;
                originalOrientation = getRequestedOrientation();
                webView.setVisibility(View.GONE);
                setContentView(customView, new ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT
                ));
                getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
                configureFullscreen();
            }

            @Override
            public void onHideCustomView() {
                hideVideoFullscreen();
            }
        });
        targetWebView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                if ("tv".equals(BuildConfig.JMTV_DEVICE_TYPE)) {
                    injectTvSearchKeyboard(view);
                }
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String scheme = uri.getScheme();
                if ("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme)) {
                    view.loadUrl(uri.toString());
                    return true;
                }
                return true;
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                super.onReceivedError(view, request, error);
                if (request != null && request.isForMainFrame()) {
                    String description = error == null ? "未知错误" : String.valueOf(error.getDescription());
                    String failedUrl = request.getUrl() == null ? "" : request.getUrl().toString();
                    if (tryAutoFallbackToBackup(view, failedUrl)) {
                        return;
                    }
                    showLoadError(view, failedUrl, description);
                }
            }

            @Override
            public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse errorResponse) {
                super.onReceivedHttpError(view, request, errorResponse);
                if (request != null && request.isForMainFrame()) {
                    int statusCode = errorResponse == null ? 0 : errorResponse.getStatusCode();
                    String failedUrl = request.getUrl() == null ? "" : request.getUrl().toString();
                    if (tryAutoFallbackToBackup(view, failedUrl)) {
                        return;
                    }
                    showLoadError(view, failedUrl, "HTTP " + statusCode);
                }
            }
        });
    }

    private void injectTvSearchKeyboard(WebView targetWebView) {
        if (targetWebView == null) {
            return;
        }
        try (InputStream stream = getAssets().open("tv-keyboard.js");
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int length;
            while ((length = stream.read(buffer)) != -1) {
                output.write(buffer, 0, length);
            }
            String script = output.toString(StandardCharsets.UTF_8.name());
            targetWebView.evaluateJavascript(script, null);
        } catch (Exception error) {
            android.util.Log.e("JMTV-TV", "注入电视搜索键盘失败", error);
        }
    }

    private void configureFullscreen() {
        getWindow().setFlags(
                WindowManager.LayoutParams.FLAG_FULLSCREEN,
                WindowManager.LayoutParams.FLAG_FULLSCREEN
        );
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        );
    }

    private String normalizeSiteUrl(String siteUrl) {
        if (siteUrl == null || siteUrl.trim().isEmpty()) {
            return "https://libretv.is-an.org";
        }
        return siteUrl.trim();
    }

    private String normalizeOptionalSiteUrl(String siteUrl) {
        if (siteUrl == null) {
            return "";
        }
        return siteUrl.trim();
    }

    private String withAppVersionParam(String siteUrl) {
        String separator = siteUrl.contains("?") ? "&" : "?";
        return siteUrl + separator + "jmtv_device=" + BuildConfig.JMTV_DEVICE_TYPE + "&jmtv_build=" + BuildConfig.LIBRETV_APP_BUILD;
    }

    private boolean tryAutoFallbackToBackup(WebView targetWebView, String failedUrl) {
        if (targetWebView == null || failedUrl == null || failedUrl.isEmpty() || backupSiteUrl == null || backupSiteUrl.isEmpty()) {
            return false;
        }
        if (LINE_MODE_BACKUP.equals(lineMode) || LINE_MODE_BACKUP.equals(loadedLineMode)) {
            return false;
        }
        try {
            Uri failedUri = Uri.parse(failedUrl);
            Uri primaryUri = Uri.parse(primarySiteUrl);
            boolean samePrimaryHost = String.valueOf(failedUri.getScheme()).equalsIgnoreCase(String.valueOf(primaryUri.getScheme()))
                    && String.valueOf(failedUri.getHost()).equalsIgnoreCase(String.valueOf(primaryUri.getHost()))
                    && failedUri.getPort() == primaryUri.getPort();
            if (!samePrimaryHost) {
                return false;
            }
        } catch (Exception ignored) {
            return false;
        }

        // 主线入口失败时静默切到备用线，同时保留设置面板手动切回能力。
        lineMode = LINE_MODE_BACKUP;
        loadedLineMode = LINE_MODE_BACKUP;
        getSharedPreferences(PREFS_NAME, MODE_PRIVATE).edit().putString(PREF_LINE_MODE, lineMode).apply();
        targetWebView.loadUrl(withAppVersionParam(backupSiteUrl));
        return true;
    }

    public class AppBridge {
        @JavascriptInterface
        public boolean hasBackupLine() {
            return backupSiteUrl != null && !backupSiteUrl.isEmpty();
        }

        @JavascriptInterface
        public String getLineMode() {
            return LINE_MODE_BACKUP.equals(lineMode) && hasBackupLine() ? LINE_MODE_BACKUP : LINE_MODE_PRIMARY;
        }

        @JavascriptInterface
        public void setLineMode(String mode) {
            runOnUiThread(() -> {
                lineMode = LINE_MODE_BACKUP.equals(mode) && backupSiteUrl != null && !backupSiteUrl.isEmpty()
                        ? LINE_MODE_BACKUP
                        : LINE_MODE_PRIMARY;
                SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
                prefs.edit().putString(PREF_LINE_MODE, lineMode).apply();
                String targetUrl = LINE_MODE_BACKUP.equals(lineMode) ? backupSiteUrl : primarySiteUrl;
                loadedLineMode = lineMode;
                webView.loadUrl(withAppVersionParam(targetUrl));
            });
        }
    }

    private void showLoadError(WebView targetWebView, String url, String message) {
        String safeUrl = escapeHtml(url);
        String safeMessage = escapeHtml(message);
        String html = "<!doctype html><html><head><meta charset=\"utf-8\">" +
                "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">" +
                "<style>body{margin:0;background:#0f1622;color:#e6f2ff;font-family:sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px;box-sizing:border-box}" +
                ".box{max-width:560px;width:100%;border:1px solid rgba(0,204,255,.25);background:#111;border-radius:8px;padding:20px}" +
                "h1{font-size:22px;margin:0 0 12px}p{color:#9ca3af;line-height:1.6;word-break:break-all}.url{color:#fff}</style></head>" +
                "<body><div class=\"box\"><h1>啾咪视频加载失败</h1>" +
                "<p>请确认服务器已启动、手机能访问该地址，并且 APK 构建时使用了正确的站点地址。</p>" +
                "<p>当前地址：<span class=\"url\">" + safeUrl + "</span></p>" +
                "<p>错误信息：" + safeMessage + "</p></div></body></html>";
        targetWebView.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null);
    }

    private String escapeHtml(String value) {
        if (value == null) {
            return "";
        }
        return value
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;");
    }

    private void hideVideoFullscreen() {
        if (customView == null) {
            return;
        }

        setContentView(webView);
        webView.setVisibility(View.VISIBLE);
        customView = null;
        if (customViewCallback != null) {
            customViewCallback.onCustomViewHidden();
            customViewCallback = null;
        }
        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        setRequestedOrientation(originalOrientation);
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        );
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (event.getAction() == KeyEvent.ACTION_UP && event.getKeyCode() == KeyEvent.KEYCODE_BACK) {
            if (customView != null) {
                hideVideoFullscreen();
                return true;
            }
            if (webView != null && webView.canGoBack()) {
                webView.goBack();
                return true;
            }
        }
        return super.dispatchKeyEvent(event);
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (webView != null) {
            webView.saveState(outState);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        configureFullscreen();
        if (webView != null) {
            webView.onResume();
        }
    }

    @Override
    protected void onPause() {
        if (webView != null) {
            webView.onPause();
        }
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}

