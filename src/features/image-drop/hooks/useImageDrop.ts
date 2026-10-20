import { useCallback, useState } from 'react';
import { storeImageForDocument } from '../storeImage';
import { notify } from '@/stores/uiStore';
import { isImageFile, isSupportedImageType } from '../utils';

interface UseImageDropOptions {
  onInsert: (markdown: string) => void;
}

interface UseImageDropReturn {
  isDragging: boolean;
  handleDragEnter: (e: React.DragEvent) => void;
  handleDragLeave: (e: React.DragEvent) => void;
  handleDragOver: (e: React.DragEvent) => void;
  handleDrop: (e: React.DragEvent) => Promise<void>;
  handlePaste: (e: React.ClipboardEvent) => Promise<void>;
}

export function useImageDrop({ onInsert }: UseImageDropOptions): UseImageDropReturn {
  const [isDragging, setIsDragging] = useState(false);
  const [, setDragCounter] = useState(0);

  const processFile = useCallback(
    async (file: File) => {
      if (!isImageFile(file)) return;

      if (!isSupportedImageType(file)) {
        notify({
          tone: 'error',
          title: `${file.name} can't be inserted`,
          detail: 'Use a PNG, JPG, GIF, WebP or SVG image.',
        });
        return;
      }

      onInsert(await storeImageForDocument(file));
    },
    [onInsert]
  );

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragCounter((prev) => prev + 1);

    // Check if dragging files
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragCounter((prev) => {
      const newCount = prev - 1;
      if (newCount === 0) {
        setIsDragging(false);
      }
      return newCount;
    });
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) {
      e.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      setDragCounter(0);

      const files = Array.from(e.dataTransfer.files);
      const imageFiles = files.filter(isImageFile);

      for (const file of imageFiles) {
        await processFile(file);
      }
    },
    [processFile]
  );

  const handlePaste = useCallback(
    async (e: React.ClipboardEvent) => {
      const items = Array.from(e.clipboardData.items);
      const imageItems = items.filter(
        (item) => item.kind === 'file' && item.type.startsWith('image/')
      );

      if (imageItems.length === 0) return;

      // Prevent default paste behavior for images
      e.preventDefault();

      for (const item of imageItems) {
        const file = item.getAsFile();
        if (file) {
          await processFile(file);
        }
      }
    },
    [processFile]
  );

  return {
    isDragging,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    handlePaste,
  };
}
