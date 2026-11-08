package com.streamix.app;

import android.annotation.SuppressLint;
import android.content.SharedPreferences;
import android.graphics.PixelFormat;
import android.os.Bundle;
import android.view.MotionEvent;
import android.view.View;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.ImageButton;
import android.widget.ProgressBar;

import androidx.appcompat.app.AppCompatActivity;

public class MainActivity extends AppCompatActivity {

    private WebView webView;
    private View topBar;
    private EditText urlInput;
    private ProgressBar progressBar;
    private ImageButton lockBtn;
    private SharedPreferences prefs;
    private float touchStartY;
    private float touchStartX;
    private boolean barVisible = false;
    private boolean gestureActive = false;
    private long lastTouchTime = 0;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        prefs = getSharedPreferences("streamix", MODE_PRIVATE);

        webView = findViewById(R.id.webView);
        topBar = findViewById(R.id.topBar);
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

        // WebViewClient interne — TOUTE navigation reste dans le WebView
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                // Ne jamais externaliser — charger toujours dans le WebView
                view.loadUrl(url);
                return true;
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
                url = "https://www.google.com";
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
            webView.loadUrl("file:///android_asset/www/index.html");
            urlInput.setText("");
            hideBar();
        });

        // Geste 3 doigts pour basculer la barre
        webView.setOnTouchListener(new View.OnTouchListener() {
            @Override
            public boolean onTouch(View v, MotionEvent event) {
                int action = event.getActionMasked();

                switch (action) {
                    case MotionEvent.ACTION_DOWN:
                        touchStartX = event.getX();
                        touchStartY = event.getY();
                        gestureActive = false;
                        lastTouchTime = System.currentTimeMillis();
                        break;

                    case MotionEvent.ACTION_MOVE:
                        if (event.getPointerCount() >= 3 && !gestureActive) {
                            // 3 doigts — basculer la barre
                            if (!barVisible) {
                                showBar();
                            } else {
                                hideBar();
                            }
                            gestureActive = true;
                            return true;
                        }
                        break;

                    case MotionEvent.ACTION_UP:
                        // Double tap pour basculer la barre (si pas de geste)
                        if (!gestureActive && event.getPointerCount() == 1) {
                            long now = System.currentTimeMillis();
                            if (now - lastTouchTime < 300) {
                                if (barVisible) hideBar();
                                else showBar();
                            }
                            lastTouchTime = now;
                        }
                        break;
                }
                return false;
            }
        });
    }

    private void updateUrlDisplay(String url) {
        if (url != null && !url.isEmpty() && !url.startsWith("file://")) {
            urlInput.setText(url);
        }
    }

    private void showBar() {
        barVisible = true;
        topBar.setVisibility(View.VISIBLE);
        topBar.animate().translationY(0).alpha(1).setDuration(250).start();
        urlInput.setText(webView.getUrl());
    }

    private void hideBar() {
        barVisible = false;
        topBar.animate().translationY(-topBar.getHeight()).alpha(0).setDuration(250).start();
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
