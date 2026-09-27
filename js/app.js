// Jayden's Spell Bee Trainer - Core Application Controller

class SpellBeeApp {
  constructor() {
    this.currentTab = 'study';
    this.studySet = 1;
    this.searchQuery = '';
    this.filterOnlyStarred = false;
    this.isAutoplaying = false;
    this.autoplayIndex = 0;
    this.autoplayTimeout = null;

    // Dictation state
    this.dictationMode = 'set'; // 'set' or 'starred'
    this.dictationSelectionType = 'set'; // 'set' or 'custom'
    this.dictationSet = 1;
    this.dictationCustomFrom = 1;
    this.dictationCustomTo = 50;
    this.dictationShuffle = false;
    this.answerKeySort = 'dictation'; // 'dictation' or 'id'
    this.dictationWords = [];
    this.dictationIndex = 0;
    this.dictationState = 'idle'; // 'idle', 'running', 'paused', 'complete'
    this.dictationPauseSec = 15;
    this.dictationTimerRemaining = 15;
    this.dictationInterval = null;
    this.doubleSpeak = false;
    this.chimeEnabled = true;
    this.isWordPeeked = false;
    this.studentAnswers = {}; // { wordId: typedString }
    this.testResults = {};    // { wordId: { word, cleanTarget, typed, isCorrect, isSkipped } }
    this.reviewFilter = 'all'; // 'all', 'mistakes', 'correct'

    // Starred / Tricky words (persisted in localStorage)
    this.starredWordIds = new Set();
    this.loadStarredWords();

    // DOM references cached
    this.initDOM();
    this.initEventListeners();
    this.renderSetPills();
    this.renderWordsList();
    this.initVoiceSelector();
    this.updateStarredBadges();
  }

  // Load Starred Words from LocalStorage
  loadStarredWords() {
    try {
      const saved = localStorage.getItem('jayden_spellbee_starred');
      if (saved) {
        const arr = JSON.parse(saved);
        if (Array.isArray(arr)) {
          this.starredWordIds = new Set(arr);
        }
      }
    } catch (e) {
      console.warn("Storage error:", e);
    }
  }

  saveStarredWords() {
    try {
      localStorage.setItem('jayden_spellbee_starred', JSON.stringify(Array.from(this.starredWordIds)));
    } catch (e) {
      console.warn("Save error:", e);
    }
    this.updateStarredBadges();
  }

  updateStarredBadges() {
    const count = this.starredWordIds.size;
    const desktopBadge = document.getElementById('desktopStarredBadge');
    const mobileBadge = document.getElementById('mobileStarredBadge');
    
    if (desktopBadge) {
      desktopBadge.textContent = count;
      desktopBadge.classList.toggle('hidden', count === 0);
    }
    if (mobileBadge) {
      mobileBadge.textContent = count;
      mobileBadge.classList.toggle('hidden', count === 0);
    }
  }

  initDOM() {
    // Navigation items
    this.tabs = {
      study: document.getElementById('tabStudy'),
      dictation: document.getElementById('tabDictation'),
      starred: document.getElementById('tabStarred')
    };

    this.navBtns = {
      desktop: {
        study: document.getElementById('navStudyDesktop'),
        dictation: document.getElementById('navDictationDesktop'),
        starred: document.getElementById('navStarredDesktop')
      },
      mobile: {
        study: document.getElementById('navStudyMobile'),
        dictation: document.getElementById('navDictationMobile'),
        starred: document.getElementById('navStarredMobile')
      }
    };
  }

  initEventListeners() {
    // Unlock Audio Context on first touch/click
    const unlockAudio = () => {
      window.spellAudio.getAudioContext();
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
    };
    window.addEventListener('click', unlockAudio, { once: true });
    window.addEventListener('touchstart', unlockAudio, { once: true });

    // Keyboard shortcuts for desktop practice
    window.addEventListener('keydown', (e) => {
      // Don't trigger if user is typing in search bar
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

      if (this.currentTab === 'dictation' && this.dictationState === 'running') {
        if (e.code === 'Space') {
          e.preventDefault();
          this.repeatCurrentWord();
        } else if (e.code === 'ArrowRight' || e.code === 'Enter') {
          e.preventDefault();
          this.nextWord(true);
        } else if (e.code === 'ArrowLeft') {
          e.preventDefault();
          this.prevWord();
        } else if (e.key === 'p' || e.key === 'P') {
          e.preventDefault();
          this.togglePauseResume();
        }
      }
    });

    // Handle Speech Voices Loaded
    window.addEventListener('spellbee-voices-ready', (e) => {
      this.populateVoiceSelect(e.detail.voices, e.detail.selectedVoice);
    });
  }

  // =========================================================================
  // TAB NAVIGATION
  // =========================================================================
  switchTab(tabKey) {
    if (this.currentTab === tabKey) return;

    // Pause autoplay or dictation loop if running
    this.stopAutoplay();

    this.currentTab = tabKey;

    // Update Section Visibilities
    Object.keys(this.tabs).forEach(key => {
      if (this.tabs[key]) {
        this.tabs[key].classList.toggle('hidden', key !== tabKey);
      }
    });

    // Update Desktop Navigation Styles
    const desktopClassesActive = ['bg-amber-500', 'text-white', 'shadow-sm', 'shadow-amber-500/25'];
    const desktopClassesInactive = ['text-slate-600', 'hover:text-royal-900', 'hover:bg-amber-100/60'];

    Object.keys(this.navBtns.desktop).forEach(key => {
      const btn = this.navBtns.desktop[key];
      if (btn) {
        if (key === tabKey) {
          btn.classList.add(...desktopClassesActive);
          btn.classList.remove(...desktopClassesInactive);
        } else {
          btn.classList.remove(...desktopClassesActive);
          btn.classList.add(...desktopClassesInactive);
        }
      }
    });

    // Update Mobile Navigation Styles
    Object.keys(this.navBtns.mobile).forEach(key => {
      const btn = this.navBtns.mobile[key];
      if (btn) {
        if (key === tabKey) {
          btn.classList.add('text-amber-600', 'font-black');
          btn.classList.remove('text-slate-400');
        } else {
          btn.classList.remove('text-amber-600', 'font-black');
          btn.classList.add('text-slate-400');
        }
      }
    });

    // Refresh content based on tab
    if (tabKey === 'study') {
      this.renderWordsList();
    } else if (tabKey === 'dictation') {
      this.renderDictationSetup();
    } else if (tabKey === 'starred') {
      this.renderStarredWords();
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // =========================================================================
  // TAB 1: WORD STUDY LOGIC
  // =========================================================================
  renderSetPills() {
    const container = document.getElementById('setSelectorGrid');
    if (!container) return;

    container.innerHTML = window.SpellBeeData.sets.map(set => {
      const isActive = set.number === this.studySet;
      return `
        <button onclick="app.selectStudySet(${set.number})" 
          class="px-3 py-2 rounded-2xl text-xs font-bold whitespace-nowrap transition-all flex flex-col items-center min-w-[76px] border ${
            isActive 
              ? 'bg-amber-500 text-white border-amber-600 shadow-sm shadow-amber-500/30 scale-105' 
              : 'bg-white text-slate-700 border-slate-200 hover:border-amber-300 hover:bg-amber-50/50'
          }">
          <span>Set ${set.number}</span>
          <span class="text-[10px] opacity-80">${set.range}</span>
        </button>
      `;
    }).join('');
  }

  selectStudySet(setNum) {
    this.stopAutoplay();
    this.studySet = setNum;
    this.renderSetPills();
    
    const setObj = window.SpellBeeData.getSet(setNum);
    const badge = document.getElementById('studySetBadge');
    if (badge) badge.textContent = `Set ${setNum} (${setObj.range})`;

    this.renderWordsList();
  }

  handleSearch(query) {
    this.searchQuery = query.trim().toLowerCase();
    const clearBtn = document.getElementById('clearSearchBtn');
    if (clearBtn) {
      clearBtn.classList.toggle('hidden', this.searchQuery === '');
    }
    this.renderWordsList();
  }

  clearSearch() {
    const input = document.getElementById('searchInput');
    if (input) input.value = '';
    this.handleSearch('');
  }

  renderWordsList() {
    const container = document.getElementById('wordsListContainer');
    const emptyState = document.getElementById('noWordsState');
    const countLabel = document.getElementById('wordCountLabel');
    if (!container) return;

    let wordsToDisplay = [];
    const currentSetObj = window.SpellBeeData.getSet(this.studySet);

    if (this.searchQuery) {
      // Search in all 500 words
      wordsToDisplay = window.SpellBeeData.allWords.filter(w => 
        w.word.toLowerCase().includes(this.searchQuery) ||
        w.id.toString() === this.searchQuery
      );
    } else {
      wordsToDisplay = currentSetObj.words;
    }

    if (countLabel) {
      if (this.searchQuery) {
        countLabel.textContent = `Found ${wordsToDisplay.length} match${wordsToDisplay.length === 1 ? '' : 'es'} across all sets`;
      } else {
        countLabel.textContent = `Showing ${wordsToDisplay.length} words in Set ${this.studySet} (${currentSetObj.range})`;
      }
    }

    if (wordsToDisplay.length === 0) {
      container.innerHTML = '';
      if (emptyState) emptyState.classList.remove('hidden');
      return;
    }

    if (emptyState) emptyState.classList.add('hidden');

    container.innerHTML = wordsToDisplay.map((w, idx) => {
      const isStarred = this.starredWordIds.has(w.id);
      return `
        <div id="wordCard-${w.id}" class="bg-white rounded-2xl p-3.5 sm:p-4 border border-slate-200/90 hover:border-amber-400 hover:shadow-md transition-all flex items-center justify-between group">
          
          <div class="flex items-center space-x-3 min-w-0">
            <!-- Number badge -->
            <span class="flex-shrink-0 w-8 h-8 rounded-xl bg-slate-100 group-hover:bg-amber-100 group-hover:text-amber-900 text-slate-500 font-bold text-xs flex items-center justify-center transition">
              #${w.id}
            </span>
            
            <!-- Word text -->
            <div class="truncate">
              <div class="font-heading font-extrabold text-base sm:text-lg text-slate-800 tracking-wide group-hover:text-royal-950 transition">
                ${w.word}
              </div>
              <div class="text-[10px] text-slate-400 font-semibold flex items-center space-x-2">
                <span>Set ${w.set}</span>
                <span>•</span>
                <span>${w.length} letters</span>
              </div>
            </div>
          </div>

          <!-- Actions -->
          <div class="flex items-center space-x-1.5 flex-shrink-0">
            <!-- Star / Bookmark Button -->
            <button onclick="app.toggleStarWord(${w.id})" title="${isStarred ? 'Remove from tricky words' : 'Mark as tricky word'}"
              class="p-2 rounded-xl transition ${
                isStarred 
                  ? 'text-amber-500 bg-amber-50 hover:bg-amber-100' 
                  : 'text-slate-300 hover:text-amber-500 hover:bg-slate-50'
              }">
              <svg class="w-5 h-5 ${isStarred ? 'fill-current' : 'fill-none'} stroke-current" viewBox="0 0 24 24" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
            </button>

            <!-- Speak Slow Button -->
            <button id="speakerSlowBtn-${w.id}" onclick="app.speakSingleWordSlow('${w.cleanWord}', ${w.id})" title="Pronounce slowly (0.68x)"
              class="px-2.5 py-2 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold text-xs flex items-center shadow-sm active:scale-95 transition">
              <span>🐢</span>
            </button>

            <!-- Speak Button -->
            <button id="speakerBtn-${w.id}" onclick="app.speakSingleWord('${w.cleanWord}', ${w.id})" title="Pronounce word in Indian English"
              class="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs flex items-center space-x-1.5 shadow-sm shadow-amber-500/20 active:scale-95 transition">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                  d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              </svg>
              <span class="hidden sm:inline">Listen</span>
            </button>
          </div>

        </div>
      `;
    }).join('');
  }

  speakSingleWord(cleanWord, wordId) {
    const btn = document.getElementById(`speakerBtn-${wordId}`);
    if (btn) btn.classList.add('speaking-pulse', 'bg-amber-600');

    const wordObj = window.SpellBeeData ? window.SpellBeeData.getWordById(wordId) : null;
    window.spellAudio.speakWord(
      wordObj || cleanWord,
      () => {},
      () => {
        if (btn) btn.classList.remove('speaking-pulse', 'bg-amber-600');
      },
      () => {
        if (btn) btn.classList.remove('speaking-pulse', 'bg-amber-600');
      }
    );
  }

  speakSingleWordSlow(cleanWord, wordId) {
    const btn = document.getElementById(`speakerSlowBtn-${wordId}`);
    if (btn) btn.classList.add('bg-amber-300');

    const originalRate = window.spellAudio.rate;
    window.spellAudio.rate = Math.min(originalRate, 0.68);

    const wordObj = window.SpellBeeData ? window.SpellBeeData.getWordById(wordId) : null;
    window.spellAudio.speakWord(
      wordObj || cleanWord,
      () => {},
      () => {
        window.spellAudio.rate = originalRate;
        if (btn) btn.classList.remove('bg-amber-300');
      },
      () => {
        window.spellAudio.rate = originalRate;
        if (btn) btn.classList.remove('bg-amber-300');
      }
    );
  }

  speakAllFiltered() {
    const currentSetObj = window.SpellBeeData.getSet(this.studySet);
    const words = this.searchQuery 
      ? window.SpellBeeData.allWords.filter(w => w.word.toLowerCase().includes(this.searchQuery))
      : currentSetObj.words;

    if (words.length > 0) {
      this.speakSingleWord(words[0].cleanWord, words[0].id);
    }
  }

  toggleStarWord(wordId) {
    if (this.starredWordIds.has(wordId)) {
      this.starredWordIds.delete(wordId);
      this.showToast('⭐ Removed from tricky words');
    } else {
      this.starredWordIds.add(wordId);
      this.showToast('⭐ Added to tricky words!');
    }
    this.saveStarredWords();
    this.renderWordsList();
    if (this.currentTab === 'starred') {
      this.renderStarredWords();
    }
  }

  // Autoplay entire set sequentially
  toggleAutoplay() {
    if (this.isAutoplaying) {
      this.stopAutoplay();
    } else {
      this.startAutoplay();
    }
  }

  startAutoplay() {
    this.isAutoplaying = true;
    this.autoplayIndex = 0;
    const btn = document.getElementById('autoplayBtn');
    const icon = document.getElementById('autoplayIcon');
    const text = document.getElementById('autoplayText');
    if (btn) {
      btn.classList.add('bg-rose-500', 'text-white', 'border-rose-600');
      btn.classList.remove('bg-amber-50', 'text-amber-900');
      if (icon) icon.textContent = '⏹️';
      if (text) text.textContent = 'Stop Autoplay';
    }
    this.autoplayNext();
  }

  stopAutoplay() {
    this.isAutoplaying = false;
    if (this.autoplayTimeout) clearTimeout(this.autoplayTimeout);
    window.spellAudio.cancel();

    const btn = document.getElementById('autoplayBtn');
    const icon = document.getElementById('autoplayIcon');
    const text = document.getElementById('autoplayText');
    if (btn) {
      btn.classList.remove('bg-rose-500', 'text-white', 'border-rose-600');
      btn.classList.add('bg-amber-50', 'text-amber-900');
      if (icon) icon.textContent = '▶️';
      if (text) text.textContent = 'Auto Play Set';
    }
  }

  autoplayNext() {
    if (!this.isAutoplaying) return;

    const setWords = window.SpellBeeData.getSet(this.studySet).words;
    if (this.autoplayIndex >= setWords.length) {
      this.stopAutoplay();
      this.showToast('🏁 Finished set preview!');
      return;
    }

    const currentWord = setWords[this.autoplayIndex];
    // Highlight word card
    const card = document.getElementById(`wordCard-${currentWord.id}`);
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      card.classList.add('ring-2', 'ring-amber-400');
    }

    window.spellAudio.speakWord(
      currentWord,
      () => {},
      () => {
        if (card) card.classList.remove('ring-2', 'ring-amber-400');
        this.autoplayIndex++;
        // 2.5 second pause between words
        this.autoplayTimeout = setTimeout(() => {
          this.autoplayNext();
        }, 2200);
      }
    );
  }

  startDictationFromStudy() {
    this.dictationSet = this.studySet;
    this.switchTab('dictation');
  }

  // =========================================================================
  // TAB 2: DICTATION PRACTICE LOGIC (AUDIO-ONLY TEST MODE FOR PAPER)
  // =========================================================================
  renderDictationSetup() {
    const setupScreen = document.getElementById('dictationSetupScreen');
    const activeScreen = document.getElementById('dictationActiveScreen');
    const completeScreen = document.getElementById('dictationCompleteScreen');

    if (setupScreen) setupScreen.classList.remove('hidden');
    if (activeScreen) activeScreen.classList.add('hidden');
    if (completeScreen) completeScreen.classList.add('hidden');

    this.dictationState = 'idle';

    // Populate the 1-10 set picker buttons
    const pickerGrid = document.getElementById('dictationSetPickerGrid');
    if (pickerGrid) {
      pickerGrid.innerHTML = window.SpellBeeData.sets.map(s => {
        const isSelected = s.number === this.dictationSet;
        return `
          <button type="button" onclick="app.setDictationTargetSet(${s.number})"
            class="py-2.5 rounded-xl font-heading font-bold text-xs transition border flex flex-col items-center ${
              isSelected 
                ? 'bg-amber-500 text-white border-amber-600 shadow-md scale-105' 
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-amber-300'
            }">
            <span>Set ${s.number}</span>
            <span class="text-[9px] font-normal opacity-80">${s.startId}–${s.endId}</span>
          </button>
        `;
      }).join('');
    }

    // Synchronize mode buttons & panels
    this.setDictationSelectionType(this.dictationSelectionType);

    // Synchronize shuffle toggle
    const shuffleToggle = document.getElementById('dictationShuffleToggle');
    if (shuffleToggle) {
      shuffleToggle.checked = this.dictationShuffle;
      this.handleShuffleToggle();
    } else {
      this.updateDictationSummary();
    }
  }

  setDictationTargetSet(setNum) {
    this.dictationSet = setNum;
    this.renderDictationSetup();
  }

  setDictationSelectionType(type) {
    this.dictationSelectionType = type; // 'set' or 'custom'

    const setBtn = document.getElementById('dictModeSetBtn');
    const customBtn = document.getElementById('dictModeCustomBtn');
    const setPanel = document.getElementById('dictationSetPickerPanel');
    const customPanel = document.getElementById('dictationCustomRangePanel');

    if (type === 'set') {
      if (setBtn) {
        setBtn.className = 'px-3 py-1.5 rounded-lg transition-all bg-white text-royal-900 shadow-sm font-extrabold';
      }
      if (customBtn) {
        customBtn.className = 'px-3 py-1.5 rounded-lg transition-all text-slate-600 hover:text-royal-900 font-bold';
      }
      if (setPanel) setPanel.classList.remove('hidden');
      if (customPanel) customPanel.classList.add('hidden');
    } else {
      if (setBtn) {
        setBtn.className = 'px-3 py-1.5 rounded-lg transition-all text-slate-600 hover:text-royal-900 font-bold';
      }
      if (customBtn) {
        customBtn.className = 'px-3 py-1.5 rounded-lg transition-all bg-white text-royal-900 shadow-sm font-extrabold';
      }
      if (setPanel) setPanel.classList.add('hidden');
      if (customPanel) customPanel.classList.remove('hidden');

      const fromInput = document.getElementById('customRangeFrom');
      const toInput = document.getElementById('customRangeTo');
      if (fromInput) fromInput.value = this.dictationCustomFrom;
      if (toInput) toInput.value = this.dictationCustomTo;
    }

    this.updateDictationSummary();
  }

  setQuickRange(from, to) {
    this.dictationCustomFrom = Math.max(1, Math.min(500, from));
    this.dictationCustomTo = Math.max(1, Math.min(500, to));

    const fromInput = document.getElementById('customRangeFrom');
    const toInput = document.getElementById('customRangeTo');
    if (fromInput) fromInput.value = this.dictationCustomFrom;
    if (toInput) toInput.value = this.dictationCustomTo;

    this.updateDictationSummary();
    this.showToast(`🎯 Range set to Words ${this.dictationCustomFrom}–${this.dictationCustomTo}`);
  }

  adjustCustomRange(field, delta) {
    if (field === 'from') {
      let val = parseInt(this.dictationCustomFrom) || 1;
      val = Math.max(1, Math.min(500, val + delta));
      this.dictationCustomFrom = val;
      if (this.dictationCustomTo < this.dictationCustomFrom) {
        this.dictationCustomTo = this.dictationCustomFrom;
      }
    } else if (field === 'to') {
      let val = parseInt(this.dictationCustomTo) || 50;
      val = Math.max(1, Math.min(500, val + delta));
      this.dictationCustomTo = val;
      if (this.dictationCustomFrom > this.dictationCustomTo) {
        this.dictationCustomFrom = this.dictationCustomTo;
      }
    }

    const fromInput = document.getElementById('customRangeFrom');
    const toInput = document.getElementById('customRangeTo');
    if (fromInput) fromInput.value = this.dictationCustomFrom;
    if (toInput) toInput.value = this.dictationCustomTo;

    this.updateDictationSummary();
  }

  handleCustomRangeInput() {
    const fromInput = document.getElementById('customRangeFrom');
    const toInput = document.getElementById('customRangeTo');
    if (!fromInput || !toInput) return;

    let fromVal = parseInt(fromInput.value);
    let toVal = parseInt(toInput.value);

    if (isNaN(fromVal) || fromVal < 1) fromVal = 1;
    if (fromVal > 500) fromVal = 500;

    if (isNaN(toVal) || toVal < 1) toVal = fromVal;
    if (toVal > 500) toVal = 500;

    this.dictationCustomFrom = fromVal;
    this.dictationCustomTo = toVal;

    this.updateDictationSummary();
  }

  handleShuffleToggle() {
    const toggle = document.getElementById('dictationShuffleToggle');
    const badge = document.getElementById('shuffleStatusBadge');
    this.dictationShuffle = toggle ? toggle.checked : false;

    if (badge) {
      if (this.dictationShuffle) {
        badge.textContent = '🔀 ON (Randomized)';
        badge.className = 'text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-amber-500 text-white shadow-xs';
      } else {
        badge.textContent = 'Off (Sequential)';
        badge.className = 'text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-slate-200 text-slate-700';
      }
    }

    this.updateDictationSummary();
  }

  updateDictationSummary() {
    const summary = document.getElementById('selectedSetSummary');
    if (!summary) return;

    const shuffleNote = this.dictationShuffle ? ' • 🔀 Shuffled Order' : ' • ➡️ In Order';

    if (this.dictationSelectionType === 'set') {
      const setObj = window.SpellBeeData.getSet(this.dictationSet);
      if (setObj) {
        summary.textContent = `Selected: Set ${setObj.number} (${setObj.range} • 50 Words)${shuffleNote}`;
      }
    } else {
      const from = Math.min(this.dictationCustomFrom, this.dictationCustomTo);
      const to = Math.max(this.dictationCustomFrom, this.dictationCustomTo);
      const count = to - from + 1;
      summary.textContent = `Selected: Custom Range (Words ${from} to ${to} • ${count} Words)${shuffleNote}`;
    }
  }

  setDictationPause(sec) {
    this.dictationPauseSec = sec;
    const label = document.getElementById('dictationPauseLabel');
    if (label) {
      label.textContent = sec === 0 ? 'Untimed (Self-Paced)' : `${sec} seconds`;
    }

    // Highlight active button
    document.querySelectorAll('.pause-btn').forEach(btn => {
      const s = parseInt(btn.getAttribute('data-seconds'));
      if (s === sec) {
        btn.className = 'pause-btn py-2 rounded-xl text-xs border border-amber-400 bg-amber-400 text-royal-950 font-black';
      } else {
        btn.className = 'pause-btn py-2 rounded-xl text-xs font-bold border border-slate-200 bg-white text-slate-700 hover:border-amber-400';
      }
    });
  }

  startDictationLoop() {
    this.dictationMode = 'set';

    // Read user settings
    const doubleSpeakCheck = document.getElementById('dictationDoubleSpeak');
    this.doubleSpeak = doubleSpeakCheck ? doubleSpeakCheck.checked : false;

    const chimeCheck = document.getElementById('dictationChimeToggle');
    this.chimeEnabled = chimeCheck ? chimeCheck.checked : true;

    const shuffleCheck = document.getElementById('dictationShuffleToggle');
    this.dictationShuffle = shuffleCheck ? shuffleCheck.checked : false;

    let baseWords = [];
    let titleText = '';

    if (this.dictationSelectionType === 'custom') {
      const from = Math.min(this.dictationCustomFrom, this.dictationCustomTo);
      const to = Math.max(this.dictationCustomFrom, this.dictationCustomTo);
      baseWords = window.SpellBeeData.allWords.filter(w => w.id >= from && w.id <= to);
      titleText = `Words ${from}–${to} (${baseWords.length} Words${this.dictationShuffle ? ' • Shuffled' : ''})`;
    } else {
      const setObj = window.SpellBeeData.getSet(this.dictationSet);
      baseWords = [...setObj.words];
      titleText = `Set ${setObj.number} (${setObj.range} • 50 Words${this.dictationShuffle ? ' • Shuffled' : ''})`;
    }

    if (baseWords.length === 0) {
      alert("No words found for selected range!");
      return;
    }

    // Clone words and attach dictation metadata
    let preparedWords = baseWords.map((w, idx) => ({
      ...w,
      originalIndex: idx + 1
    }));

    // Apply Fisher-Yates shuffle if randomize is active
    if (this.dictationShuffle) {
      for (let i = preparedWords.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [preparedWords[i], preparedWords[j]] = [preparedWords[j], preparedWords[i]];
      }
    }

    // Attach dictated sequence order (1, 2, 3...)
    this.dictationWords = preparedWords.map((w, dictIdx) => ({
      ...w,
      dictationSeq: dictIdx + 1
    }));

    this.dictationIndex = 0;
    this.studentAnswers = {};
    this.testResults = {};
    this.reviewFilter = 'all';

    // Switch to active screen
    document.getElementById('dictationSetupScreen').classList.add('hidden');
    document.getElementById('dictationActiveScreen').classList.remove('hidden');
    document.getElementById('dictationCompleteScreen').classList.add('hidden');

    const activeSetTitle = document.getElementById('activeSetTitle');
    if (activeSetTitle) {
      activeSetTitle.textContent = titleText;
    }

    this.dictationState = 'running';
    this.loadDictationWord(0);
  }

  loadDictationWord(index) {
    if (index >= this.dictationWords.length) {
      this.finishDictationSet();
      return;
    }

    this.dictationIndex = index;
    const currentWord = this.dictationWords[index];
    const totalWords = this.dictationWords.length;

    // Reset peek state
    this.isWordPeeked = false;
    const hiddenBox = document.getElementById('hiddenWordBox');
    const revealedBox = document.getElementById('revealedWordBox');
    const peekBtn = document.getElementById('peekWordBtn');
    if (hiddenBox) hiddenBox.classList.remove('hidden');
    if (revealedBox) revealedBox.classList.add('hidden');
    if (peekBtn) peekBtn.innerHTML = '<span>👁️</span><span>Peek Spelling</span>';

    // Populate interactive typing input
    const input = document.getElementById('spellingInput');
    const previousTyped = this.studentAnswers[currentWord.id] || '';
    if (input) {
      input.value = previousTyped;
      setTimeout(() => {
        if (input && this.dictationState === 'running') {
          input.focus();
          input.select();
        }
      }, 50);
    }
    this.updateTypingCount(previousTyped);

    // Update Progress labels
    const progressText = document.getElementById('dictationProgressText');
    const progressPercent = document.getElementById('dictationProgressPercent');
    const progressBar = document.getElementById('dictationProgressBar');
    const wordIdDisplay = document.getElementById('activeWordId');
    const revealedText = document.getElementById('revealedWordText');

    const percent = Math.round(((index + 1) / totalWords) * 100);
    if (progressText) progressText.textContent = `Word ${index + 1} of ${totalWords}`;
    if (progressPercent) progressPercent.textContent = `${percent}%`;
    if (progressBar) progressBar.style.width = `${percent}%`;
    if (wordIdDisplay) wordIdDisplay.textContent = currentWord.id;
    if (revealedText) revealedText.textContent = currentWord.word;

    const seqBadge = document.getElementById('activeDictationSeqBadge');
    if (seqBadge) {
      seqBadge.textContent = `Word #${currentWord.dictationSeq || (index + 1)}`;
    }

    // Update Star button on active dictation screen
    this.updateDictationStarState();

    // Reset Timer
    this.dictationTimerRemaining = this.dictationPauseSec;
    this.updateTimerDisplay(this.dictationTimerRemaining);

    // Speak word
    this.announceCurrentWord();
  }

  handleSpellingInput(val) {
    const currentWord = this.dictationWords[this.dictationIndex];
    if (currentWord) {
      this.studentAnswers[currentWord.id] = (val || '').trim().toUpperCase();
    }
    this.updateTypingCount(val);
  }

  handleSpellingInputKey(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      this.nextWord(true);
    }
  }

  clearSpellingInput() {
    const input = document.getElementById('spellingInput');
    if (input) {
      input.value = '';
      input.focus();
      this.handleSpellingInput('');
    }
  }

  updateTypingCount(val) {
    const str = (val || '').trim();
    const countLabel = document.getElementById('typingLetterCount');
    if (countLabel) countLabel.textContent = `${str.length} letters`;

    const statusText = document.getElementById('answeredStatusText');
    if (statusText) {
      statusText.innerHTML = str.length > 0 
        ? 'Spelling entered! Press <kbd class="px-1.5 py-0.5 bg-slate-200 text-slate-800 rounded font-mono text-[10px]">Enter ↵</kbd>' 
        : 'Type and press <kbd class="px-1.5 py-0.5 bg-slate-200 text-slate-800 rounded font-mono text-[10px]">Enter ↵</kbd> to advance';
    }
  }

  announceCurrentWord() {
    const currentWord = this.dictationWords[this.dictationIndex];
    if (!currentWord) return;

    // Sound gentle chime first to prepare Jayden
    if (this.chimeEnabled) {
      window.spellAudio.playDing();
    }

    // Speak word clearly
    setTimeout(() => {
      window.spellAudio.speakWord(
        currentWord,
        () => {},
        () => {
          // If double speak enabled, repeat word after 1.8s
          if (this.doubleSpeak && this.dictationState === 'running') {
            setTimeout(() => {
              if (this.dictationState === 'running') {
                window.spellAudio.speakWord(currentWord);
              }
            }, 1800);
          }
        }
      );
    }, this.chimeEnabled ? 250 : 0);

    // Start or restart interval timer
    this.startInterval();
  }

  startInterval() {
    if (this.dictationInterval) clearInterval(this.dictationInterval);

    // If untimed, do not auto-advance
    if (this.dictationPauseSec <= 0) {
      this.updateTimerDisplay(0);
      return;
    }

    this.dictationInterval = setInterval(() => {
      if (this.dictationState !== 'running') return;

      this.dictationTimerRemaining--;
      this.updateTimerDisplay(this.dictationTimerRemaining);

      if (this.dictationTimerRemaining <= 0) {
        clearInterval(this.dictationInterval);
        this.nextWord(false);
      }
    }, 1000);
  }

  updateTimerDisplay(seconds) {
    const text = document.getElementById('timerSecondsText');
    const ring = document.getElementById('timerCircleRing');
    const status = document.getElementById('timerStatusLabel');
    const unitText = document.getElementById('timerUnitText');

    if (this.dictationPauseSec <= 0) {
      if (text) text.textContent = '♾️';
      if (unitText) unitText.textContent = 'pace';
      if (status) status.textContent = 'Self-paced • Press Enter ↵ when done';
      if (ring) {
        ring.style.strokeDashoffset = '0';
        ring.setAttribute('stroke', '#10B981');
      }
      return;
    }

    if (unitText) unitText.textContent = 'sec';
    if (text) text.textContent = Math.max(0, seconds);

    if (ring) {
      // Circumference = 2 * PI * 34 = 213.63
      const totalCircumference = 213.63;
      const progressFraction = seconds / this.dictationPauseSec;
      const offset = totalCircumference * (1 - Math.max(0, progressFraction));
      ring.style.strokeDashoffset = offset;

      if (seconds <= 3) {
        ring.setAttribute('stroke', '#EF4444');
      } else if (seconds <= 6) {
        ring.setAttribute('stroke', '#F59E0B');
      } else {
        ring.setAttribute('stroke', '#10B981');
      }
    }

    if (status) {
      if (this.dictationState === 'paused') {
        status.textContent = '⏸️ Paused. Take your time!';
      } else if (seconds <= 3) {
        status.textContent = 'Submitting & moving to next...';
      } else {
        status.textContent = 'Time remaining...';
      }
    }
  }

  repeatCurrentWord() {
    const currentWord = this.dictationWords[this.dictationIndex];
    if (currentWord) {
      window.spellAudio.speakWord(currentWord);
      this.showToast(`🔊 Replayed word #${currentWord.id}`);
    }
  }

  nextWord(userTriggered = false) {
    // Save typed input before moving
    const input = document.getElementById('spellingInput');
    if (input && this.dictationWords[this.dictationIndex]) {
      const w = this.dictationWords[this.dictationIndex];
      this.studentAnswers[w.id] = input.value.trim().toUpperCase();
    }

    if (this.dictationInterval) clearInterval(this.dictationInterval);
    window.spellAudio.cancel();

    if (userTriggered) {
      window.spellAudio.playTick();
    }

    if (this.dictationIndex < this.dictationWords.length - 1) {
      this.loadDictationWord(this.dictationIndex + 1);
    } else {
      this.finishDictationSet();
    }
  }

  prevWord() {
    // Save typed input before moving back
    const input = document.getElementById('spellingInput');
    if (input && this.dictationWords[this.dictationIndex]) {
      const w = this.dictationWords[this.dictationIndex];
      this.studentAnswers[w.id] = input.value.trim().toUpperCase();
    }

    if (this.dictationIndex > 0) {
      if (this.dictationInterval) clearInterval(this.dictationInterval);
      window.spellAudio.cancel();
      window.spellAudio.playTick();
      this.loadDictationWord(this.dictationIndex - 1);
    } else {
      this.showToast("At first word of set!");
    }
  }

  togglePauseResume() {
    const icon = document.getElementById('pauseResumeIcon');
    const text = document.getElementById('pauseResumeText');
    const btn = document.getElementById('pauseResumeBtn');

    if (this.dictationState === 'running') {
      this.dictationState = 'paused';
      window.spellAudio.pause();
      if (icon) icon.textContent = '▶️';
      if (text) text.textContent = 'Resume';
      if (btn) btn.classList.add('bg-amber-100', 'border-amber-300');
      this.updateTimerDisplay(this.dictationTimerRemaining);
    } else if (this.dictationState === 'paused') {
      this.dictationState = 'running';
      window.spellAudio.resume();
      if (icon) icon.textContent = '⏸️';
      if (text) text.textContent = 'Pause Timer';
      if (btn) btn.classList.remove('bg-amber-100', 'border-amber-300');
      this.updateTimerDisplay(this.dictationTimerRemaining);
    }
  }

  togglePeekWord() {
    this.isWordPeeked = !this.isWordPeeked;
    const hiddenBox = document.getElementById('hiddenWordBox');
    const revealedBox = document.getElementById('revealedWordBox');
    const peekBtn = document.getElementById('peekWordBtn');

    if (this.isWordPeeked) {
      if (hiddenBox) hiddenBox.classList.add('hidden');
      if (revealedBox) revealedBox.classList.remove('hidden');
      if (peekBtn) peekBtn.innerHTML = '<span>🙈</span><span>Hide Spelling</span>';
    } else {
      if (hiddenBox) hiddenBox.classList.remove('hidden');
      if (revealedBox) revealedBox.classList.add('hidden');
      if (peekBtn) peekBtn.innerHTML = '<span>👁️</span><span>Peek Spelling</span>';
    }
  }

  toggleActiveWordStar() {
    const currentWord = this.dictationWords[this.dictationIndex];
    if (!currentWord) return;

    this.toggleStarWord(currentWord.id);
    this.updateDictationStarState();
  }

  updateDictationStarState() {
    const currentWord = this.dictationWords[this.dictationIndex];
    const icon = document.getElementById('dictationStarIcon');
    const text = document.getElementById('dictationStarText');
    if (!currentWord || !icon || !text) return;

    const isStarred = this.starredWordIds.has(currentWord.id);
    if (isStarred) {
      icon.textContent = '★';
      icon.className = 'text-amber-500 font-bold';
      text.textContent = 'Marked as tricky';
      text.className = 'text-amber-700 font-bold';
    } else {
      icon.textContent = '☆';
      icon.className = 'text-slate-400';
      text.textContent = 'Mark this word as tricky';
      text.className = 'text-slate-500';
    }
  }

  confirmStopDictation() {
    if (confirm("Do you want to finish and validate your test answers now?")) {
      this.finishDictationSet();
    }
  }

  finishDictationSet() {
    // Save current active word input if any
    const input = document.getElementById('spellingInput');
    if (input && this.dictationWords[this.dictationIndex]) {
      const w = this.dictationWords[this.dictationIndex];
      this.studentAnswers[w.id] = input.value.trim().toUpperCase();
    }

    if (this.dictationInterval) clearInterval(this.dictationInterval);
    this.dictationState = 'complete';

    // Grade and validate all answers
    this.testResults = {};
    let correctCount = 0;
    let mistakeCount = 0;
    let skippedCount = 0;
    const totalWordsCount = this.dictationWords.length;

    this.dictationWords.forEach(w => {
      const cleanTarget = (w.cleanWord || w.word).normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();
      const typed = (this.studentAnswers[w.id] || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();
      const isCorrect = (typed === cleanTarget);
      const isSkipped = (typed === '');

      if (isCorrect) correctCount++;
      else mistakeCount++;
      if (isSkipped) skippedCount++;

      this.testResults[w.id] = {
        word: w,
        cleanTarget,
        typed,
        isCorrect,
        isSkipped
      };
    });

    const accuracy = totalWordsCount > 0 ? Math.round((correctCount / totalWordsCount) * 100) : 0;

    // Victory fanfare / Sound
    if (accuracy >= 80) {
      window.spellAudio.playVictoryChime();
      this.triggerConfetti();
    } else {
      window.spellAudio.playDing();
    }

    // Switch Screens
    document.getElementById('dictationSetupScreen').classList.add('hidden');
    document.getElementById('dictationActiveScreen').classList.add('hidden');
    document.getElementById('dictationCompleteScreen').classList.remove('hidden');

    // Update Score Title and Evaluation
    const scoreTitle = document.getElementById('completionScoreTitle');
    if (scoreTitle) {
      scoreTitle.textContent = `Score: ${correctCount} / ${totalWordsCount} (${accuracy}%)`;
    }

    const badge = document.getElementById('completionEvaluationBadge');
    const emoji = document.getElementById('completionEmoji');
    if (badge) {
      if (accuracy === 100) {
        badge.textContent = '🏆 Perfect Score! Gold Champion!';
        badge.className = 'inline-block px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs';
        if (emoji) emoji.textContent = '🏆 🐝 🥇';
      } else if (accuracy >= 90) {
        badge.textContent = '🥇 Outstanding! Spell Bee Master!';
        badge.className = 'inline-block px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs';
        if (emoji) emoji.textContent = '🎉 🐝 🥇';
      } else if (accuracy >= 75) {
        badge.textContent = '🥈 Great Job! Almost Flawless!';
        badge.className = 'inline-block px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs';
        if (emoji) emoji.textContent = '👏 🐝 ✨';
      } else {
        badge.textContent = '📚 Good Practice! Review Mistakes Below!';
        badge.className = 'inline-block px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wider bg-blue-100 text-blue-900 border border-blue-300 shadow-2xs';
        if (emoji) emoji.textContent = '🐝 📝 💪';
      }
    }

    // Update Score Metrics Cards
    const elCorrect = document.getElementById('scoreCorrectCount');
    const elMistakes = document.getElementById('scoreMistakeCount');
    const elAccuracy = document.getElementById('scoreAccuracyPercent');
    if (elCorrect) elCorrect.textContent = correctCount;
    if (elMistakes) elMistakes.textContent = mistakeCount;
    if (elAccuracy) elAccuracy.textContent = `${accuracy}%`;

    // Filter counts
    const fAll = document.getElementById('filterCountAll');
    const fMistakes = document.getElementById('filterCountMistakes');
    const fCorrect = document.getElementById('filterCountCorrect');
    if (fAll) fAll.textContent = totalWordsCount;
    if (fMistakes) fMistakes.textContent = mistakeCount;
    if (fCorrect) fCorrect.textContent = correctCount;

    // Toggle Flag All Mistakes button visibility
    const flagBtn = document.getElementById('flagAllMistakesBtn');
    if (flagBtn) {
      flagBtn.classList.toggle('hidden', mistakeCount === 0);
    }

    // Toggle Next Set button availability (only visible for standard sets 1-9)
    const nextBtn = document.getElementById('nextSetPracticeBtn');
    if (nextBtn) {
      const showNext = (this.dictationMode !== 'starred' && this.dictationSelectionType === 'set' && this.dictationSet < 10);
      nextBtn.classList.toggle('hidden', !showNext);
    }

    // Default to 'mistakes' tab if there are mistakes, otherwise 'all'
    this.reviewFilter = (mistakeCount > 0 && mistakeCount <= 20) ? 'mistakes' : 'all';
    this.updateReviewFilterButtons();

    // Reset sort order to dictation sequence
    this.answerKeySort = 'dictation';
    const dictBtn = document.getElementById('sortDictationOrderBtn');
    const idBtn = document.getElementById('sortWordIdBtn');
    if (dictBtn && idBtn) {
      dictBtn.className = 'px-2.5 py-1 rounded-lg bg-white text-royal-950 shadow-xs font-extrabold transition';
      idBtn.className = 'px-2.5 py-1 rounded-lg text-slate-600 hover:text-royal-950 font-bold transition';
    }

    this.renderSelfCheckList();
  }

  setReviewFilter(filter) {
    this.reviewFilter = filter; // 'all', 'mistakes', 'correct'
    this.updateReviewFilterButtons();
    this.renderSelfCheckList();
  }

  updateReviewFilterButtons() {
    const btnAll = document.getElementById('filterReviewAllBtn');
    const btnMistakes = document.getElementById('filterReviewMistakesBtn');
    const btnCorrect = document.getElementById('filterReviewCorrectBtn');

    const activeClasses = ['bg-white', 'text-royal-950', 'shadow-xs', 'font-extrabold'];
    const inactiveClasses = ['text-slate-600', 'font-bold', 'bg-transparent', 'shadow-none'];

    [btnAll, btnMistakes, btnCorrect].forEach(b => {
      if (b) {
        b.classList.remove(...activeClasses);
        b.classList.add(...inactiveClasses);
      }
    });

    if (this.reviewFilter === 'mistakes' && btnMistakes) {
      btnMistakes.classList.remove(...inactiveClasses);
      btnMistakes.classList.add('bg-rose-50', 'text-rose-900', 'shadow-xs', 'font-extrabold');
    } else if (this.reviewFilter === 'correct' && btnCorrect) {
      btnCorrect.classList.remove(...inactiveClasses);
      btnCorrect.classList.add('bg-emerald-50', 'text-emerald-900', 'shadow-xs', 'font-extrabold');
    } else if (btnAll) {
      btnAll.classList.remove(...inactiveClasses);
      btnAll.classList.add(...activeClasses);
    }
  }

  flagAllMistakes() {
    let addedCount = 0;
    this.dictationWords.forEach(w => {
      const res = this.testResults[w.id];
      if (res && !res.isCorrect) {
        if (!this.starredWordIds.has(w.id)) {
          this.starredWordIds.add(w.id);
          addedCount++;
        }
      }
    });

    this.saveStarredWords();
    this.renderSelfCheckList();
    this.showToast(`⭐ Added ${addedCount} mistaken word(s) to Tricky Words!`);
  }

  formatLetterDiff(target, typed) {
    if (!typed) {
      return `<span class="text-slate-400 italic font-sans text-xs">No answer typed (Skipped)</span>`;
    }

    let html = '';
    for (let i = 0; i < typed.length; i++) {
      const ch = typed[i];
      const targetCh = target[i];
      if (ch === targetCh) {
        html += `<span class="text-emerald-700 bg-emerald-100 font-mono font-black px-0.5 rounded mx-[0.5px]">${ch}</span>`;
      } else {
        html += `<span class="text-rose-700 bg-rose-200 font-mono font-black px-0.5 rounded underline decoration-rose-500 mx-[0.5px]">${ch}</span>`;
      }
    }

    if (typed.length < target.length) {
      const missing = target.slice(typed.length);
      html += `<span class="text-rose-500 font-semibold text-[10px] ml-1.5 font-sans">(missing "${missing}")</span>`;
    }

    return html;
  }

  setAnswerKeySort(sortMode) {
    this.answerKeySort = sortMode; // 'dictation' or 'id'
    
    const dictBtn = document.getElementById('sortDictationOrderBtn');
    const idBtn = document.getElementById('sortWordIdBtn');

    if (dictBtn && idBtn) {
      if (sortMode === 'dictation') {
        dictBtn.className = 'px-2.5 py-1 rounded-lg bg-white text-royal-950 shadow-xs font-extrabold transition';
        idBtn.className = 'px-2.5 py-1 rounded-lg text-slate-600 hover:text-royal-950 font-bold transition';
      } else {
        idBtn.className = 'px-2.5 py-1 rounded-lg bg-white text-royal-950 shadow-xs font-extrabold transition';
        dictBtn.className = 'px-2.5 py-1 rounded-lg text-slate-600 hover:text-royal-950 font-bold transition';
      }
    }

    this.renderSelfCheckList();
  }

  renderSelfCheckList() {
    const container = document.getElementById('selfCheckList');
    if (!container) return;

    let displayList = [...this.dictationWords];

    // Filter
    if (this.reviewFilter === 'mistakes') {
      displayList = displayList.filter(w => this.testResults[w.id] && !this.testResults[w.id].isCorrect);
    } else if (this.reviewFilter === 'correct') {
      displayList = displayList.filter(w => this.testResults[w.id] && this.testResults[w.id].isCorrect);
    }

    // Sort
    if (this.answerKeySort === 'id') {
      displayList.sort((a, b) => a.id - b.id);
    } else {
      displayList.sort((a, b) => (a.dictationSeq || 0) - (b.dictationSeq || 0));
    }

    if (displayList.length === 0) {
      container.innerHTML = `
        <div class="col-span-full py-8 text-center bg-slate-50 rounded-2xl border border-slate-200 text-slate-500">
          <div class="text-3xl mb-1">${this.reviewFilter === 'mistakes' ? '🎉' : '🔍'}</div>
          <p class="font-bold text-sm text-slate-700">
            ${this.reviewFilter === 'mistakes' ? 'Zero mistakes in this filter! Flawless!' : 'No words found'}
          </p>
        </div>
      `;
      return;
    }

    container.innerHTML = displayList.map(w => {
      const res = this.testResults[w.id] || { isCorrect: false, typed: '', cleanTarget: w.cleanWord, isSkipped: true };
      const isStarred = this.starredWordIds.has(w.id);
      const isCorrect = res.isCorrect;

      return `
        <div class="rounded-2xl p-3.5 border transition-all ${
          isCorrect 
            ? 'bg-emerald-50/60 border-emerald-200 hover:border-emerald-300' 
            : 'bg-rose-50/70 border-rose-300 hover:border-rose-400 shadow-2xs'
        }">
          <div class="flex items-start justify-between gap-2">
            
            <div class="flex items-start space-x-2.5 min-w-0">
              <!-- Status checkmark / cross icon -->
              <span class="w-8 h-8 rounded-xl font-black text-xs flex items-center justify-center shrink-0 shadow-2xs ${
                isCorrect 
                  ? 'bg-emerald-500 text-white' 
                  : 'bg-rose-500 text-white'
              }">
                ${isCorrect ? '✓' : '✗'}
              </span>

              <div class="min-w-0">
                <!-- Word & status pill -->
                <div class="flex items-center space-x-2 flex-wrap">
                  <span class="font-heading font-black text-base sm:text-lg tracking-wide ${
                    isCorrect ? 'text-emerald-950' : 'text-slate-900'
                  }">
                    ${w.word}
                  </span>
                  <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    isCorrect ? 'bg-emerald-200 text-emerald-900' : 'bg-rose-200 text-rose-900'
                  }">
                    ${isCorrect ? 'Correct' : (res.isSkipped ? 'Skipped' : 'Mistake')}
                  </span>
                </div>

                <!-- Answer comparison with letter highlighting -->
                <div class="mt-1 text-xs space-y-0.5 font-mono">
                  ${
                    isCorrect
                      ? `<div class="text-emerald-700 text-[11px] font-semibold font-sans">You typed: <span class="font-mono font-bold text-emerald-900">${res.typed}</span></div>`
                      : `
                        <div class="text-slate-700 text-[11px] font-sans">
                          You typed: ${this.formatLetterDiff(res.cleanTarget, res.typed)}
                        </div>
                        <div class="text-emerald-800 text-[11px] font-sans font-bold">
                          Correct: <span class="font-mono font-extrabold text-emerald-900 tracking-wide">${w.cleanWord}</span>
                        </div>
                      `
                  }
                </div>

                <div class="text-[10px] text-slate-400 font-semibold mt-1">
                  Test #${w.dictationSeq || w.id} • Contest Word #${w.id} • Set ${w.set}
                </div>
              </div>
            </div>

            <!-- Actions: Listen & Star -->
            <div class="flex items-center space-x-1 shrink-0">
              <button onclick="window.spellAudio.speakWord(${w.id})" 
                class="p-2 rounded-xl text-slate-500 hover:text-royal-900 hover:bg-white/80 transition active:scale-95 shadow-2xs" 
                title="Pronounce again in Indian English">
                🔊
              </button>

              <button onclick="app.toggleStarWord(${w.id}); app.renderSelfCheckList();" 
                class="p-2 rounded-xl transition active:scale-95 shadow-2xs ${
                  isStarred 
                    ? 'text-amber-500 bg-amber-100 hover:bg-amber-200' 
                    : 'text-slate-400 hover:text-amber-500 hover:bg-white/80'
                }" 
                title="${isStarred ? 'Remove from Tricky Words' : 'Save to Tricky Words'}">
                <svg class="w-4 h-4 ${isStarred ? 'fill-current' : 'fill-none'} stroke-current" viewBox="0 0 24 24" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                </svg>
              </button>
            </div>

          </div>
        </div>
      `;
    }).join('');
  }

  restartSameSetDictation() {
    if (this.dictationMode === 'starred') {
      this.startPracticeStarred();
    } else {
      this.startDictationLoop();
    }
  }

  startNextSetDictation() {
    if (this.dictationSet < 10) {
      this.dictationSet++;
      this.startDictationLoop();
    }
  }

  // =========================================================================
  // TAB 3: STARRED / TRICKY WORDS
  // =========================================================================
  renderStarredWords() {
    const container = document.getElementById('starredWordsContainer');
    const emptyState = document.getElementById('emptyStarredState');
    const practiceBtn = document.getElementById('practiceStarredBtn');
    if (!container) return;

    const starredList = window.SpellBeeData.allWords.filter(w => this.starredWordIds.has(w.id));

    if (starredList.length === 0) {
      container.innerHTML = '';
      if (emptyState) emptyState.classList.remove('hidden');
      if (practiceBtn) practiceBtn.classList.add('hidden');
      return;
    }

    if (emptyState) emptyState.classList.add('hidden');
    if (practiceBtn) practiceBtn.classList.remove('hidden');

    container.innerHTML = starredList.map(w => `
      <div class="bg-white rounded-2xl p-4 border border-amber-200 hover:shadow-md transition flex items-center justify-between">
        <div class="flex items-center space-x-3">
          <span class="w-8 h-8 rounded-xl bg-amber-100 text-amber-900 font-bold text-xs flex items-center justify-center">
            #${w.id}
          </span>
          <div>
            <div class="font-heading font-extrabold text-base sm:text-lg text-slate-800 tracking-wide">
              ${w.word}
            </div>
            <div class="text-[10px] text-slate-400 font-semibold">
              Set ${w.set} • ${w.length} letters
            </div>
          </div>
        </div>

        <div class="flex items-center space-x-2">
          <button onclick="app.speakSingleWord('${w.cleanWord}', ${w.id})" class="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs flex items-center space-x-1 shadow-sm active:scale-95 transition">
            <span>🔊</span>
            <span>Listen</span>
          </button>
          <button onclick="app.toggleStarWord(${w.id})" class="p-2 text-rose-500 hover:bg-rose-50 rounded-xl transition" title="Remove from tricky words">
            ✕
          </button>
        </div>
      </div>
    `).join('');
  }

  startPracticeStarred() {
    const starredList = window.SpellBeeData.allWords.filter(w => this.starredWordIds.has(w.id));
    if (starredList.length === 0) {
      alert("No tricky words starred yet!");
      return;
    }

    this.dictationMode = 'starred';
    this.dictationWords = starredList.map((w, idx) => ({
      ...w,
      dictationSeq: idx + 1
    }));
    this.dictationIndex = 0;
    this.studentAnswers = {};
    this.testResults = {};
    this.reviewFilter = 'all';
    this.switchTab('dictation');

    document.getElementById('dictationSetupScreen').classList.add('hidden');
    document.getElementById('dictationActiveScreen').classList.remove('hidden');
    document.getElementById('dictationCompleteScreen').classList.add('hidden');

    const activeSetTitle = document.getElementById('activeSetTitle');
    if (activeSetTitle) {
      activeSetTitle.textContent = `Jayden's Tricky Words (${starredList.length} Words)`;
    }

    this.dictationState = 'running';
    this.loadDictationWord(0);
  }

  clearAllStarred() {
    if (this.starredWordIds.size === 0) return;
    if (confirm("Are you sure you want to clear your tricky words list?")) {
      this.starredWordIds.clear();
      this.saveStarredWords();
      this.renderStarredWords();
      this.showToast('Cleared tricky words list');
    }
  }

  // =========================================================================
  // SETTINGS & AUDIO MODAL
  // =========================================================================
  openSettingsModal() {
    const modal = document.getElementById('settingsModal');
    if (modal) {
      modal.classList.remove('hidden');
      this.populateVoiceSelect(window.spellAudio.voices, window.spellAudio.selectedVoice);
      
      const rateSlider = document.getElementById('rateSlider');
      if (rateSlider) rateSlider.value = window.spellAudio.rate;
      const rateLabel = document.getElementById('rateValueLabel');
      if (rateLabel) rateLabel.textContent = `${window.spellAudio.rate}x (Championship Clear)`;

      const pitchSlider = document.getElementById('pitchSlider');
      if (pitchSlider) pitchSlider.value = window.spellAudio.pitch;
      const pitchLabel = document.getElementById('pitchValueLabel');
      if (pitchLabel) {
        pitchLabel.textContent = `${window.spellAudio.pitch}x (${window.spellAudio.pitch >= 1.05 ? 'High' : 'Natural & Clear'})`;
      }

      const sfxToggle = document.getElementById('modalSfxToggle');
      if (sfxToggle) sfxToggle.checked = window.spellAudio.sfxEnabled;
    }
  }

  closeSettingsModal() {
    const modal = document.getElementById('settingsModal');
    if (modal) modal.classList.add('hidden');
  }

  selectVoicePreset(preset) {
    window.spellAudio.applyVoicePreset(preset);

    const rateSlider = document.getElementById('rateSlider');
    if (rateSlider) rateSlider.value = window.spellAudio.rate;
    const rateLabel = document.getElementById('rateValueLabel');
    if (rateLabel) rateLabel.textContent = `${window.spellAudio.rate}x (Articulate & Bold)`;

    const pitchSlider = document.getElementById('pitchSlider');
    if (pitchSlider) pitchSlider.value = window.spellAudio.pitch;
    const pitchLabel = document.getElementById('pitchValueLabel');
    if (pitchLabel) {
      pitchLabel.textContent = `${window.spellAudio.pitch}x (${window.spellAudio.pitch >= 1.05 ? 'Sweet & Bright' : 'Natural'})`;
    }

    // Highlight active preset button
    const sweetBtn = document.getElementById('presetSweetBtn');
    const teacherBtn = document.getElementById('presetTeacherBtn');
    const standardBtn = document.getElementById('presetStandardBtn');
    const activeClass = ['border-2', 'border-amber-400', 'bg-amber-50', 'text-amber-900', 'shadow-sm'];
    const inactiveClass = ['border', 'border-slate-200', 'bg-white', 'text-slate-700'];

    [sweetBtn, teacherBtn, standardBtn].forEach(b => {
      if (b) {
        b.classList.remove(...activeClass);
        b.classList.add(...inactiveClass);
      }
    });

    if (preset === 'sweet' && sweetBtn) {
      sweetBtn.classList.remove(...inactiveClass);
      sweetBtn.classList.add(...activeClass);
      this.showToast('🌸 Switched to Sweet & Clear tone!');
    } else if (preset === 'teacher' && teacherBtn) {
      teacherBtn.classList.remove(...inactiveClass);
      teacherBtn.classList.add(...activeClass);
      this.showToast('👩‍🏫 Switched to Teacher tone!');
    } else if (preset === 'standard' && standardBtn) {
      standardBtn.classList.remove(...inactiveClass);
      standardBtn.classList.add(...activeClass);
      this.showToast('🎯 Switched to Official Bee tone!');
    }

    window.spellAudio.speakWord("welcome");
  }

  handlePitchChange(val) {
    const pitch = parseFloat(val);
    window.spellAudio.setPitch(pitch);
    const label = document.getElementById('pitchValueLabel');
    if (label) {
      label.textContent = `${pitch}x (${pitch >= 1.05 ? 'Sweet & Bright' : 'Natural'})`;
    }
  }

  initVoiceSelector() {
    if (window.spellAudio.voices.length > 0) {
      this.populateVoiceSelect(window.spellAudio.voices, window.spellAudio.selectedVoice);
    }
  }

  populateVoiceSelect(voices, selectedVoice) {
    const select = document.getElementById('voiceSelect');
    const quickSelect = document.getElementById('quickVoiceSelect');
    const badge = document.getElementById('detectedAccentBadge');

    const indianVoices = [];
    const otherVoices = [];

    voices.forEach(v => {
      const name = (v.name || '').toLowerCase();
      const lang = (v.lang || '').toLowerCase().replace(/_/g, '-');
      const isIndian = lang === 'en-in' || lang.includes('en-in') || name.includes('india') || name.includes('indian');

      if (isIndian) {
        indianVoices.push(v);
      } else {
        otherVoices.push(v);
      }
    });

    const getVoiceDisplayLabel = (v) => {
      const name = (v.name || '').toLowerCase();
      if (/tara/i.test(name)) return `🌸 Tara (Indian Female • Natural & Clear)`;
      if (/rishi/i.test(name)) return `🎙️ Rishi (Indian Male • Crisp Dictation)`;
      if (/aman/i.test(name)) return `🎙️ Aman (Indian Male • Articulate)`;
      if (/neerja/i.test(name)) return `✨ Neerja (Indian Neural • Clear)`;
      if (/swara/i.test(name)) return `✨ Swara (Indian Neural • Sweet)`;
      if (/priya/i.test(name)) return `✨ Priya (Indian Neural)`;
      if (/kavya/i.test(name)) return `✨ Kavya (Indian Neural)`;
      if (/google/i.test(name)) return `🌐 Google English (India)`;
      if (/heera/i.test(name)) return `🌸 Heera (Indian English)`;
      if (/veena/i.test(name)) return `🌸 Veena (Indian English)`;
      if (/lekha/i.test(name)) return `🌸 Lekha (Indian English)`;
      if (/prabhat/i.test(name)) return `🎙️ Prabhat (Indian English)`;
      return `🇮🇳 ${v.name}`;
    };

    let html = '';

    if (indianVoices.length > 0) {
      html += `<optgroup label="🇮🇳 Indian English Voices (Recommended for Jayden)">`;
      html += indianVoices.map(v => {
        const isSelected = selectedVoice && selectedVoice.voiceURI === v.voiceURI;
        return `<option value="${v.voiceURI}" ${isSelected ? 'selected' : ''}>${getVoiceDisplayLabel(v)}</option>`;
      }).join('');
      html += `</optgroup>`;
    }

    if (otherVoices.length > 0) {
      html += `<optgroup label="🌐 Other Device English Voices">`;
      html += otherVoices.slice(0, 15).map(v => {
        const isSelected = selectedVoice && selectedVoice.voiceURI === v.voiceURI;
        return `<option value="${v.voiceURI}" ${isSelected ? 'selected' : ''}>${v.name} (${v.lang})</option>`;
      }).join('');
      html += `</optgroup>`;
    }

    if (select) select.innerHTML = html;
    if (quickSelect) quickSelect.innerHTML = html;

    if (badge && selectedVoice) {
      const name = (selectedVoice.name || '').toLowerCase();
      const isIndian = selectedVoice.lang === 'en-IN' || selectedVoice.lang === 'en_IN' || /india/i.test(name);
      if (isIndian) {
        badge.textContent = `🇮🇳 ${selectedVoice.name} (en-IN Active)`;
        badge.className = 'text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200';
      } else {
        badge.textContent = selectedVoice.lang;
        badge.className = 'text-[10px] font-bold text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200';
      }
    }
  }

  handleVoiceChange(voiceURI) {
    window.spellAudio.setVoice(voiceURI);
    const selected = window.spellAudio.selectedVoice;

    // Sync both dropdowns
    const select = document.getElementById('voiceSelect');
    const quickSelect = document.getElementById('quickVoiceSelect');
    if (select && select.value !== voiceURI) select.value = voiceURI;
    if (quickSelect && quickSelect.value !== voiceURI) quickSelect.value = voiceURI;

    const badge = document.getElementById('detectedAccentBadge');
    if (badge && selected) {
      const name = (selected.name || '').toLowerCase();
      const isIndian = selected.lang === 'en-IN' || selected.lang === 'en_IN' || /india/i.test(name);
      if (isIndian) {
        badge.textContent = `🇮🇳 ${selected.name} Active`;
        badge.className = 'text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200';
      } else {
        badge.textContent = selected.lang;
        badge.className = 'text-[10px] font-bold text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200';
      }
    }

    const voiceName = selected ? selected.name : 'Voice';
    this.showToast(`🇮🇳 Voice switched to ${voiceName}!`);
  }

  setQuickSpeed(rate) {
    window.spellAudio.setRate(rate);
    const rateSlider = document.getElementById('rateSlider');
    if (rateSlider) rateSlider.value = rate;
    const rateLabel = document.getElementById('rateValueLabel');
    if (rateLabel) rateLabel.textContent = `${rate.toFixed(2)}x (Cadence)`;

    const btnSlow = document.getElementById('speedPillSlow');
    const btnClear = document.getElementById('speedPillClear');
    const btnNormal = document.getElementById('speedPillNormal');

    const activeClasses = ['border-amber-500', 'text-white', 'bg-amber-500', 'shadow-sm'];
    const inactiveClasses = ['border-amber-300/80', 'text-amber-900', 'bg-white'];

    [btnSlow, btnClear, btnNormal].forEach(b => {
      if (b) {
        b.classList.remove(...activeClasses);
        b.classList.add(...inactiveClasses);
      }
    });

    if (rate <= 0.75 && btnSlow) {
      btnSlow.classList.remove(...inactiveClasses);
      btnSlow.classList.add(...activeClasses);
    } else if (rate >= 0.98 && btnNormal) {
      btnNormal.classList.remove(...inactiveClasses);
      btnNormal.classList.add(...activeClasses);
    } else if (btnClear) {
      btnClear.classList.remove(...inactiveClasses);
      btnClear.classList.add(...activeClasses);
    }

    this.showToast(`Pronunciation speed: ${rate}x`);
  }

  testVoiceNow() {
    window.spellAudio.playDing();
    window.spellAudio.speakWord("ACQUIESCENCE");
    const voiceName = window.spellAudio.selectedVoice ? window.spellAudio.selectedVoice.name : "Indian Voice";
    this.showToast(`🔊 Pronouncing with ${voiceName}`);
  }

  handleRateChange(val) {
    const rate = parseFloat(val);
    window.spellAudio.setRate(rate);
    const label = document.getElementById('rateValueLabel');
    if (label) label.textContent = `${rate}x (Championship Clear)`;

    // Sync quick pills
    const btnSlow = document.getElementById('speedPillSlow');
    const btnClear = document.getElementById('speedPillClear');
    const btnNormal = document.getElementById('speedPillNormal');
    const activeClasses = ['border-amber-500', 'text-white', 'bg-amber-500', 'shadow-sm'];
    const inactiveClasses = ['border-amber-300/80', 'text-amber-900', 'bg-white'];

    [btnSlow, btnClear, btnNormal].forEach(b => {
      if (b) {
        b.classList.remove(...activeClasses);
        b.classList.add(...inactiveClasses);
      }
    });

    if (rate <= 0.75 && btnSlow) {
      btnSlow.classList.remove(...inactiveClasses);
      btnSlow.classList.add(...activeClasses);
    } else if (rate >= 0.98 && btnNormal) {
      btnNormal.classList.remove(...inactiveClasses);
      btnNormal.classList.add(...activeClasses);
    } else if (btnClear) {
      btnClear.classList.remove(...inactiveClasses);
      btnClear.classList.add(...activeClasses);
    }
  }

  handleSfxToggle(checked) {
    window.spellAudio.sfxEnabled = checked;
    window.spellAudio.savePreferences();
  }

  testSpeechSentence() {
    window.spellAudio.playDing();
    window.spellAudio.speakWord("Hello Jayden! Welcome to your Spell Bee Trainer. Let us practice and win!");
    this.showToast('🌸 Playing sample voice speech...');
  }

  testSpeechSynthesis() {
    window.spellAudio.playDing();
    window.spellAudio.speakWord("ACQUIESCENCE");
    this.showToast('🔊 Testing word: ACQUIESCENCE');
  }

  // =========================================================================
  // TOAST NOTIFICATIONS & CONFETTI
  // =========================================================================
  showToast(msg, icon = '🐝') {
    const toast = document.getElementById('toast');
    const toastMsg = document.getElementById('toastMsg');
    const toastIcon = document.getElementById('toastIcon');
    if (!toast) return;

    if (toastMsg) toastMsg.textContent = msg;
    if (toastIcon) toastIcon.textContent = icon;

    toast.classList.remove('opacity-0', 'pointer-events-none', 'translate-y-[-10px]');
    toast.classList.add('opacity-100', 'translate-y-0');

    setTimeout(() => {
      toast.classList.add('opacity-0', 'pointer-events-none', 'translate-y-[-10px]');
      toast.classList.remove('opacity-100', 'translate-y-0');
    }, 2400);
  }

  // Lightweight 60fps Canvas Confetti
  triggerConfetti() {
    const canvas = document.getElementById('confettiCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const colors = ['#F59E0B', '#FBBF24', '#3B82F6', '#10B981', '#EC4899', '#8B5CF6'];
    const particles = Array.from({ length: 120 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height - canvas.height,
      size: Math.random() * 8 + 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      speedY: Math.random() * 4 + 3,
      speedX: (Math.random() - 0.5) * 4,
      rotation: Math.random() * 360,
      rotSpeed: (Math.random() - 0.5) * 6
    }));

    let animationId;
    let frames = 0;

    function render() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach(p => {
        p.y += p.speedY;
        p.x += p.speedX;
        p.rotation += p.rotSpeed;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
      });

      frames++;
      if (frames < 180) {
        animationId = requestAnimationFrame(render);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }

    render();
  }
}

// Instantiate on load
document.addEventListener('DOMContentLoaded', () => {
  window.app = new SpellBeeApp();
});
