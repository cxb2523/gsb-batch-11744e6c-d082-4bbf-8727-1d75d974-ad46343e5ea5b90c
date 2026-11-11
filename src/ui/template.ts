import { ICONS } from './icons';
import { logoSvg, spoolIconSvg } from './logo';

export const SOURCE_URL = 'https://github.com/makerjackie/yarn-planet';

/** Static markup for the whole interface. Text is filled by `data-copy*`,
 * `data-story` and the setters in GameUI so every language switch is live. */
export function interfaceMarkup(): string {
  const close = (label: string, extra = '') => `<button class="close-button ${extra}" type="button" data-copy-aria="${label}" data-copy-title="${label}">${ICONS.close}</button>`;
  const confetti = Array.from({ length: 14 }, (_, index) => `<i style="--i:${index}"></i>`).join('');
  return `
    <section class="intro-screen" data-copy-aria="startScreen">
      <nav class="language-picker title-language" role="group" data-copy-aria="language"></nav>
      <div class="intro-copy">
        <h1 class="logo">${logoSvg({ id: 'title-logo' })}</h1>
        <p class="intro-subtitle" data-copy="subtitle"></p>
      </div>
      <div class="intro-actions">
        <button class="paper-button primary begin-button" type="button" disabled><span class="begin-label"></span><span class="begin-arrow" aria-hidden="true">→</span></button>
        <div class="thread-progress" role="progressbar" data-copy-aria="loadingProgress" aria-valuemin="0" aria-valuemax="100"><span class="thread-track"></span><span class="thread-fill"></span><span class="thread-bead"></span></div>
        <p class="loading-copy" role="status"></p>
        <p class="saved-progress" hidden></p>
        <button class="text-button new-journey-button" type="button" hidden data-copy="newJourney"></button>
      </div>
      <footer class="intro-footer"><button class="text-button credits-open" type="button" data-copy="credits"></button><a class="text-button source-link" href="${SOURCE_URL}" target="_blank" rel="noopener noreferrer" data-copy="sourceCode"></a></footer>
    </section>

    <div class="hud" hidden>
      <aside class="objective-card paper" data-copy-aria="objective">
        <span class="objective-icon">${spoolIconSvg('var(--thread, #ffcf4a)')}</span>
        <div class="objective-body">
          <p class="objective-title"></p>
          <p class="objective-detail"></p>
          <div class="compass" hidden data-copy-aria="compass">
            <span class="compass-dial" aria-hidden="true">${ICONS.arrow}</span>
            <span class="compass-label"></span>
          </div>
        </div>
      </aside>
      <div class="utility-controls">
        <button class="icon-button postcard-button" type="button" hidden data-copy-aria="postcardOpen" data-copy-title="postcardOpen">${ICONS.camera}</button>
        <button class="icon-button help-button" type="button" data-copy-aria="helpOpen" data-copy-title="help">${ICONS.help}</button>
        <button class="icon-button journal-button" type="button" data-copy-aria="journalOpen" data-copy-title="journalShortcut">${ICONS.journal}</button>
        <button class="icon-button settings-button" type="button" data-copy-aria="settingsOpen" data-copy-title="settings">${ICONS.settings}</button>
      </div>
      <div class="hud-left">
        <div class="spool-meter" hidden role="status">
          <svg class="spool-ring" viewBox="0 0 80 80" aria-hidden="true">
            <circle class="ring-outline" cx="40" cy="40" r="30"/>
            <circle class="ring-track" cx="40" cy="40" r="30"/>
            <circle class="ring-fill" cx="40" cy="40" r="30" pathLength="100"/>
            <circle class="ring-hub" cx="40" cy="40" r="19"/>
          </svg>
          <span class="spool-glyph" aria-hidden="true">${spoolIconSvg('var(--thread, #ffcf4a)')}</span>
          <span class="spool-label"><kbd>R</kbd><span class="spool-text"></span></span>
        </div>
      </div>
      <div class="interaction-prompt" hidden>
        <button class="interact-chip" type="button"><kbd>E</kbd><span class="chip-text"><b class="prompt-subject"></b><span class="prompt-action"></span></span></button>
      </div>
      <p class="keyboard-hint"><span><kbd>WASD</kbd> <b data-copy="hintMove"></b></span><span><kbd>␣</kbd> <b data-copy="hintJump"></b></span><span><kbd>⇧</kbd> <b data-copy="hintRun"></b></span><span><kbd>J</kbd> <b data-copy="hintJournal"></b></span><span><kbd>Esc</kbd> <b data-copy="hintMenu"></b></span></p>
      <div class="touch-controls">
        <div class="joystick" role="application" data-copy-aria="joystick"><div class="joystick-knob"></div></div>
        <div class="touch-actions">
          <button class="touch-button touch-reel" type="button" hidden data-copy-aria="touchReel">${ICONS.reel}<span data-copy="touchReel"></span></button>
          <button class="touch-button touch-jump" type="button" data-copy-aria="touchJump">${ICONS.jump}<span data-copy="touchJump"></span></button>
          <button class="touch-button touch-interact" type="button" data-copy-aria="touchInteract" disabled>${ICONS.hand}<span data-copy="touchInteract"></span></button>
        </div>
      </div>
    </div>

    <p class="caption" hidden aria-live="polite"></p>
    <div class="notice-paper" role="status" hidden></div>

    <section class="dialogue-overlay" data-copy-aria="dialogue" hidden>
      <div class="dialogue-paper paper" role="dialog" aria-modal="true" aria-labelledby="dialogue-name">
        <p class="dialogue-name" id="dialogue-name"></p>
        ${close('dialogueClose', 'dialogue-close')}
        <p class="dialogue-text"></p>
        <div class="dialogue-bottom"><span class="dialogue-step"></span><button class="paper-button primary dialogue-action" type="button"></button></div>
        <span class="dialogue-key" data-copy="dialogueKeys"></span>
      </div>
    </section>

    <section class="modal-overlay help-overlay" hidden>
      <div class="sheet paper help-sheet" role="dialog" aria-modal="true" aria-labelledby="help-title">
        ${close('helpClose', 'sheet-close')}
        <h2 id="help-title" data-copy="helpTitle"></h2>
        <p class="sheet-intro" data-copy="helpIntro"></p>
        <dl class="controls-list">
          <div><dt><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> <small data-copy="keyArrows"></small></dt><dd data-copy="helpMove"></dd></div>
          <div><dt><kbd>⇧</kbd> Shift</dt><dd data-copy="helpRun"></dd></div>
          <div><dt><kbd>␣</kbd> <small data-copy="keySpace"></small></dt><dd data-copy="helpJump"></dd></div>
          <div><dt><kbd>E</kbd></dt><dd data-copy="helpInteract"></dd></div>
          <div><dt><kbd>R</kbd></dt><dd data-copy="helpReel"></dd></div>
          <div><dt><small data-copy="keyDrag"></small></dt><dd data-copy="helpOrbit"></dd></div>
          <div><dt><small data-copy="keyWheel"></small></dt><dd data-copy="helpZoom"></dd></div>
          <div><dt><kbd>J</kbd></dt><dd data-copy="helpJournal"></dd></div>
          <div><dt><kbd>Esc</kbd></dt><dd data-copy="helpMenu"></dd></div>
        </dl>
        <p class="touch-help" data-copy="helpTouch"></p>
        <button class="paper-button primary help-done" type="button" data-copy="helpDone"></button>
      </div>
    </section>

    <section class="modal-overlay journal-overlay" hidden>
      <div class="sheet paper journal-sheet" role="dialog" aria-modal="true" aria-labelledby="journal-title">
        ${close('journalClose', 'sheet-close journal-close')}
        <h2 id="journal-title" data-copy="journalTitle"></h2>
        <p class="journal-count"></p>
        <div class="journal-list"></div>
        <p class="journal-note"></p>
      </div>
    </section>

    <section class="modal-overlay settings-overlay" hidden>
      <div class="sheet paper settings-sheet" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        ${close('settingsClose', 'sheet-close settings-close')}
        <h2 id="settings-title" data-copy="settings"></h2>
        <div class="settings-row">
          <div class="settings-text"><b data-copy="soundLabel"></b><span data-copy="soundDetail"></span></div>
          <button class="switch sound-switch" type="button" role="switch" aria-checked="true"><span class="switch-knob"></span><span class="switch-label"></span></button>
        </div>
        <div class="settings-row">
          <div class="settings-text"><b data-copy="guidesLabel"></b><span data-copy="guidesDetail"></span></div>
          <button class="switch guides-switch" type="button" role="switch" aria-checked="true"><span class="switch-knob"></span><span class="switch-label"></span></button>
        </div>
        <div class="settings-row stacked">
          <div class="settings-text"><b data-copy="languageLabel"></b></div>
          <nav class="language-picker settings-language" role="group" data-copy-aria="language"></nav>
        </div>
        <div class="settings-actions">
          <button class="ghost-button credits-open" type="button" data-copy="credits"></button>
          <button class="ghost-button reset-open" type="button" data-copy="restart"></button>
        </div>
      </div>
    </section>

    <section class="modal-overlay reset-overlay" hidden>
      <div class="sheet paper reset-sheet" role="alertdialog" aria-modal="true" aria-labelledby="reset-title">
        <h2 id="reset-title" data-copy="resetTitle"></h2>
        <p class="sheet-intro" data-copy="resetDetail"></p>
        <div class="reset-actions"><button class="paper-button primary reset-cancel" type="button" data-copy="keepProgress"></button><button class="paper-button reset-confirm" type="button" data-copy="restart"></button></div>
      </div>
    </section>

    <section class="modal-overlay credits-overlay" hidden>
      <div class="sheet paper credits-sheet" role="dialog" aria-modal="true" aria-labelledby="credits-title">
        ${close('creditsClose', 'sheet-close credits-close')}
        <h2 id="credits-title" class="credits-title" data-copy-aria="creditsTitle">${logoSvg({ id: 'credits-logo', animate: false, className: 'logo-svg credits-logo' })}</h2>
        <p class="credits-made" data-copy="creditsMadeBy"></p>
        <p class="credits-follow" data-copy="creditsFollow"></p>
        <p data-copy="creditsOriginal"></p>
        <p data-copy="creditsAudio"></p>
        <p><a href="${SOURCE_URL}" target="_blank" rel="noopener noreferrer" data-copy="creditsSource"></a></p>
        <p class="credits-inspired" data-copy-inspired="creditsInspired"></p>
      </div>
    </section>

    <section class="modal-overlay chapter-overlay" hidden>
      <div class="chapter-confetti" aria-hidden="true">${confetti}</div>
      <div class="chapter-card paper" role="dialog" aria-modal="true" aria-labelledby="chapter-title">
        <svg class="chapter-thread" viewBox="0 0 320 36" aria-hidden="true" fill="none" stroke-linecap="round"><path class="thread-ink" d="M8 20C50 4 70 34 112 18S190 6 214 20 280 30 312 14"/><path class="thread-color" d="M8 20C50 4 70 34 112 18S190 6 214 20 280 30 312 14" stroke="url(#chapter-grad)"/><defs><linearGradient id="chapter-grad" x1="0" x2="1"><stop offset="0" style="stop-color:var(--power)"/><stop offset=".25" style="stop-color:var(--water)"/><stop offset=".5" style="stop-color:var(--lights)"/><stop offset=".75" style="stop-color:var(--voice)"/><stop offset="1" style="stop-color:var(--root)"/></linearGradient></defs></svg>
        <h2 id="chapter-title" data-story="chapter.title"></h2>
        <p class="chapter-end" data-story="chapter.end"></p>
        <p class="chapter-stats" data-copy="chapterStats"></p>
        <div class="chapter-actions">
          <button class="paper-button primary chapter-postcard" type="button" data-copy="makePostcard"></button>
          <button class="paper-button chapter-continue" type="button" data-copy="wander"></button>
          <button class="text-button chapter-restart" type="button" data-copy="restart"></button>
        </div>
      </div>
    </section>

    <section class="modal-overlay postcard-overlay" hidden>
      <div class="postcard-dialog" role="dialog" aria-modal="true" data-copy-aria="postcardPreview">
        ${close('postcardClose', 'postcard-x')}
        <div class="postcard-preview"><p class="postcard-wait" data-copy="postcardPreparing"></p></div>
        <div class="postcard-actions">
          <button class="paper-button primary postcard-save" type="button" disabled data-story="postcard.save"></button>
          <button class="paper-button postcard-wander" type="button" data-story="postcard.close"></button>
        </div>
      </div>
    </section>

    <div class="error-paper paper" role="alert" hidden></div>`;
}
