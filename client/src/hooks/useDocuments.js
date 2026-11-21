import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorText } from "../api/client";
import { useInterface } from "../context/Interface";
import { useCollection } from "./useCollection";

export const fileLimit = 50 * 1024 * 1024;
export function fileSize(bytes = 0) {
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toLocaleString(undefined, { maximumFractionDigits: 1 }) + " MB";
  return bytes ? Math.max(1, Math.round(bytes / 1024)) + " KB" : "0 KB";
}

export function useDocuments() {
  const list = useCollection("/documents", "documents");
  const { refresh, update } = list;
  const { notify } = useInterface();
  const [progress, setProgress] = useState(null);
  const upload = useRef(null);
  const processing = list.items.some((doc) => doc.status === "processing");
  useEffect(() => {
    if (!processing) return;
    const timer = setInterval(refresh, 3000);
    return () => clearInterval(timer);
  }, [processing, refresh]);
  useEffect(() => () => upload.current?.abort(), []);

  const uploadFiles = useCallback(async (files) => {
    if (upload.current || !files.length) return;
    const controller = new AbortController();
    upload.current = controller;
    try {
      for (const [index, file] of Array.from(files).entries()) {
        if (controller.signal.aborted) break;
        try {
          if (file.size > fileLimit) throw new Error(file.name + " is too large. Choose a PDF of 50 MB or less.");
          if (await file.slice(0, 5).text() !== "%PDF-") throw new Error(file.name + " isn’t a PDF. Choose a PDF file to upload.");
          if (controller.signal.aborted) break;
          setProgress({ name: file.name, percent: 0, index: index + 1, total: files.length });
          const form = new FormData();
          form.set("file", file);
          const { data } = await api.post("/documents", form, {
            signal: controller.signal, timeout: 0,
            onUploadProgress: ({ loaded, total }) => {
              if (!controller.signal.aborted) setProgress((p) => p && { ...p, percent: Math.min(100, Math.round(loaded / (total || file.size) * 100)) });
            }
          });
          if (controller.signal.aborted) break;
          const doc = data.document ?? data;
          update((docs) => [doc, ...docs.filter((d) => d._id !== doc._id)]);
        } catch (e) {
          if (!controller.signal.aborted) notify(errorText(e, "The upload failed. Please try again."), true);
        }
      }
    } finally {
      upload.current = null;
      if (!controller.signal.aborted) { setProgress(null); void refresh(); }
    }
  }, [update, refresh, notify]);
  return { ...list, progress, uploadFiles };
}
