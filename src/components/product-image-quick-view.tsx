"use client";

import Image from "next/image";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Modal } from "@/components/ui/modal";

const previewWidth = 336;
const previewGap = 12;
const viewportMargin = 12;
const hoverIntentDelay = 220;

interface PreviewPosition {
  left: number;
  top: number;
  width: number;
}

export function ProductImageQuickView({
  productId,
  productName,
  thumbnailUrl,
  imageVersion,
  quickPreviewEnabled,
}: {
  productId: string;
  productName: string;
  thumbnailUrl: string;
  imageVersion: string;
  quickPreviewEnabled: boolean;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewAbortRef = useRef<AbortController | null>(null);
  const previewRequestRef = useRef<Promise<void> | null>(null);
  const previewObjectUrlRef = useRef<string | null>(null);
  const tooltipId = useId();
  const [quickPreviewOpen, setQuickPreviewOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [previewObjectUrl, setPreviewObjectUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState(false);
  const [position, setPosition] = useState<PreviewPosition>({
    left: viewportMargin,
    top: viewportMargin,
    width: previewWidth,
  });
  const previewUrl = `/api/product-images/${encodeURIComponent(productId)}?size=preview&v=${encodeURIComponent(imageVersion)}`;
  const quickPreviewVisible = quickPreviewEnabled && quickPreviewOpen;
  const portalTarget = typeof document === "undefined" ? null : document.body;

  const ensurePreview = useCallback(() => {
    if (previewObjectUrlRef.current || previewRequestRef.current) return;

    const controller = new AbortController();
    previewAbortRef.current = controller;
    setPreviewError(false);
    const request = fetch(previewUrl, {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error("No se pudo cargar la imagen.");
        return response.blob();
      })
      .then((blob) => {
        if (controller.signal.aborted) return;
        const objectUrl = URL.createObjectURL(blob);
        previewObjectUrlRef.current = objectUrl;
        setPreviewObjectUrl(objectUrl);
      })
      .catch((error: unknown) => {
        if (
          controller.signal.aborted ||
          (error instanceof DOMException && error.name === "AbortError")
        ) {
          return;
        }
        setPreviewError(true);
      })
      .finally(() => {
        if (previewAbortRef.current === controller) {
          previewAbortRef.current = null;
        }
        previewRequestRef.current = null;
      });
    previewRequestRef.current = request;
  }, [previewUrl]);

  const updatePreviewPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const width = Math.min(
      previewWidth,
      Math.max(0, window.innerWidth - viewportMargin * 2),
    );
    const estimatedHeight = width * 0.75 + 48;
    const fitsOnRight =
      rect.right + previewGap + width <= window.innerWidth - viewportMargin;
    const preferredLeft = fitsOnRight
      ? rect.right + previewGap
      : rect.left - previewGap - width;
    const maxLeft = Math.max(
      viewportMargin,
      window.innerWidth - width - viewportMargin,
    );
    const maxTop = Math.max(
      viewportMargin,
      window.innerHeight - estimatedHeight - viewportMargin,
    );

    setPosition({
      left: Math.min(Math.max(viewportMargin, preferredLeft), maxLeft),
      top: Math.min(
        Math.max(
          viewportMargin,
          rect.top + rect.height / 2 - estimatedHeight / 2,
        ),
        maxTop,
      ),
      width,
    });
  }, []);

  useEffect(() => {
    if (!quickPreviewVisible) return;

    window.addEventListener("resize", updatePreviewPosition);
    window.addEventListener("scroll", updatePreviewPosition, true);
    return () => {
      window.removeEventListener("resize", updatePreviewPosition);
      window.removeEventListener("scroll", updatePreviewPosition, true);
    };
  }, [quickPreviewVisible, updatePreviewPosition]);

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
      previewAbortRef.current?.abort();
      if (previewObjectUrlRef.current) {
        URL.revokeObjectURL(previewObjectUrlRef.current);
      }
    };
  }, []);

  function scheduleQuickPreview() {
    if (!quickPreviewEnabled || modalOpen) return;
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => {
      updatePreviewPosition();
      ensurePreview();
      setQuickPreviewOpen(true);
      hoverTimerRef.current = null;
    }, hoverIntentDelay);
  }

  function hideQuickPreview() {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setQuickPreviewOpen(false);
  }

  function openImageModal() {
    hideQuickPreview();
    ensurePreview();
    setModalOpen(true);
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="product-monogram product-image-trigger"
        onPointerEnter={(event) => {
          if (event.pointerType === "mouse") scheduleQuickPreview();
        }}
        onPointerLeave={hideQuickPreview}
        onFocus={scheduleQuickPreview}
        onBlur={hideQuickPreview}
        onClick={openImageModal}
        onKeyDown={(event) => {
          if (event.key === "Escape") hideQuickPreview();
        }}
        aria-label={`Ampliar imagen de ${productName}`}
        aria-haspopup="dialog"
        aria-expanded={modalOpen}
        aria-describedby={quickPreviewVisible ? tooltipId : undefined}
        title={
          quickPreviewEnabled
            ? "Vista rápida; haz clic para ampliar"
            : "Haz clic para ampliar"
        }
      >
        <Image
          className="product-thumbnail"
          src={thumbnailUrl}
          alt=""
          width={112}
          height={112}
          draggable={false}
          unoptimized
        />
      </button>

      {portalTarget && quickPreviewVisible
        ? createPortal(
            <figure
              id={tooltipId}
              role="tooltip"
              className="product-quick-preview"
              style={{
                left: position.left,
                top: position.top,
                width: position.width,
              }}
            >
              <span className="product-quick-preview-frame">
                {previewObjectUrl ? (
                  <Image
                    src={previewObjectUrl}
                    alt=""
                    width={640}
                    height={480}
                    draggable={false}
                    unoptimized
                  />
                ) : (
                  <span className="product-preview-loading">
                    {previewError ? "No se pudo cargar" : "Cargando imagen…"}
                  </span>
                )}
              </span>
              <figcaption>
                <strong>{productName}</strong>
                <span>Clic para ampliar</span>
              </figcaption>
            </figure>,
            portalTarget,
          )
        : null}

      {portalTarget && modalOpen
        ? createPortal(
            <Modal
              open
              onClose={() => setModalOpen(false)}
              title="Imagen del producto"
              description={productName}
              size="lg"
            >
              <div className="product-image-modal-body">
                <div className="product-image-modal-frame">
                  {previewObjectUrl ? (
                    <Image
                      src={previewObjectUrl}
                      alt={`Imagen ampliada de ${productName}`}
                      width={960}
                      height={720}
                      draggable={false}
                      unoptimized
                    />
                  ) : (
                    <span className="product-preview-loading" role="status">
                      {previewError
                        ? "No fue posible cargar la imagen completa."
                        : "Cargando imagen completa…"}
                    </span>
                  )}
                </div>
                <p>
                  Vista completa sin recorte · Usa Esc o el botón cerrar para
                  volver al catálogo.
                </p>
              </div>
            </Modal>,
            portalTarget,
          )
        : null}
    </>
  );
}
