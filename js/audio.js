// Jayden's Spell Bee Trainer - Audio & Speech Synthesis Engine
// Configured specifically for Indian English (en-IN) Speech Synthesis & Audio Feedback

class SpellBeeAudio {
  constructor() {
    this.synth = window.speechSynthesis;
    this.voices = [];
    this.selectedVoice = null;
    this.rate = 0.90; // Crisp, articulate, competition-grade cadence
    this.pitch = 1.00; // 1.0 = Pure natural human timbre (no artificial chipmunk distortion)
    this.volume = 1.0; // Guaranteed full volume
    this.sfxEnabled = true;
    this.currentUtterance = null;
    this.audioCtx = null;
    this.isSpeakingNow = false;

    // Load user audio preferences if saved
    this.loadPreferences();

    // Safety check on volume
    if (typeof this.volume !== 'number' || isNaN(this.volume) || this.volume <= 0) {
      this.volume = 1.0;
    }

    // Load voices
    this.initVoices();
    if (this.synth) {
      if (this.synth.onvoiceschanged !== undefined) {
        this.synth.onvoiceschanged = () => this.initVoices();
      }
    }
  }

  loadPreferences() {
    try {
      const savedRate = localStorage.getItem('spellbee_rate');
      if (savedRate) {
        const r = parseFloat(savedRate);
        // If old default 0.83 was saved, upgrade to the clearer 0.90
        this.rate = (r === 0.83) ? 0.90 : r;
      }

      const savedPitch = localStorage.getItem('spellbee_pitch');
      if (savedPitch) {
        const p = parseFloat(savedPitch);
        // If old artificial pitched values (1.06 or 1.08) were saved, reset to natural 1.0
        this.pitch = (p > 1.04) ? 1.00 : p;
      }

      const savedSfx = localStorage.getItem('spellbee_sfx');
      if (savedSfx !== null) this.sfxEnabled = savedSfx === 'true';

      const savedVoiceURI = localStorage.getItem('spellbee_voice_uri');
      if (savedVoiceURI) this.preferredVoiceURI = savedVoiceURI;
    } catch (e) {
      console.warn("Storage access restricted:", e);
    }
    this.volume = 1.0;
  }

  savePreferences() {
    try {
      localStorage.setItem('spellbee_rate', this.rate);
      localStorage.setItem('spellbee_pitch', this.pitch);
      localStorage.setItem('spellbee_sfx', this.sfxEnabled);
      if (this.selectedVoice) {
        localStorage.setItem('spellbee_voice_uri', this.selectedVoice.voiceURI);
      }
    } catch (e) {
      console.warn("Could not save preferences:", e);
    }
  }

  // Calculate quality rank prioritizing authentic Indian English voices (en-IN)
  getVoiceRank(v) {
    const name = (v.name || '').toLowerCase();
    const lang = (v.lang || '').toLowerCase().replace(/_/g, '-');
    const isIndian = lang === 'en-in' || lang.includes('en-in') || name.includes('india') || name.includes('indian');

    // Tier 1: Natural Neural Indian Voices (Microsoft Neerja, Swara, Priya, Kavya in Edge)
    if (isIndian && /neerja|swara|kavya|priya/i.test(name)) return 1000;
    if (isIndian && /natural|online/i.test(name) && !/ravi|prabhat|male|guy/i.test(name)) return 990;

    // Tier 2: macOS / iOS Premium Indian Voices
    // Tara (clear, articulate, natural female)
    if (isIndian && /tara/i.test(name)) return 980;
    // Rishi (crisp, bold, championship dictation male)
    if (isIndian && /rishi/i.test(name)) return 970;
    // Aman (warm, articulate male)
    if (isIndian && /aman/i.test(name)) return 960;
    // Veena / Lekha / Heera
    if (isIndian && /veena|lekha|heera/i.test(name)) return 950;

    // Tier 3: Google Indian English (Chrome & Android)
    if (isIndian && /google/i.test(name)) return 940;
    if (isIndian && /prabhat|ravi/i.test(name)) return 930;

    // Tier 4: Any other Indian English voice
    if (isIndian) return 900;

    // Tier 5: Fallback High-Quality English voices if device has zero Indian voices installed
    if (/natural|online/i.test(name) && /jenny|aria|sonia|libby|clara/i.test(name)) return 500;
    if (lang.startsWith('en') && /female|samantha|victoria|karen/i.test(name)) return 400;
    if (lang.startsWith('en')) return 300;
    return 100;
  }

  initVoices() {
    if (!this.synth) return;
    const rawVoices = this.synth.getVoices();
    if (!rawVoices || rawVoices.length === 0) return;

    // Sort voices by our Indian English quality hierarchy
    this.voices = [...rawVoices].sort((a, b) => this.getVoiceRank(b) - this.getVoiceRank(a));

    // If user previously selected a specific voice that still exists, retain it
    if (this.preferredVoiceURI) {
      const found = this.voices.find(v => v.voiceURI === this.preferredVoiceURI);
      if (found) {
        this.selectedVoice = found;
        this.dispatchVoiceReady();
        return;
      }
    }

    // Default to the top-ranked voice (highest rated Indian English voice available)
    if (this.voices.length > 0) {
      this.selectedVoice = this.voices[0];
    }

    this.dispatchVoiceReady();
  }

  dispatchVoiceReady() {
    const event = new CustomEvent('spellbee-voices-ready', {
      detail: {
        voices: this.voices,
        selectedVoice: this.selectedVoice
      }
    });
    window.dispatchEvent(event);
  }

  setVoice(voiceURI) {
    const v = this.voices.find(item => item.voiceURI === voiceURI);
    if (v) {
      this.selectedVoice = v;
      this.savePreferences();
    }
  }

  setRate(rate) {
    this.rate = Math.max(0.5, Math.min(1.5, rate));
    this.savePreferences();
  }

  setPitch(pitch) {
    this.pitch = Math.max(0.7, Math.min(1.4, pitch));
    this.savePreferences();
  }

  // Voice presets for Jayden
  applyVoicePreset(preset) {
    if (preset === 'championship' || preset === 'teacher') {
      // Crisp & Bold Contest Dictation (Recommended)
      this.pitch = 1.00;
      this.rate = 0.90;
    } else if (preset === 'slow') {
      // Slow & Syllable-by-syllable study
      this.pitch = 1.00;
      this.rate = 0.72;
    } else if (preset === 'standard' || preset === 'sweet') {
      // Natural conversational
      this.pitch = 1.00;
      this.rate = 0.95;
    }
    this.savePreferences();
  }

  // Resolves the natural whole-word pronunciation string (always lowercase or phonetic, never ALL-CAPS)
  getSpokenText(word) {
    if (!word) return '';

    // If an object with spokenWord property was passed
    if (typeof word === 'object' && word !== null && word.spokenWord) {
      return word.spokenWord.toLowerCase().trim();
    }

    // If a numeric word ID was passed
    if (typeof word === 'number' && window.SpellBeeData) {
      const found = window.SpellBeeData.getWordById(word);
      if (found && found.spokenWord) return found.spokenWord.toLowerCase().trim();
    }

    const str = String(word).trim();

    // Check SpellBeeData pronunciation lookup
    if (window.SpellBeeData && typeof window.SpellBeeData.getSpokenWord === 'function') {
      return window.SpellBeeData.getSpokenWord(str);
    }

    const key = str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
    if (window.SpellBeeData && window.SpellBeeData.pronunciations && window.SpellBeeData.pronunciations[key]) {
      return window.SpellBeeData.pronunciations[key].toLowerCase().trim();
    }

    // Critical: ALWAYS convert to lowercase so speech synthesis engines treat it as a standard word, not an acronym
    return key.toLowerCase().trim();
  }

  // Speak *only the word clearly* without spelling it out
  speakWord(word, onStart = null, onEnd = null, onError = null) {
    if (!this.synth) {
      alert("Speech synthesis is not supported in this browser.");
      if (onEnd) onEnd();
      return;
    }

    // Resolve whole-word spoken text (never uppercase, preventing acronym letter-by-letter spelling)
    const textToSpeak = this.getSpokenText(word);
    if (!textToSpeak) {
      if (onEnd) onEnd();
      return;
    }

    // Cancel any active speech first
    this.cancel();

    const utterance = new SpeechSynthesisUtterance(textToSpeak);

    // Guaranteed full volume and valid numeric rate/pitch
    utterance.volume = 1.0;
    utterance.rate = Number(this.rate) || 0.83;
    utterance.pitch = Number(this.pitch) || 1.06;

    // Lazy-load voices if getVoices was empty during initial page load
    if (!this.selectedVoice && this.synth) {
      const available = this.synth.getVoices();
      if (available && available.length > 0) {
        this.initVoices();
      }
    }

    // Configure Voice and matching language code (prevents rejection when voice.lang != utterance.lang)
    if (this.selectedVoice) {
      utterance.voice = this.selectedVoice;
      utterance.lang = this.selectedVoice.lang || 'en-IN';
    } else {
      utterance.lang = 'en-IN';
    }

    utterance.onstart = () => {
      this.isSpeakingNow = true;
      if (onStart) onStart();
    };

    utterance.onend = () => {
      this.isSpeakingNow = false;
      this.currentUtterance = null;
      if (onEnd) onEnd();
    };

    utterance.onerror = (err) => {
      console.warn("Speech error on voice:", utterance.voice ? utterance.voice.name : 'default', err);
      this.isSpeakingNow = false;
      this.currentUtterance = null;

      // Automatic Fallback: If an online voice failed (e.g. network issue), retry once with default system voice
      if (utterance.voice && (!err || err.error === 'network' || err.error === 'voice-unavailable' || err.error === 'audio-busy' || err.error === 'synthesis-failed')) {
        console.log("Automatically retrying with default system voice...");
        const fallback = new SpeechSynthesisUtterance(textToSpeak);
        fallback.volume = 1.0;
        fallback.rate = Number(this.rate) || 0.83;
        fallback.pitch = Number(this.pitch) || 1.06;
        fallback.onend = () => { if (onEnd) onEnd(); };
        this.currentUtterance = fallback;
        if (this.synth.paused) this.synth.resume();
        this.synth.speak(fallback);
        return;
      }

      if (onError) onError(err);
      else if (onEnd) onEnd();
    };

    // Store reference to avoid browser garbage collection bug
    this.currentUtterance = utterance;

    // 20ms delay prevents Chromium cancel-race condition where cancel() immediately cancels speak()
    setTimeout(() => {
      try {
        if (this.synth.paused) {
          this.synth.resume();
        }
        this.synth.speak(utterance);
      } catch (e) {
        console.warn("Synth speak exception:", e);
        if (onEnd) onEnd();
      }
    }, 20);
  }

  cancel() {
    if (this.synth) {
      this.synth.cancel();
      this.currentUtterance = null;
    }
  }

  pause() {
    if (this.synth && this.synth.speaking) {
      this.synth.pause();
    }
  }

  resume() {
    if (this.synth && this.synth.paused) {
      this.synth.resume();
    }
  }

  // --- Web Audio Synthesizer Sound Effects (100% offline, no assets needed) ---
  getAudioContext() {
    if (!this.audioCtx) {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      if (AudioCtxClass) {
        this.audioCtx = new AudioCtxClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  // Gentle bell ding before dictating a word
  playDing() {
    if (!this.sfxEnabled) return;
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5

      gain.gain.setValueAtTime(0.001, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.45);
    } catch (e) {
      // AudioContext might be blocked until user gesture
    }
  }

  // Play celebration fanfare / chime
  playVictoryChime() {
    if (!this.sfxEnabled) return;
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;

      const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        const startTime = ctx.currentTime + idx * 0.12;
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, startTime);

        gain.gain.setValueAtTime(0.001, startTime);
        gain.gain.linearRampToValueAtTime(0.2, startTime + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.6);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(startTime);
        osc.stop(startTime + 0.65);
      });
    } catch (e) {
      console.warn("AudioContext error:", e);
    }
  }

  // Soft UI click
  playTick() {
    if (!this.sfxEnabled) return;
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(400, ctx.currentTime);

      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.06);
    } catch (e) {}
  }
}

// Global audio singleton
window.spellAudio = new SpellBeeAudio();
