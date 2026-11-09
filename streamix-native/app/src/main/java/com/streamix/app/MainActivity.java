package com.streamix.app;

import android.annotation.SuppressLint;
import android.content.SharedPreferences;
import android.content.Intent;
import android.content.ActivityNotFoundException;
import android.net.Uri;
import android.graphics.Bitmap;
import android.os.Bundle;
import android.view.MotionEvent;
import android.view.View;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import android.widget.EditText;
import android.widget.ImageButton;
import android.widget.ProgressBar;

import androidx.appcompat.app.AppCompatActivity;

public class MainActivity extends AppCompatActivity {

    private WebView webView;
    private View topBar;
    private View nativeBanner;
    private EditText urlInput;
    private ProgressBar progressBar;
    private ImageButton lockBtn;
    private SharedPreferences prefs;
    private boolean barVisible = false;
    private boolean clearingHistory = false;
    // Geste d'ouverture de la barre : double appui simultane a deux doigts
    private boolean twoFingerDown = false;
    private boolean twoFingerMoved = false;
    private long twoFingerStartMs = 0;
    private long twoFingerTapLastMs = 0;
    private float twoFingerX = 0f;
    private float twoFingerY = 0f;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        prefs = getSharedPreferences("streamix", MODE_PRIVATE);

        webView = findViewById(R.id.webView);
        topBar = findViewById(R.id.topBar);
        nativeBanner = findViewById(R.id.nativeBanner);
        urlInput = findViewById(R.id.urlInput);
        progressBar = findViewById(R.id.progressBar);
        lockBtn = findViewById(R.id.lockBtn);
        ImageButton goBtn = findViewById(R.id.goBtn);
        ImageButton backBtn = findViewById(R.id.backBtn);
        ImageButton forwardBtn = findViewById(R.id.forwardBtn);
        ImageButton refreshBtn = findViewById(R.id.refreshBtn);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setGeolocationEnabled(true);
        // La page locale (file://) doit pouvoir appeler l'API Streamix en HTTPS.
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setAllowUniversalAccessFromFileURLs(true);

        // WebViewClient interne — TOUTE navigation reste dans le WebView
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
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                nativeBanner.setVisibility(url != null && (url.startsWith("https://") || url.startsWith("http://")) ? View.VISIBLE : View.GONE);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (clearingHistory && url.startsWith("file:///android_asset/www/index.html")) {
                    view.clearHistory();
                    clearingHistory = false;
                }
            }

            @Override
            public void onPageCommitVisible(WebView view, String url) {
                updateUrlDisplay(url);
            }
        });

        // WebChromeClient pour progress bar et titre
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                progressBar.setProgress(newProgress);
                progressBar.setVisibility(newProgress == 100 ? View.GONE : View.VISIBLE);
            }

            @Override
            public void onReceivedTitle(WebView view, String title) {
                if (title != null && !title.isEmpty()) {
                    // Mettre à jour l'URL dans la barre si vide
                    if (urlInput.getText().toString().isEmpty()) {
                        updateUrlDisplay(webView.getUrl());
                    }
                }
            }
        });

        // Charger la page web locale
        webView.loadUrl("file:///android_asset/www/index.html");

        // Bouton GO
        goBtn.setOnClickListener(v -> {
            String url = urlInput.getText().toString().trim();
            if (url.isEmpty()) {
                url = "https://vod.talis.top/";
            }
            if (!url.startsWith("http://") && !url.startsWith("https://")) {
                url = "https://" + url;
            }
            webView.loadUrl(url);
            hideBar();
        });

        // Bouton BACK
        backBtn.setOnClickListener(v -> {
            if (webView.canGoBack()) {
                webView.goBack();
            } else {
                webView.loadUrl("file:///android_asset/www/index.html");
            }
        });

        // Bouton FORWARD
        forwardBtn.setOnClickListener(v -> {
            if (webView.canGoForward()) {
                webView.goForward();
            }
        });

        // Bouton REFRESH
        refreshBtn.setOnClickListener(v -> webView.reload());

        // Bouton LOCK — retour à l'écran de code
        lockBtn.setOnClickListener(v -> {
            clearingHistory = true;
            webView.loadUrl("file:///android_asset/www/index.html?lock=1");
            urlInput.setText("");
            hideBar();
        });

        // Barre d'acces : double appui simultane a deux doigts uniquement
        webView.setOnTouchListener(new View.OnTouchListener() {
            @Override
            public boolean onTouch(View v, MotionEvent event) {
                float slop = 24f * getResources().getDisplayMetrics().density;

                switch (event.getActionMasked()) {
                    case MotionEvent.ACTION_POINTER_DOWN:
                        if (event.getPointerCount() == 2) {
                            twoFingerDown = true;
                            twoFingerMoved = false;
                            twoFingerStartMs = System.currentTimeMillis();
                            twoFingerX = event.getX(0);
                            twoFingerY = event.getY(0);
                        }
                        break;

                    case MotionEvent.ACTION_MOVE:
                        if (twoFingerDown) {
                            if (Math.abs(event.getX(0) - twoFingerX) > slop
                                    || Math.abs(event.getY(0) - twoFingerY) > slop) {
                                twoFingerMoved = true;
                            }
                        }
                        break;

                    case MotionEvent.ACTION_POINTER_UP:
                        if (twoFingerDown && event.getPointerCount() == 2) {
                            long held = System.currentTimeMillis() - twoFingerStartMs;
                            twoFingerDown = false;
                            if (!twoFingerMoved && held < 450) {
                                registerTwoFingerTap();
                            }
                        }
                        break;

                    case MotionEvent.ACTION_UP:
                    case MotionEvent.ACTION_CANCEL:
                        twoFingerDown = false;
                        break;
                }
                // false : la WebView continue de gerer le defilement et les clics normalement
                return false;
            }
        });
    }

    // Deux appuis a deux doigts rapproches (< 650 ms) ouvrent/ferment la barre de recherche.
    private void registerTwoFingerTap() {
        long now = System.currentTimeMillis();
        if (twoFingerTapLastMs != 0 && now - twoFingerTapLastMs <= 650) {
            twoFingerTapLastMs = 0;
            if (barVisible) {
                hideBar();
            } else {
                showBar();
            }
            if (webView != null) {
                webView.performHapticFeedback(android.view.HapticFeedbackConstants.VIRTUAL_KEY);
            }
        } else {
            twoFingerTapLastMs = now;
        }
    }

    // WhatsApp est le seul lien sortant prévu : les autres pages restent dans la WebView.
    private boolean handleExternalLink(String url) {
        Uri uri = Uri.parse(url);
        if (!"wa.me".equalsIgnoreCase(uri.getHost()) || !"/24166196414".equals(uri.getPath())) return false;
        Intent whatsapp = new Intent(Intent.ACTION_VIEW, uri);
        whatsapp.setPackage("com.whatsapp");
        try {
            startActivity(whatsapp);
        } catch (ActivityNotFoundException e) {
            try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); }
            catch (ActivityNotFoundException ignored) { return false; }
        }
        return true;
    }

    private void updateUrlDisplay(String url) {
        if (url != null && !url.isEmpty() && !url.startsWith("file://")) {
            urlInput.setText(url);
        }
    }

    private void showBar() {
        barVisible = true;
        topBar.animate().cancel();
        topBar.setVisibility(View.VISIBLE);
        topBar.animate().translationY(0).alpha(1).setDuration(250).start();
        urlInput.setText(webView.getUrl());
    }

    private void hideBar() {
        barVisible = false;
        topBar.animate().translationY(-topBar.getHeight()).alpha(0).setDuration(250)
                .withEndAction(() -> { if (!barVisible) topBar.setVisibility(View.GONE); }).start();
    }

    @Override
    public void onBackPressed() {
        if (barVisible) {
            hideBar();
        } else if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) {
            webView.onResume();
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (webView != null) {
            webView.onPause();
        }
    }
}
