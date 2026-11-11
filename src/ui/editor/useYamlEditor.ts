/**
 * Custom hook encapsulating the CodeMirror 6 lifecycle for the YAML Score Editor.
 * Features:
 * - Dynamic Compartments for zero-reload Theme & Read-Only swapping
 * - Debounced re-evaluation (~150ms) protecting 60fps WebGL diorama performance
 * - Bidirectional sync guard preventing external-props echo loops
 * - Jump-to-line helper for instant syntax diagnostic navigation
 */

import { useEffect, useRef, useCallback } from 'react';
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { searchKeymap, search } from '@codemirror/search';
import { yaml } from '@codemirror/lang-yaml';
import { basicSetup } from 'codemirror';
import { createStageflowCodeMirrorTheme } from './useCodeMirrorTheme';

export interface UseYamlEditorOptions {
  containerRef: React.RefObject<HTMLDivElement | null>;
  rawYaml: string;
  sceneId?: string;
  isBundled: boolean;
  effectiveTheme: 'dark' | 'warm' | 'light';
  wordWrap?: boolean;
  onChangeYaml: (newYaml: string) => void;
  debounceMs?: number;
}

export interface UseYamlEditorResult {
  jumpToLine: (line: number, column?: number) => void;
  focus: () => void;
}

export function useYamlEditor({
  containerRef,
  rawYaml,
  sceneId,
  isBundled,
  effectiveTheme,
  wordWrap = true,
  onChangeYaml,
  debounceMs = 150,
}: UseYamlEditorOptions): UseYamlEditorResult {
  const viewRef = useRef<EditorView | null>(null);
  const readOnlyCompartmentRef = useRef(new Compartment());
  const themeCompartmentRef = useRef(new Compartment());
  const wrapCompartmentRef = useRef(new Compartment());
  const lastDispatchedTextRef = useRef<string>(rawYaml);
  const lastSceneIdRef = useRef<string | undefined>(sceneId);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep latest onChange in ref to avoid re-initializing CodeMirror
  const onChangeYamlRef = useRef(onChangeYaml);
  onChangeYamlRef.current = onChangeYaml;

  // 1. Mount CodeMirror EditorView once on container attachment
  useEffect(() => {
    const parent = containerRef.current;
    if (!parent) return;

    const startState = EditorState.create({
      doc: rawYaml,
      extensions: [
        basicSetup,
        yaml(),
        wrapCompartmentRef.current.of(
          wordWrap ? EditorView.lineWrapping : []
        ),
        history(),
        search({ top: true }),
        keymap.of([
          indentWithTab,
          ...defaultKeymap,
          ...historyKeymap,
          ...searchKeymap,
        ]),
        themeCompartmentRef.current.of(
          createStageflowCodeMirrorTheme(effectiveTheme)
        ),
        readOnlyCompartmentRef.current.of(
          EditorState.readOnly.of(isBundled)
        ),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const nextText = update.state.doc.toString();

            if (debounceTimerRef.current) {
              clearTimeout(debounceTimerRef.current);
            }

            debounceTimerRef.current = setTimeout(() => {
              // Record exact text dispatched to React so incoming props can be identified as echo
              lastDispatchedTextRef.current = nextText;
              onChangeYamlRef.current(nextText);
            }, debounceMs);
          }
        }),
      ],
    });

    const view = new EditorView({
      state: startState,
      parent,
    });

    viewRef.current = view;

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      view.destroy();
      viewRef.current = null;
    };
    // Initialize strictly on container mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef]);

  // 2. Reconcile external changes to rawYaml (e.g. Score Library switch, drop loader)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    // Check if the scene identity has switched (e.g. user selected another blueprint/custom score)
    const isSceneSwitched =
      sceneId !== undefined && sceneId !== lastSceneIdRef.current;
    if (isSceneSwitched) {
      lastSceneIdRef.current = sceneId;
      lastDispatchedTextRef.current = rawYaml;

      const currentDoc = view.state.doc.toString();
      if (currentDoc !== rawYaml) {
        view.dispatch({
          changes: { from: 0, to: currentDoc.length, insert: rawYaml },
          selection: { anchor: 0 },
        });
        view.scrollDOM.scrollTop = 0;
      }
      return;
    }

    // If incoming text matches what was just dispatched to React, this is an echo from local typing—ignore it!
    if (rawYaml === lastDispatchedTextRef.current) {
      return;
    }

    // If the user has active focus on the editor, do not clobber their in-flight typing!
    if (view.hasFocus) {
      return;
    }

    // External change applied while not actively focused (e.g. drag & drop YAML, external reset)
    lastDispatchedTextRef.current = rawYaml;
    const currentDoc = view.state.doc.toString();
    if (currentDoc !== rawYaml) {
      const currentSelection = view.state.selection.main;
      const safeAnchor = Math.min(currentSelection.anchor, rawYaml.length);
      const safeHead = Math.min(currentSelection.head, rawYaml.length);

      view.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: rawYaml },
        selection: { anchor: safeAnchor, head: safeHead },
      });
    }
  }, [rawYaml, sceneId]);

  // 3. Dynamic Read-Only Reconfiguration
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    view.dispatch({
      effects: readOnlyCompartmentRef.current.reconfigure(
        EditorState.readOnly.of(isBundled)
      ),
    });
  }, [isBundled]);

  // 4. Dynamic Theme Reconfiguration
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    view.dispatch({
      effects: themeCompartmentRef.current.reconfigure(
        createStageflowCodeMirrorTheme(effectiveTheme)
      ),
    });
  }, [effectiveTheme]);

  // 5. Dynamic Word Wrap Reconfiguration
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    view.dispatch({
      effects: wrapCompartmentRef.current.reconfigure(
        wordWrap ? EditorView.lineWrapping : []
      ),
    });
  }, [wordWrap]);

  // 5. Jump to designated line & column
  const jumpToLine = useCallback((line: number, column = 1) => {
    const view = viewRef.current;
    if (!view) return;

    const totalLines = view.state.doc.lines;
    const targetLineNum = Math.max(1, Math.min(line, totalLines));
    const lineInfo = view.state.doc.line(targetLineNum);

    const targetPos = Math.min(
      lineInfo.from + Math.max(0, column - 1),
      lineInfo.to
    );

    view.dispatch({
      selection: { anchor: targetPos },
      scrollIntoView: true,
    });
    view.focus();
  }, []);

  const focus = useCallback(() => {
    viewRef.current?.focus();
  }, []);

  return { jumpToLine, focus };
}
