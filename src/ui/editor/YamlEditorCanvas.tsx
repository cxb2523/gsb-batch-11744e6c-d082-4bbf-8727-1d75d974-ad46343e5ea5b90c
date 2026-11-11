/**
 * Pure DOM Canvas Mounting the CodeMirror 6 EditorView for StageFlow.
 * Enforces smooth 60fps scrolling, container fitting, and virtualized line rendering.
 */

import React, { useRef, useImperativeHandle, forwardRef } from 'react';
import { useYamlEditor } from './useYamlEditor';

export interface YamlEditorHandle {
  jumpToLine: (line: number, column?: number) => void;
  focus: () => void;
}

export interface YamlEditorCanvasProps {
  rawYaml: string;
  sceneId?: string;
  isBundled: boolean;
  effectiveTheme: 'dark' | 'warm' | 'light';
  wordWrap?: boolean;
  onChangeYaml: (newYaml: string) => void;
}

export const YamlEditorCanvas = React.memo(
  forwardRef<YamlEditorHandle, YamlEditorCanvasProps>(
    (
      {
        rawYaml,
        sceneId,
        isBundled,
        effectiveTheme,
        wordWrap,
        onChangeYaml,
      },
      ref
    ) => {
      const containerRef = useRef<HTMLDivElement | null>(null);

      const { jumpToLine, focus } = useYamlEditor({
        containerRef,
        rawYaml,
        sceneId,
        isBundled,
        effectiveTheme,
        wordWrap,
        onChangeYaml,
        debounceMs: 150,
      });

      useImperativeHandle(
        ref,
        () => ({
          jumpToLine,
          focus,
        }),
        [jumpToLine, focus]
      );

      return (
        <div
          ref={containerRef}
          className="flex-1 w-full h-full min-h-0 bg-app overflow-hidden custom-scrollbar select-text text-left"
        />
      );
    }
  )
);
