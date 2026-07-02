
  function openIndex() {
    if (window.innerWidth <= 600) {
      openBottomSheet();
    } else {
      openDrawer();
    }
  }

  function openDrawer() {
    closeCast();
    buildDrawer();
    document.getElementById('overlay').classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeDrawer() {
    document.getElementById('overlay').classList.remove('open');
    document.body.style.overflow = '';
  }
  function jumpTo(id) {
    closeDrawer();
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    updateActive(id);
  }

  function openCast() {
    closeDrawer();
    buildCast();
    document.getElementById('castOverlay').classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeCast() {
    document.getElementById('castOverlay').classList.remove('open');
    document.body.style.overflow = '';
  }

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    closeDrawer();
    closeCast();
    closeCastSheet();
  });

  function toggleSwitcher(event) {
    event.stopPropagation();
    const dd = document.getElementById('recDropdown');
    if (!dd) return;
    if (dd.classList.contains('open')) {
      dd.classList.remove('open');
    } else {
      dd.classList.add('open');
      setTimeout(() => document.addEventListener('click', closeSwitcherOnOutside, { once: true }), 0);
    }
  }
  function closeSwitcherOnOutside() {
    const dd = document.getElementById('recDropdown');
    if (dd) dd.classList.remove('open');
  }

  function buildSwitcherDropdown() {
    const dd = document.getElementById('recDropdown');
    if (!dd) return;
    dd.innerHTML = Object.entries(RECORDINGS).map(([key, rec]) =>
      `<div class="recording-option${key === activeRecording ? ' active' : ''}" onclick="switchRecording('${key}')">${rec.label}</div>`
    ).join('');
  }

  function buildDrawer() {
    const rec = RECORDINGS[activeRecording];
    const body = document.getElementById('drawerBody');
    let html = '';
    let lastGroup = null;
    const activeTrack = findBestTrack(rec, currentActiveId);

    for (const t of rec.tracks) {
      const group = t.cd + '-' + t.act;
      if (group !== lastGroup) {
        html += `<div class="drawer-cd-label">Disc ${t.cd} — ${t.act}</div>`;
        lastGroup = group;
      }
      const isActive = activeTrack && t.id === activeTrack.id;
      const spotifyBtn = t.spotify_uri
        ? `<a class="drawer-track-spotify" href="${t.spotify_uri}" target="_blank" rel="noopener" onclick="event.stopPropagation()" aria-label="Play on Spotify"><svg viewBox="0 0 24 24" fill="none"><path d="M8 5v14l11-7L8 5Z" fill="white"/></svg></a>`
        : '';
      html += `<div class="drawer-track${isActive ? ' active' : ''}" id="idx-${t.id}" onclick="jumpTo('${t.id}')">
        <span class="drawer-track-num">${t.track}</span>
        <div class="drawer-track-info">
          <span class="drawer-track-title">${t.title}</span>
          <span class="drawer-track-act">${t.act}</span>
        </div>
        ${spotifyBtn}
      </div>`;
    }

    body.innerHTML = html;
  }

  function buildCast() {
    const cast = CAST[activeRecording];
    const tbody = document.getElementById('castTableBody');
    tbody.innerHTML = CHARACTERS.map(ch => {
      const singer = cast[ch.id];
      return `<tr>
        <td>
          <div class="cast-char-name">${ch.name}</div>
          <div class="cast-voice">${ch.voice}</div>
          <div class="cast-description">${ch.description}</div>
        </td>
        <td>
          ${singer
            ? `<div class="cast-singer">${singer}</div>`
            : `<div class="cast-singer empty">—</div>`}
        </td>
      </tr>`;
    }).join('');
  }

  function applyTooltips() {
    const cast = CAST[activeRecording];
    document.querySelectorAll('.character-name.has-tooltip').forEach(el => {
      const id = el.dataset.characterId;
      const ch = CHARACTERS.find(c => c.id === id);
      if (!ch) return;
      const singer = cast[id];
      el.setAttribute('data-tooltip',
        singer ? `${ch.voice} · ${singer}` : ch.voice
      );
    });
  }

  function updateTrackTags() {
    document.querySelectorAll('.track-tag').forEach(tag => { tag.style.visibility = 'hidden'; });
    const rec = RECORDINGS[activeRecording];
    const seen = new Set();
    for (const t of rec.tracks) {
      if (!t.has_block) continue;
      const suffix = t.id.slice(1);
      if (seen.has(suffix)) continue;
      seen.add(suffix);
      const tc = document.getElementById('tc' + suffix);
      if (!tc) continue;
      const tag = tc.querySelector('.track-tag');
      if (!tag) continue;
      tag.style.visibility = 'visible';
      tag.innerHTML = `<span class="track-tag-cd">CD${t.cd}</span><span class="track-tag-num">${t.track}</span>`;
    }
  }

  function findBestTrack(rec, activeId) {
    const currentIdx = parseInt(activeId.slice(1), 10);
    let best = null;
    for (const t of rec.tracks) {
      const tIdx = parseInt(t.id.slice(1), 10);
      if (tIdx <= currentIdx && (best === null || parseInt(best.id.slice(1), 10) < tIdx)) {
        best = t;
      }
    }
    return best || rec.tracks[0];
  }

  function switchRecording(key) {
    activeRecording = key;
    document.title = RECORDINGS[key].label;
    const lbl = document.getElementById('recordingLabel');
    if (lbl) lbl.textContent = RECORDINGS[key].label;
    updateTrackTags();
    buildMobileTrackMarkers();
    buildDrawer();
    buildSwitcherDropdown();
    const dd = document.getElementById('recDropdown');
    if (dd) dd.classList.remove('open');
    rewireObserver();
    updateActive(currentActiveId);
    applyTooltips();
    if (document.getElementById('castOverlay').classList.contains('open')) {
      buildCast();
    }
    if (document.getElementById('castSheetOverlay').classList.contains('open')) {
      buildCastSheet();
    }
  }

  function updateActive(activeId) {
    currentActiveId = activeId;
    const rec = RECORDINGS[activeRecording];
    const t = findBestTrack(rec, activeId);
    if (!t) return;
    const trackLabel = document.getElementById('trackLabel');
    if (trackLabel) trackLabel.textContent = 'CD ' + t.cd + ' · T' + t.track;
    const trackTitle = document.getElementById('trackTitle');
    if (trackTitle) trackTitle.textContent = t.title;
    const actLabel = document.getElementById('actLabel');
    if (actLabel) actLabel.textContent = ACT_DISPLAY[t.act] || t.act;
    document.querySelectorAll('.drawer-track').forEach(el => el.classList.remove('active'));
    const idx = document.getElementById('idx-' + t.id);
    if (idx) idx.classList.add('active');
  }

  function rewireObserver() {
    if (observer) observer.disconnect();
    observer = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) updateActive(e.target.id); });
    }, { rootMargin: '-5% 0px -85% 0px', threshold: 0 });

    const rec = RECORDINGS[activeRecording];
    rec.tracks.forEach(t => {
      const el = document.getElementById(t.id);
      if (el) observer.observe(el);
    });
  }

  function toggleLang(lang) {
    const langs = Object.keys(mobileLangState);
    const hasOtherOn = langs.some(l => l !== lang && mobileLangState[l]);
    if (mobileLangState[lang] && !hasOtherOn) return;
    const barBottom = document.getElementById('contextBar').getBoundingClientRect().bottom;
    const anchor = [...document.querySelectorAll('.line-row, .character-row, .scene-heading, .musical-number')]
      .find(el => el.getBoundingClientRect().top >= barBottom);
    const anchorOffset = anchor ? anchor.getBoundingClientRect().top : null;
    mobileLangState[lang] = !mobileLangState[lang];
    applyLangFilter();
    if (anchor !== undefined && anchorOffset !== null) {
      window.scrollBy(0, anchor.getBoundingClientRect().top - anchorOffset);
    }
  }

  function applyLangFilter() {
    const body = document.querySelector('.libretto-body');
    for (const [lang, on] of Object.entries(mobileLangState)) {
      body.classList.toggle(lang + '-hidden', !on);
      const btn = document.getElementById('mobileBtn' + lang.toUpperCase());
      if (btn) btn.classList.toggle('off', !on);
    }
  }

  function buildMobileTrackMarkers() {
    document.querySelectorAll('.mobile-track-marker').forEach(el => el.remove());
    const rec = RECORDINGS[activeRecording];
    for (const t of [...rec.tracks].reverse()) {
      const col = document.getElementById(t.id);
      if (!col) continue;
      const marker = document.createElement('span');
      marker.className = 'mobile-track-marker';
      marker.textContent = '· T' + t.track;
      col.insertBefore(marker, col.firstChild);
    }
  }

  function buildCastSheet() {
    const cast = CAST[activeRecording];
    const body = document.getElementById('castSheetBody');
    body.innerHTML = CHARACTERS.map(ch => {
      const singer = cast[ch.id];
      const singerClass = singer ? 'cast-singer' : 'cast-singer empty';
      const singerText = singer || '—';
      return `<div class="cast-sheet-row">
        <div class="cast-sheet-char">
          <div class="cast-char-name">${ch.name}</div>
          <div class="cast-voice">${ch.voice}</div>
        </div>
        <div class="${singerClass}">${singerText}</div>
      </div>`;
    }).join('');
  }

  function openCastSheet() {
    buildCastSheet();
    document.getElementById('castSheetOverlay').classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeCastSheet() {
    document.getElementById('castSheetOverlay').classList.remove('open');
    document.body.style.overflow = '';
  }

  function buildSheetRecordingPicker() {
    const picker = document.getElementById('sheetRecPicker');
    if (!picker) return;
    picker.innerHTML = Object.entries(RECORDINGS).map(([key, rec]) =>
      `<button class="sheet-rec-btn${key === activeRecording ? ' active' : ''}" onclick="switchRecordingFromSheet('${key}')">${rec.short}</button>`
    ).join('');
  }

  function switchRecordingFromSheet(key) {
    if (key === activeRecording) return;
    switchRecording(key);
    buildSheetRecordingPicker();
    buildBottomSheetBody();
  }

  function buildBottomSheetBody() {
    const rec = RECORDINGS[activeRecording];
    const body = document.getElementById('bottomSheetBody');
    let html = '';
    let lastGroup = null;
    const activeTrack = findBestTrack(rec, currentActiveId);
    for (const t of rec.tracks) {
      const group = t.cd + '-' + t.act;
      if (group !== lastGroup) {
        html += `<div class="drawer-cd-label">Disc ${t.cd} — ${t.act}</div>`;
        lastGroup = group;
      }
      const isActive = activeTrack && t.id === activeTrack.id;
      const spotifyBtn = t.spotify_uri
        ? `<a class="drawer-track-spotify" href="${t.spotify_uri}" target="_blank" rel="noopener" onclick="event.stopPropagation()" aria-label="Play on Spotify"><svg viewBox="0 0 24 24" fill="none"><path d="M8 5v14l11-7L8 5Z" fill="white"/></svg></a>`
        : '';
      html += `<div class="drawer-track${isActive ? ' active' : ''}" onclick="jumpToMobile('${t.id}')">
        <span class="drawer-track-num">${t.track}</span>
        <div class="drawer-track-info">
          <span class="drawer-track-title">${t.title}</span>
          <span class="drawer-track-act">${t.act}</span>
        </div>
        ${spotifyBtn}
      </div>`;
    }
    body.innerHTML = html;
  }

  function buildBottomSheet() {
    buildSheetRecordingPicker();
    buildBottomSheetBody();
  }

  function openBottomSheet() {
    buildBottomSheet();
    document.getElementById('bottomSheetOverlay').classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeBottomSheet() {
    document.getElementById('bottomSheetOverlay').classList.remove('open');
    document.body.style.overflow = '';
  }

  function jumpToMobile(id) {
    closeBottomSheet();
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    updateActive(id);
  }

  buildSwitcherDropdown();
  buildDrawer();
  rewireObserver();
  updateActive(currentActiveId);
  applyTooltips();
  buildMobileTrackMarkers();
