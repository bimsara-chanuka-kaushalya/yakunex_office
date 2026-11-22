'use client';

import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { RotateCw, ZoomIn, ZoomOut, RotateCcw, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';

interface AvatarCropModalProps {
  open: boolean;
  file: File | null;
  saving?: boolean;
  onCancel: () => void;
  onConfirm: (croppedDataUrl: string) => void | Promise<void>;
}

const PREVIEW_SIZE = 260;
const OUTPUT_SIZE = 256;

export function AvatarCropModal({
  open,
  file,
  saving = false,
  onCancel,
  onConfirm,
}: AvatarCropModalProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imgSize, setImgSize] = useState<{ w: number; h: number }>({ w: 1, h: 1 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!open || !file) {
      setImageUrl(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setImageUrl(reader.result);
        setZoom(1);
        setRotation(0);
        setOffset({ x: 0, y: 0 });
      }
    };
    reader.readAsDataURL(file);
  }, [open, file]);

  const baseScale = Math.max(PREVIEW_SIZE / Math.max(1, imgSize.w), PREVIEW_SIZE / Math.max(1, imgSize.h));
  const displayW = imgSize.w * baseScale;
  const displayH = imgSize.h * baseScale;

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: offset.x,
      origY: offset.y,
    };
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    const maxShift = (PREVIEW_SIZE * zoom) / 1.5;
    setOffset({
      x: Math.max(-maxShift, Math.min(maxShift, dragRef.current.origX + dx)),
      y: Math.max(-maxShift, Math.min(maxShift, dragRef.current.origY + dy)),
    });
  }

  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    if (dragRef.current) {
      e.currentTarget.releasePointerCapture(e.pointerId);
      dragRef.current = null;
    }
  }

  function handleReset() {
    setZoom(1);
    setRotation(0);
    setOffset({ x: 0, y: 0 });
  }

  async function handleApply() {
    const img = imgRef.current;
    if (!img || !imageUrl) return;

    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const ratio = OUTPUT_SIZE / PREVIEW_SIZE;
    ctx.fillStyle = '#0f1115';
    ctx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

    ctx.save();
    ctx.translate(OUTPUT_SIZE / 2 + offset.x * ratio, OUTPUT_SIZE / 2 + offset.y * ratio);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(zoom * ratio, zoom * ratio);
    ctx.drawImage(img, -displayW / 2, -displayH / 2, displayW, displayH);
    ctx.restore();

    const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
    await onConfirm(dataUrl);
  }

  return (
    <Modal open={open} title="Customize Profile Picture (DP)" onClose={onCancel}>
      <div className="space-y-5">
        <p className="text-xs text-muted">
          Drag the photo to reposition, use the zoom slider, or rotate to fit your profile frame.
        </p>

        {/* Interactive Crop Stage */}
        <div className="flex justify-center">
          <div
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            style={{ width: PREVIEW_SIZE, height: PREVIEW_SIZE }}
            className="relative cursor-grab select-none overflow-hidden rounded-2xl border-2 border-gold/50 bg-[#0f1115] touch-none active:cursor-grabbing"
          >
            {imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                ref={imgRef}
                src={imageUrl}
                alt="Crop preview"
                draggable={false}
                onLoad={(e) => {
                  const target = e.currentTarget;
                  setImgSize({ w: target.naturalWidth || 1, h: target.naturalHeight || 1 });
                }}
                style={{
                  width: displayW,
                  height: displayH,
                  left: '50%',
                  top: '50%',
                  transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px)) rotate(${rotation}deg) scale(${zoom})`,
                }}
                className="pointer-events-none absolute max-w-none select-none"
              />
            )}

            {/* Circular guide overlay so user sees exact circular avatar framing */}
            <div className="pointer-events-none absolute inset-0 rounded-full ring-[40px] ring-black/45" />
            <div className="pointer-events-none absolute inset-0 rounded-full border border-white/60" />
          </div>
        </div>

        {/* Zoom & Rotate Controls */}
        <div className="space-y-3 rounded-2xl border border-line/70 bg-canvas/50 p-3.5">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(1, Number((z - 0.15).toFixed(2))))}
              className="rounded-lg p-1.5 text-muted hover:bg-ink/[0.06] hover:text-ink"
              aria-label="Zoom out"
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <input
              type="range"
              min={1}
              max={3}
              step={0.02}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              aria-label="Zoom level"
              className="h-1.5 flex-1 cursor-pointer accent-[#c9961e]"
            />
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(3, Number((z + 0.15).toFixed(2))))}
              className="rounded-lg p-1.5 text-muted hover:bg-ink/[0.06] hover:text-ink"
              aria-label="Zoom in"
            >
              <ZoomIn className="h-4 w-4" />
            </button>
            <span className="w-11 text-right font-mono text-xs text-muted">{Math.round(zoom * 100)}%</span>
          </div>

          <div className="flex items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setRotation((r) => (r + 90) % 360)}
              >
                <RotateCw className="h-3.5 w-3.5" /> Rotate 90°
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={handleReset}>
                <RotateCcw className="h-3.5 w-3.5" /> Reset
              </Button>
            </div>
            <span className="font-mono text-[11px] text-muted">{rotation}°</span>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" disabled={saving} onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" disabled={saving || !imageUrl} onClick={() => void handleApply()}>
            <Check className="h-4 w-4" /> {saving ? 'Uploading…' : 'Save Profile Picture'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
