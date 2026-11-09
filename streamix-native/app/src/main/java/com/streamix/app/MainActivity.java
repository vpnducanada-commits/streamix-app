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
        // Certains catalogues mélangent https et http (affiches, bandes-annonces, liens
        // de redirection) : sans ce mode, ces contenus sont bloqués par le WebView.
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);

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
                // Fondu doux entre deux pages du site (jamais sur l'écran de code local).
                if (url != null && (url.startsWith("http://") || url.startsWith("https://"))) {
                    view.animate().cancel();
                    view.animate().alpha(0.15f).setDuration(140).start();
                    pageFadeGuard(view);
                }
            }

            @Override
            public void onPageCommitVisible(WebView view, String url) {
                updateSiteChrome(url);
                fadeInPage(view);
            }

            @Override
            public boolean onRenderProcessGone(WebView view, android.webkit.RenderProcessGoneDetail detail) {
                // Le moteur WebView a été tué par le système : on relance proprement l'écran.
                if (view != null) {
                    android.view.ViewParent parent = view.getParent();
                    if (parent instanceof ViewGroup) ((ViewGroup) parent).removeView(view);
                    view.destroy();
                }
                recreate();
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                fadeInPage(view);
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
                String url = view.getUrl();
                if (url == null || !(url.startsWith("http://") || url.startsWith("https://"))) return;
                animateProgress(newProgress);
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

        // Téléchargements (mise à jour de l'APK depuis la bannière) : sans cela,
        // cliquer sur le lien ne faisait rien du tout dans un WebView.
        webView.setDownloadListener(new android.webkit.DownloadListener() {
            @Override
            public void onDownloadStart(String url, String userAgent, String contentDisposition,
                                        String mimeType, long contentLength) {
                if (url == null || !(url.startsWith("http://") || url.startsWith("https://"))) return;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                } catch (ActivityNotFoundException ignored) { }
            }
        });

        // Page locale : écran de code.
        // La version réelle de l'APK est transmise à la page (?v=…) : la bannière
        // « mise à jour » ne s'affiche que si le serveur propose mieux.
        webView.loadUrl(lockPageUrl(false));

        // Rappel quotidien « C'est l'heure du visionnage ».
        NotificationHelper.ensureChannel(this);
        ReminderScheduler.schedule(this);
        askNotificationPermission();
    }

    /** URL de l'écran de code, avec la version installée (et l'option de verrouillage). */
    private String lockPageUrl(boolean lock) {
        int code = 0;
        try {
            code = getPackageManager().getPackageInfo(getPackageName(), 0).versionCode;
        } catch (Exception ignored) { }
        return LOCK_PAGE + "?v=" + code + (lock ? "&lock=1" : "");
    }

    // ---------- Animations d'interface ----------

    private android.os.Handler uiHandler = new android.os.Handler(android.os.Looper.getMainLooper());
    private Runnable pageFadeGuardRun;

    /** Fondu d'apparition du contenu d'une page. */
    private void fadeInPage(View view) {
        if (view == null) return;
        if (pageFadeGuardRun != null) uiHandler.removeCallbacks(pageFadeGuardRun);
        view.animate().cancel();
        view.animate().alpha(1f).setDuration(260).start();
    }

    /** Filet de sécurité : le contenu ne doit jamais rester invisible. */
    private void pageFadeGuard(View view) {
        if (pageFadeGuardRun != null) uiHandler.removeCallbacks(pageFadeGuardRun);
        pageFadeGuardRun = new Runnable() {
            @Override public void run() { fadeInPage(view); }
        };
        uiHandler.postDelayed(pageFadeGuardRun, 1400);
    }

    /** Barre de chargement : apparition et disparition en fondu, sans saut. */
    private void animateProgress(int newProgress) {
        if (progressBar == null) return;
        progressBar.setProgress(newProgress);
        if (newProgress < 100) {
            if (progressBar.getVisibility() != View.VISIBLE) {
                progressBar.setAlpha(0f);
                progressBar.setVisibility(View.VISIBLE);
                progressBar.animate().alpha(1f).setDuration(180).start();
            }
        } else {
            progressBar.animate().alpha(0f).setDuration(240).withEndAction(new Runnable() {
                @Override public void run() {
                    if (progressBar != null) progressBar.setVisibility(View.GONE);
                }
            }).start();
        }
    }

    /** Apparition de la bande de marque en haut. */
    private void animateChrome(boolean show) {
        View[] views = new View[]{nativeBanner, siteOverlay};
        for (View v : views) {
            if (v == null) continue;
            v.animate().cancel();
            if (show) {
                if (v.getVisibility() != View.VISIBLE) {
                    v.setAlpha(0f);
                    v.setTranslationY(-18f);
                    v.setVisibility(View.VISIBLE);
                    v.animate().alpha(1f).translationY(0f).setDuration(320).start();
                }
            } else {
                v.animate().alpha(0f).setDuration(220).withEndAction(new Runnable() {
                    @Override public void run() { v.setVisibility(View.GONE); v.setAlpha(1f); }
                }).start();
            }
        }
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
        animateChrome(show);
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
        fullscreenContainer.setAlpha(0f);
        fullscreenContainer.setVisibility(View.VISIBLE);
        fullscreenContainer.animate().alpha(1f).setDuration(220).start();
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
        if (url == null) return false;
        Uri uri = Uri.parse(url);
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase();
        String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase();

        boolean isWhatsApp = "wa.me".equals(host) || "api.whatsapp.com".equals(host)
                || "whatsapp.com".equals(host) || "com.whatsapp".equals(scheme);
        boolean isPhone = "tel".equals(scheme) || "sms".equals(scheme) || "mailto".equals(scheme);
        if (!isWhatsApp && !isPhone) return false;

        Intent intent = new Intent(Intent.ACTION_VIEW, uri);
        if (isWhatsApp) intent.setPackage("com.whatsapp");
        try {
            startActivity(intent);
            return true;
        } catch (ActivityNotFoundException e) {
            try {
                Intent fallback = new Intent(Intent.ACTION_VIEW, uri);
                fallback.setPackage(null);
                startActivity(fallback);
                return true;
            } catch (ActivityNotFoundException ignored) {
                return false;
            }
        }
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
                webView.loadUrl(lockPageUrl(true));
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
