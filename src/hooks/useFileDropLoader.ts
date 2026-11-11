/**
 * Hook for handling drag-and-drop or file-picker loading of custom `.yaml` scores
 * and local `.mp4` / `.webm` video files.
 */

import { useState, useCallback } from 'react';

export interface UseFileDropLoaderOptions {
  onLoadYamlText: (rawYaml: string, fileName: string) => void;
  onLoadVideoBlobUrl: (blobUrl: string, fileName: string) => void;
}

export function useFileDropLoader({
  onLoadYamlText,
  onLoadVideoBlobUrl,
}: UseFileDropLoaderOptions) {
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const processFiles = useCallback(
    async (files: FileList | File[]) => {
      const fileArray = Array.from(files);
      for (const file of fileArray) {
        const lower = file.name.toLowerCase();
        if (
          lower.endsWith('.yaml') ||
          lower.endsWith('.yml') ||
          lower.endsWith('.json')
        ) {
          const text = await file.text();
          onLoadYamlText(text, file.name);
        } else if (
          lower.endsWith('.mp4') ||
          lower.endsWith('.webm') ||
          lower.endsWith('.mov') ||
          file.type.startsWith('video/')
        ) {
          const blobUrl = URL.createObjectURL(file);
          onLoadVideoBlobUrl(blobUrl, file.name);
        }
      }
    },
    [onLoadYamlText, onLoadVideoBlobUrl]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDraggingOver(false);
      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        processFiles(e.dataTransfer.files);
      }
    },
    [processFiles]
  );

  return {
    isDraggingOver,
    processFiles,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  };
}
