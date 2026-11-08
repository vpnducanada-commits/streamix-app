import pathlib
p = pathlib.Path('/home/user/streamix/index.html')
html = p.read_text()

# Ajouter le popup bienvenue dans browserContent juste après l'iframe
old_iframe = '''    <iframe id="webFrame" src="https://www.apple.com" allow="fullscreen; autoplay; clipboard-read; clipboard-write" sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-downloads"></iframe>
  </div>
</div>'''

new_iframe = '''    <iframe id="webFrame" src="https://www.apple.com" allow="fullscreen; autoplay; clipboard-read; clipboard-write" sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-downloads"></iframe>
    <div id="welcomePopup" class="welcome-popup">
      <div class="welcome-popup-card">
        <div class="welcome-popup-logo"><svg width="28" height="28" viewBox="0 0 42 42" fill="none"><path d="M21 5L35.5 12.5V28L21 35.5L6.5 28V12.5L21 5Z" stroke="#E50914" stroke-width="2.5" fill="rgba(229,9,20,0.15)"/><path d="M17 14L26 21L17 28V14Z" fill="#E50914"/></svg></div>
        <h2>Bienvenue sur Streamix</h2>
        <p>Ton accès est validé. Bonne navigation !</p>
        <button class="btn-primary" onclick="closeWelcomePopup()">CONTINUER →</button>
      </div>
    </div>
  </div>
</div>'''

if old_iframe in html:
    html = html.replace(old_iframe, new_iframe)
    p.write_text(html)
    print("popup html added")
else:
    print("old_iframe not found")
    # debug
    print(html[html.find('id="webFrame"')-100:html.find('id="webFrame"')+500])
