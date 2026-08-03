"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MAX_RUNNER_PHOTOS } from "./receiptConfig";

/**
 * The photo strip's state, shared by the Strava and hand-filled flows.
 *
 * Both screens present the same thing — a strip you tap to add and tap to
 * remove — and the fiddly parts (snapshotting a `FileList` before it's cleared,
 * keeping object URLs alive exactly as long as their thumbnails) are worth
 * having in one place rather than two.
 */

/**
 * One photo the runner can pick from.
 *
 * Ready-made images and camera-roll images live in the same strip so they
 * behave identically. A photo that's been added but deselected stays in the
 * strip rather than vanishing, so changing your mind is reversible without
 * re-opening the picker.
 */
export interface PhotoOption {
  /** Stable identity. For a supplied photo this is the URL itself. */
  key: string;
  /** Thumbnail source — an object URL for uploads, the real URL otherwise. */
  url: string;
  /** Set for uploads only. This, not `url`, is what gets dithered. */
  file?: File;
}

export interface PhotoPicker {
  /** Everything tappable, supplied photos first. */
  options: PhotoOption[];
  /** Selected keys, in print order. */
  chosen: string[];
  /** Changes exactly when the selection does — safe as an effect dependency. */
  signature: string;
  /** True once the selection is at `MAX_RUNNER_PHOTOS`. */
  full: boolean;
  /** What to hand the dither pipeline, in print order. */
  sources: (string | File)[];
  toggle: (key: string) => void;
  addFiles: (files: FileList | null) => void;
  clear: () => void;
}

/**
 * @param supplied Photos the runner didn't upload — Strava's, in practice.
 *   Treated as a stable list; new entries join the front of the strip.
 */
export function usePhotoPicker(supplied: readonly string[]): PhotoPicker {
  const [uploads, setUploads] = useState<PhotoOption[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);

  /** Distinguishes two picks of the same file, which are otherwise identical. */
  const uploadSeq = useRef(0);

  // Mirrors `uploads`, written alongside it in `addFiles` — the only place
  // uploads change. Lets callers depend on the selection alone: a photo added
  // while the selection is already full changes the strip but not the receipt.
  const uploadsRef = useRef<PhotoOption[]>([]);

  /**
   * Add or remove a photo.
   *
   * Deselecting and reselecting is how you reorder: the receipt prints in
   * selection order, so a photo re-tapped goes to the back of the queue.
   */
  const toggle = useCallback((key: string) => {
    setChosen((current) => {
      if (current.includes(key)) return current.filter((k) => k !== key);
      if (current.length >= MAX_RUNNER_PHOTOS) return current;
      return [...current, key];
    });
  }, []);

  const addFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    // Snapshot the FileList *now*. Clearing the input's value empties the same
    // FileList object, and a state updater runs later — read it lazily and the
    // list is already gone by the time React calls back.
    const picked = Array.from(files);
    if (picked.length === 0) return;

    const added: PhotoOption[] = picked.map((file) => ({
      key: `upload:${(uploadSeq.current += 1)}`,
      url: URL.createObjectURL(file),
      file,
    }));

    // Everything picked joins the strip; only what fits gets selected. Adding
    // five and choosing three beats being told you can only pick three.
    uploadsRef.current = [...uploadsRef.current, ...added];
    setUploads(uploadsRef.current);
    setChosen((current) => {
      const room = MAX_RUNNER_PHOTOS - current.length;
      return room <= 0
        ? current
        : [...current, ...added.slice(0, room).map((a) => a.key)];
    });
  }, []);

  const clear = useCallback(() => setChosen([]), []);

  // Thumbnail object URLs outlive every selection change, so they're released
  // once on unmount rather than tracked per photo.
  useEffect(
    () => () => {
      for (const upload of uploadsRef.current) URL.revokeObjectURL(upload.url);
    },
    [],
  );

  const options = useMemo<PhotoOption[]>(
    () => [...supplied.map((url) => ({ key: url, url })), ...uploads],
    [supplied, uploads],
  );

  const sources = useMemo(
    () =>
      chosen.map((key) => {
        const upload = uploads.find((u) => u.key === key);
        // A key that isn't an upload is a supplied URL, which is its own key.
        return upload?.file ?? key;
      }),
    [chosen, uploads],
  );

  return {
    options,
    chosen,
    signature: chosen.join("|"),
    full: chosen.length >= MAX_RUNNER_PHOTOS,
    sources,
    toggle,
    addFiles,
    clear,
  };
}
