package com.libretv.wrapper;

import android.annotation.SuppressLint;
import android.app.Activity;
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

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLDecoder;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

public class MainActivity extends Activity {
    private static final String LOCAL_APP_ORIGIN = "https://jmtv.local";
    private static final String LOCAL_ASSET_PREFIX = "www/";
    private WebView webView;
    private View customView;
    private WebChromeClient.CustomViewCallback customViewCallback;
    private int originalOrientation;

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

        if (savedInstanceState == null) {
            webView.loadUrl(withAppVersionParam(LOCAL_APP_ORIGIN + "/"));
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
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                if (request == null || request.getUrl() == null) {
                    return null;
                }
                return handleLocalRequest(request.getUrl());
            }

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
                    showLoadError(view, failedUrl, description);
                }
            }

            @Override
            public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse errorResponse) {
                super.onReceivedHttpError(view, request, errorResponse);
                if (request != null && request.isForMainFrame()) {
                    int statusCode = errorResponse == null ? 0 : errorResponse.getStatusCode();
                    String failedUrl = request.getUrl() == null ? "" : request.getUrl().toString();
                    showLoadError(view, failedUrl, "HTTP " + statusCode);
                }
            }
        });
    }

    private WebResourceResponse handleLocalRequest(Uri uri) {
        String host = uri.getHost();
        String path = uri.getPath() == null ? "/" : uri.getPath();
        if (!"jmtv.local".equalsIgnoreCase(host)) {
            return null;
        }
        if (path.startsWith("/proxy/")) {
            return handleProxyRequest(uri);
        }
        if ("/api/live/media".equals(path)) {
            return handleLiveMediaRequest(uri);
        }
        return serveBundledAsset(path);
    }

    private WebResourceResponse serveBundledAsset(String requestPath) {
        String path = requestPath == null || requestPath.trim().isEmpty() ? "/" : requestPath.trim();
        if ("/".equals(path) || "/live".equals(path)) {
            path = "/index.html";
        }
        if (path.startsWith("/")) {
            path = path.substring(1);
        }
        if (path.contains("..") || path.startsWith("api/") || path.startsWith("proxy/")) {
            return createTextResponse("text/plain", 404, "Not Found", "Not Found");
        }

        String assetPath = LOCAL_ASSET_PREFIX + path;
        String mimeType = getMimeType(path);
        try {
            InputStream stream = getAssets().open(assetPath);
            if ("text/html".equals(mimeType)) {
                String html = readText(stream);
                // 本地 App 不依赖服务端 PASSWORD 注入，避免离线入口被部署校验弹窗卡住。
                html = html.replace("{{PASSWORD}}", "");
                return createTextResponse(mimeType, 200, "OK", html);
            }
            return createStreamResponse(mimeType, 200, "OK", stream);
        } catch (Exception error) {
            if (!path.contains(".")) {
                try {
                    InputStream stream = getAssets().open(LOCAL_ASSET_PREFIX + "index.html");
                    String html = readText(stream).replace("{{PASSWORD}}", "");
                    return createTextResponse("text/html", 200, "OK", html);
                } catch (Exception ignored) {
                    return createTextResponse("text/plain", 404, "Not Found", "Not Found");
                }
            }
            return createTextResponse("text/plain", 404, "Not Found", "Not Found");
        }
    }

    private WebResourceResponse handleProxyRequest(Uri uri) {
        try {
            String encodedPath = uri.getEncodedPath() == null ? "" : uri.getEncodedPath();
            String encodedTarget = encodedPath.length() > "/proxy/".length()
                    ? encodedPath.substring("/proxy/".length())
                    : "";
            String targetUrl = URLDecoder.decode(encodedTarget, StandardCharsets.UTF_8.name());
            return fetchRemoteResource(targetUrl, false, uri.getQueryParameter("ua"));
        } catch (Exception error) {
            return createTextResponse("text/plain", 502, "Bad Gateway", "App本地代理请求失败: " + error.getMessage());
        }
    }

    private WebResourceResponse handleLiveMediaRequest(Uri uri) {
        try {
            String targetUrl = uri.getQueryParameter("url");
            boolean playlist = "1".equals(uri.getQueryParameter("playlist"));
            return fetchRemoteResource(targetUrl, playlist, null);
        } catch (Exception error) {
            return createTextResponse("text/plain", 502, "Bad Gateway", "App直播代理请求失败: " + error.getMessage());
        }
    }

    private WebResourceResponse fetchRemoteResource(String targetUrl, boolean forcePlaylistRewrite, String customUserAgent) {
        if (targetUrl == null || targetUrl.trim().isEmpty()) {
            return createTextResponse("text/plain", 400, "Bad Request", "缺少目标URL");
        }
        String normalizedUrl = targetUrl.trim();
        if (!normalizedUrl.startsWith("http://") && !normalizedUrl.startsWith("https://")) {
            return createTextResponse("text/plain", 400, "Bad Request", "仅支持HTTP/HTTPS URL");
        }

        try {
            URL remoteUrl = new URL(normalizedUrl);
            HttpURLConnection connection = (HttpURLConnection) remoteUrl.openConnection();
            connection.setInstanceFollowRedirects(true);
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(30000);
            String requestUserAgent = customUserAgent == null || customUserAgent.trim().isEmpty()
                    ? "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/121.0.0.0 Mobile Safari/537.36"
                    : customUserAgent.trim();
            connection.setRequestProperty("User-Agent", requestUserAgent);
            String remoteHost = String.valueOf(remoteUrl.getHost()).toLowerCase(Locale.ROOT);
            boolean isDoubanImage = remoteHost.equals("doubanio.com")
                    || remoteHost.endsWith(".doubanio.com")
                    || remoteHost.equals("douban.com")
                    || remoteHost.endsWith(".douban.com");
            if (isDoubanImage) {
                // 豆瓣封面存在来源校验，缺少 Referer 时会返回 418。
                connection.setRequestProperty("Referer", "https://movie.douban.com/");
                connection.setRequestProperty("Accept", "image/avif,image/webp,image/apng,image/*,*/*;q=0.8");
            } else {
                connection.setRequestProperty("Accept", "*/*");
            }
            int statusCode = connection.getResponseCode();
            InputStream stream = statusCode >= 400 ? connection.getErrorStream() : connection.getInputStream();
            if (stream == null) {
                stream = new ByteArrayInputStream(new byte[0]);
            }

            String contentType = connection.getContentType();
            String mimeType = normalizeMimeType(contentType, normalizedUrl);
            boolean isPlaylist = forcePlaylistRewrite
                    || normalizedUrl.toLowerCase(Locale.ROOT).contains(".m3u8")
                    || String.valueOf(contentType).toLowerCase(Locale.ROOT).contains("mpegurl");
            if (isPlaylist) {
                String rewritten = rewriteLivePlaylist(readText(stream), normalizedUrl);
                return createTextResponse("application/vnd.apple.mpegurl", statusCode, "OK", rewritten);
            }
            return createStreamResponse(mimeType, statusCode, "OK", stream);
        } catch (Exception error) {
            return createTextResponse("text/plain", 502, "Bad Gateway", "远程请求失败: " + error.getMessage());
        }
    }

    private String rewriteLivePlaylist(String content, String baseUrl) {
        String[] lines = String.valueOf(content).split("\\r?\\n", -1);
        StringBuilder builder = new StringBuilder();
        for (String rawLine : lines) {
            String line = rawLine.trim();
            if (line.isEmpty()) {
                builder.append(rawLine).append('\n');
                continue;
            }
            if (line.startsWith("#")) {
                String rewritten = rawLine;
                int searchFrom = 0;
                while (true) {
                    int keyIndex = rewritten.indexOf("URI=" + '"', searchFrom);
                    if (keyIndex < 0) {
                        break;
                    }
                    int valueStart = keyIndex + 5;
                    int valueEnd = rewritten.indexOf('"', valueStart);
                    if (valueEnd < 0) {
                        break;
                    }
                    try {
                        String target = new URL(new URL(baseUrl), rewritten.substring(valueStart, valueEnd)).toString();
                        String replacement = LOCAL_APP_ORIGIN + "/api/live/media?url=" + encodeUrl(target);
                        rewritten = rewritten.substring(0, valueStart) + replacement + rewritten.substring(valueEnd);
                        searchFrom = valueStart + replacement.length();
                    } catch (Exception ignored) {
                        searchFrom = valueEnd + 1;
                    }
                }
                builder.append(rewritten).append('\n');
                continue;
            }
            try {
                String target = new URL(new URL(baseUrl), line).toString();
                String playlistFlag = target.toLowerCase(Locale.ROOT).contains(".m3u8") ? "&playlist=1" : "";
                builder.append(LOCAL_APP_ORIGIN)
                        .append("/api/live/media?url=")
                        .append(encodeUrl(target))
                        .append(playlistFlag)
                        .append('\n');
            } catch (Exception ignored) {
                builder.append(rawLine).append('\n');
            }
        }
        return builder.toString();
    }

    private String readText(InputStream stream) throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int length;
        while ((length = stream.read(buffer)) != -1) {
            output.write(buffer, 0, length);
        }
        stream.close();
        return output.toString(StandardCharsets.UTF_8.name());
    }

    private WebResourceResponse createTextResponse(String mimeType, int statusCode, String reason, String body) {
        return createStreamResponse(
                mimeType,
                statusCode,
                reason,
                new ByteArrayInputStream(String.valueOf(body).getBytes(StandardCharsets.UTF_8))
        );
    }

    private WebResourceResponse createStreamResponse(String mimeType, int statusCode, String reason, InputStream stream) {
        Map<String, String> headers = new HashMap<>();
        headers.put("Access-Control-Allow-Origin", "*");
        headers.put("Cache-Control", "no-store");
        return new WebResourceResponse(
                mimeType,
                "UTF-8",
                statusCode,
                reason == null ? "OK" : reason,
                headers,
                stream
        );
    }

    private String getMimeType(String path) {
        String lowerPath = String.valueOf(path).toLowerCase(Locale.ROOT);
        if (lowerPath.endsWith(".html")) return "text/html";
        if (lowerPath.endsWith(".js")) return "application/javascript";
        if (lowerPath.endsWith(".css")) return "text/css";
        if (lowerPath.endsWith(".json")) return "application/json";
        if (lowerPath.endsWith(".png")) return "image/png";
        if (lowerPath.endsWith(".jpg") || lowerPath.endsWith(".jpeg")) return "image/jpeg";
        if (lowerPath.endsWith(".svg")) return "image/svg+xml";
        if (lowerPath.endsWith(".ico")) return "image/x-icon";
        if (lowerPath.endsWith(".txt")) return "text/plain";
        return "application/octet-stream";
    }

    private String normalizeMimeType(String contentType, String targetUrl) {
        if (contentType != null && !contentType.trim().isEmpty()) {
            return contentType.split(";", 2)[0].trim();
        }
        return getMimeType(targetUrl);
    }

    private String encodeUrl(String value) throws Exception {
        return URLEncoder.encode(value, StandardCharsets.UTF_8.name()).replace("+", "%20");
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

    private String withAppVersionParam(String siteUrl) {
        String separator = siteUrl.contains("?") ? "&" : "?";
        return siteUrl + separator + "jmtv_device=" + BuildConfig.JMTV_DEVICE_TYPE + "&jmtv_build=" + BuildConfig.LIBRETV_APP_BUILD;
    }

    public class AppBridge {
        @JavascriptInterface
        public boolean isLocalBundle() {
            return true;
        }

        @JavascriptInterface
        public boolean hasBackupLine() {
            return false;
        }

        @JavascriptInterface
        public String getLineMode() {
            return "primary";
        }

        @JavascriptInterface
        public void setLineMode(String mode) {
            runOnUiThread(() -> webView.loadUrl(withAppVersionParam(LOCAL_APP_ORIGIN + "/")));
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
                "<p>请确认 APK 内置资源完整，并尝试清除 App 数据后重新打开。</p>" +
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

