package com.streamix.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ProgressBar;

import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

/**
 * Streamix — coque native autour du site.
 * Plus aucune barre de navigation : le site occupe tout l'écran et la lecture
 * en plein écran des vidéos est prise en charge par le WebView.
 */
public class MainActivity extends AppCompatActivity {

    private static final String LOCK_PAGE = "file:///android_asset/www/index.html";
    private static final int NOTIFICATION_REQUEST_CODE = 1001;

    private WebView webView;
    private ProgressBar progressBar;
    private FrameLayout fullscreenContainer;
    private View nativeBanner;
    private View siteOverlay;

    private View fullscreenView;
    private WebChromeClient.CustomViewCallback fullscreenCallback;
    private int orientationBeforeFullscreen = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED;

    private boolean clearingHistory = false;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.webView);
        progressBar = findViewById(R.id.progressBar);
        fullscreenContainer = findViewById(R.id.fullscreenContainer);
        nativeBanner = findViewById(R.id.nativeBanner);
        siteOverlay = findViewById(R.id.siteOverlay);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setGeolocationEnabled(true);
        // La page locale (file://) doit pouvoir appeler l'API Streamix en HTTPS.
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setAllowUniversalAccessFromFileURLs(true);

        // Toute la navigation reste dans le WebView (seul WhatsApp sort de l'application).
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleExternalLink(url);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handleExternalLink(request.getUrl().toString());
            }

            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                updateSiteChrome(url);
            }

            @Override
            public void onPageCommitVisible(WebView view, String url) {
                updateSiteChrome(url);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (clearingHistory && url != null && url.startsWith(LOCK_PAGE)) {
                    view.clearHistory();
                    clearingHistory = false;
                }
            }
        });

        // Barre de progression + prise en charge du plein écran vidéo.
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                progressBar.setProgress(newProgress);
                progressBar.setVisibility(newProgress == 100 ? View.GONE : View.VISIBLE);
            }

            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                enterFullscreen(view, callback);
            }

            @Override
            public void onHideCustomView() {
                exitFullscreen();
            }
        });

        // Page locale : écran de code.
        webView.loadUrl(LOCK_PAGE);

        // Rappel quotidien « C'est l'heure du visionnage ».
        NotificationHelper.ensureChannel(this);
        ReminderScheduler.schedule(this);
        askNotificationPermission();
    }

    /** Android 13+ : la notification n'est possible qu'après l'accord de l'utilisateur. */
    private void askNotificationPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return;
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED) return;
        ActivityCompat.requestPermissions(this,
                new String[]{Manifest.permission.POST_NOTIFICATIONS},
                NOTIFICATION_REQUEST_CODE);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == NOTIFICATION_REQUEST_CODE) {
            ReminderScheduler.schedule(this);
        }
    }

    /**
     * Bande de marque en haut + voile latéral + filigrane en bas à gauche :
     * uniquement sur les pages du site (après validation du code), jamais sur l'écran de code,
     * et jamais pendant une lecture en plein écran.
     */
    private void updateSiteChrome(String url) {
        boolean remote = url != null && (url.startsWith("http://") || url.startsWith("https://"));
        boolean show = remote && fullscreenView == null;
        int visibility = show ? View.VISIBLE : View.GONE;
        if (nativeBanner != null) nativeBanner.setVisibility(visibility);
        if (siteOverlay != null) siteOverlay.setVisibility(visibility);
    }

    // ---------- Plein écran vidéo ----------

    private void enterFullscreen(View view, WebChromeClient.CustomViewCallback callback) {
        if (fullscreenView != null) {
            // Un plein écran est déjà en cours : on refuse le second.
            callback.onCustomViewHidden();
            return;
        }
        fullscreenView = view;
        fullscreenCallback = callback;

        fullscreenContainer.addView(view, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));
        fullscreenContainer.setVisibility(View.VISIBLE);
        webView.setVisibility(View.INVISIBLE);
        progressBar.setVisibility(View.GONE);
        // La bande de marque et le filigrane disparaissent pendant la lecture.
        if (nativeBanner != null) nativeBanner.setVisibility(View.GONE);
        if (siteOverlay != null) siteOverlay.setVisibility(View.GONE);

        orientationBeforeFullscreen = getRequestedOrientation();
        // Laisse tourner l'écran librement : la vidéo s'affiche en paysage si l'appareil pivote.
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR);

        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        hideSystemUi();
    }

    private void exitFullscreen() {
        if (fullscreenView == null) return;

        fullscreenContainer.removeView(fullscreenView);
        fullscreenView = null;
        fullscreenContainer.setVisibility(View.GONE);
        webView.setVisibility(View.VISIBLE);

        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        setRequestedOrientation(orientationBeforeFullscreen);
        showSystemUi();
        updateSiteChrome(webView.getUrl());

        if (fullscreenCallback != null) {
            fullscreenCallback.onCustomViewHidden();
            fullscreenCallback = null;
        }
    }

    private void hideSystemUi() {
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
    }

    private void showSystemUi() {
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
    }

    // ---------- Liens sortants ----------

    // WhatsApp est le seul lien sortant prévu : les autres pages restent dans la WebView.
    private boolean handleExternalLink(String url) {
        Uri uri = Uri.parse(url);
        if (!"wa.me".equalsIgnoreCase(uri.getHost()) || !"/24166196414".equals(uri.getPath())) return false;
        Intent whatsapp = new Intent(Intent.ACTION_VIEW, uri);
        whatsapp.setPackage("com.whatsapp");
        try {
            startActivity(whatsapp);
        } catch (ActivityNotFoundException e) {
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
            } catch (ActivityNotFoundException ignored) {
                return false;
            }
        }
        return true;
    }

    // ---------- Cycle de vie ----------

    @Override
    public void onBackPressed() {
        if (fullscreenView != null) {
            exitFullscreen();
            return;
        }
        String current = webView == null ? null : webView.getUrl();
        boolean onLockPage = current != null && current.startsWith(LOCK_PAGE);

        if (!onLockPage) {
            if (webView.canGoBack()) {
                webView.goBack();
            } else {
                // Retour à l'écran de code : plus de bouton de verrouillage dans l'interface.
                clearingHistory = true;
                webView.loadUrl(LOCK_PAGE + "?lock=1");
            }
            return;
        }
        super.onBackPressed();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) webView.onResume();
        if (fullscreenView != null) hideSystemUi();
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (webView != null) webView.onPause();
    }

    @Override
    protected void onDestroy() {
        if (fullscreenView != null) exitFullscreen();
        super.onDestroy();
    }
}
