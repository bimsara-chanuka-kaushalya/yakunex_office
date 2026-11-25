'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Circle,
  Download,
  Eraser,
  Highlighter,
  Minus,
  Pen,
  Square,
  StickyNote,
  Trash2,
  Type,
  Undo2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import type { WhiteboardStroke } from './meeting-types';

const PALETTE = ['#FFFFFF', '#D4A843', '#EF4444', '#10B981', '#38BDF8', '#A855F7', '#F97316', '#0F172A'];

export function WhiteboardOverlay({
  mode,
  strokes,
  authorName,
  onAddStroke,
  onUndo,
  onClear,
  onClose,
}: {
  mode: 'whiteboard' | 'annotate';
  strokes: WhiteboardStroke[];
  authorName: string;
  onAddStroke: (stroke: WhiteboardStroke) => void;
  onUndo: () => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [tool, setTool] = useState<WhiteboardStroke['tool']>('pen');
  const [color, setColor] = useState(mode === 'annotate' ? '#EF4444' : '#D4A843');
  const [width, setWidth] = useState(3);
  const [drawing, setDrawing] = useState(false);
  const draftRef = useRef<WhiteboardStroke | null>(null);

  const drawStroke = useCallback(
    (ctx: CanvasRenderingContext2D, s: WhiteboardStroke, w: number, h: number) => {
      if (!s.points || s.points.length === 0) return;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (s.tool === 'eraser') {
        ctx.globalCompositeOperation = mode === 'annotate' ? 'destination-out' : 'source-over';
        ctx.strokeStyle = mode === 'annotate' ? 'rgba(0,0,0,1)' : '#0B101B';
        ctx.lineWidth = s.width * 5;
      } else if (s.tool === 'highlighter') {
        ctx.globalAlpha = 0.35;
        ctx.strokeStyle = s.color;
        ctx.lineWidth = s.width * 4;
      } else {
        ctx.strokeStyle = s.color;
        ctx.fillStyle = s.color;
        ctx.lineWidth = s.width;
      }

      const toX = (nx: number) => nx * w;
      const toY = (ny: number) => ny * h;

      if (s.tool === 'pen' || s.tool === 'highlighter' || s.tool === 'eraser') {
        ctx.beginPath();
        ctx.moveTo(toX(s.points[0].x), toY(s.points[0].y));
        for (let i = 1; i < s.points.length; i += 1) {
          ctx.lineTo(toX(s.points[i].x), toY(s.points[i].y));
        }
        ctx.stroke();
      } else if (s.tool === 'line' && s.points.length >= 2) {
        const a = s.points[0];
        const b = s.points[s.points.length - 1];
        ctx.beginPath();
        ctx.moveTo(toX(a.x), toY(a.y));
        ctx.lineTo(toX(b.x), toY(b.y));
        ctx.stroke();
      } else if (s.tool === 'rect' && s.points.length >= 2) {
        const a = s.points[0];
        const b = s.points[s.points.length - 1];
        ctx.strokeRect(toX(a.x), toY(a.y), toX(b.x) - toX(a.x), toY(b.y) - toY(a.y));
      } else if (s.tool === 'circle' && s.points.length >= 2) {
        const a = s.points[0];
        const b = s.points[s.points.length - 1];
        const rx = Math.abs(toX(b.x) - toX(a.x)) / 2;
        const ry = Math.abs(toY(b.y) - toY(a.y)) / 2;
        const cx = (toX(a.x) + toX(b.x)) / 2;
        const cy = (toY(a.y) + toY(b.y)) / 2;
        ctx.beginPath();
        ctx.ellipse(cx, cy, Math.max(2, rx), Math.max(2, ry), 0, 0, Math.PI * 2);
        ctx.stroke();
      } else if (s.tool === 'text' && s.text) {
        const p = s.points[0];
        ctx.font = `600 ${Math.max(14, s.width * 5)}px Inter, system-ui, sans-serif`;
        ctx.fillText(s.text, toX(p.x), toY(p.y));
      } else if (s.tool === 'sticky' && s.text) {
        const p = s.points[0];
        const bx = toX(p.x);
        const by = toY(p.y);
        ctx.fillStyle = '#FACC15';
        ctx.shadowColor = 'rgba(0,0,0,0.35)';
        ctx.shadowBlur = 10;
        ctx.fillRect(bx, by, 170, 95);
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#0F172A';
        ctx.font = '600 12px Inter, system-ui, sans-serif';
        const words = s.text.split(' ');
        let line = '';
        let y = by + 22;
        for (const word of words) {
          const test = line ? `${line} ${word}` : word;
          if (ctx.measureText(test).width > 148) {
            ctx.fillText(line, bx + 10, y);
            line = word;
            y += 16;
            if (y > by + 84) break;
          } else {
            line = test;
          }
        }
        if (line && y <= by + 86) ctx.fillText(line, bx + 10, y);
      }

      ctx.restore();
    },
    [mode],
  );

  const renderAll = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (mode === 'whiteboard') {
      ctx.fillStyle = '#0B101B';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // Subtle dot grid
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      for (let gx = 24; gx < canvas.width; gx += 32) {
        for (let gy = 24; gy < canvas.height; gy += 32) {
          ctx.fillRect(gx, gy, 1.5, 1.5);
        }
      }
    }
    for (const s of strokes) {
      drawStroke(ctx, s, canvas.width, canvas.height);
    }
    if (draftRef.current) {
      drawStroke(ctx, draftRef.current, canvas.width, canvas.height);
    }
  }, [drawStroke, mode, strokes]);

  useEffect(() => {
    const resize = () => {
      const canvas = canvasRef.current;
      if (!canvas || !canvas.parentElement) return;
      const rect = canvas.parentElement.getBoundingClientRect();
      canvas.width = Math.max(320, Math.floor(rect.width));
      canvas.height = Math.max(240, Math.floor(rect.height));
      renderAll();
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [renderAll]);

  useEffect(() => {
    renderAll();
  }, [renderAll]);

  const getNormPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const pt = getNormPoint(e);
    if (tool === 'text' || tool === 'sticky') {
      const label = window.prompt(tool === 'sticky' ? 'Enter sticky note text:' : 'Enter annotation text:');
      if (label && label.trim()) {
        onAddStroke({
          id: `wb_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          tool,
          color,
          width,
          points: [pt],
          text: label.trim().slice(0, 140),
          authorName,
        });
      }
      return;
    }
    setDrawing(true);
    draftRef.current = {
      id: `wb_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      tool,
      color,
      width,
      points: [pt],
      authorName,
    };
    renderAll();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing || !draftRef.current) return;
    const pt = getNormPoint(e);
    if (tool === 'pen' || tool === 'highlighter' || tool === 'eraser') {
      draftRef.current.points.push(pt);
    } else {
      draftRef.current.points = [draftRef.current.points[0], pt];
    }
    renderAll();
  };

  const onPointerUp = () => {
    if (!drawing || !draftRef.current) return;
    setDrawing(false);
    const finished = draftRef.current;
    draftRef.current = null;
    if (finished.points.length >= 1) {
      onAddStroke(finished);
    }
    renderAll();
  };

  const exportPng = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `yakunex-${mode}-${Date.now()}.png`;
    a.click();
  };

  return (
    <div
      className={cn(
        'absolute inset-0 z-30 flex flex-col',
        mode === 'whiteboard' ? 'bg-[#070B14]' : 'bg-transparent',
      )}
    >
      {/* Floating 3D Liquid Glass Spatial Canvas Toolbar */}
      <div className="liquid-glass-dock pointer-events-auto z-40 mx-auto mt-3 flex flex-wrap items-center gap-1.5 rounded-full px-3.5 py-2 text-white">
        <span className="liquid-orb-gold mr-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em]">
          {mode === 'whiteboard' ? 'Spatial Board' : 'Live Ink'}
        </span>
        {(
          [
            { id: 'pen', icon: Pen, label: 'Pen' },
            { id: 'highlighter', icon: Highlighter, label: 'Highlight' },
            { id: 'line', icon: Minus, label: 'Line' },
            { id: 'rect', icon: Square, label: 'Rectangle' },
            { id: 'circle', icon: Circle, label: 'Circle' },
            { id: 'text', icon: Type, label: 'Text' },
            { id: 'sticky', icon: StickyNote, label: 'Sticky Note' },
            { id: 'eraser', icon: Eraser, label: 'Eraser' },
          ] as const
        ).map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              title={item.label}
              onClick={() => setTool(item.id)}
              className={cn(
                'rounded-full p-2 transition',
                tool === item.id
                  ? 'liquid-orb-gold'
                  : 'liquid-orb text-white/75 hover:text-white',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
            </button>
          );
        })}

        <div className="mx-1 h-4 w-px bg-white/15" />

        {PALETTE.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setColor(c)}
            aria-label={`Color ${c}`}
            style={{ backgroundColor: c }}
            className={cn(
              'h-4 w-4 rounded-full border transition',
              color === c ? 'scale-125 border-white ring-2 ring-[#F2CF78]' : 'border-white/30',
            )}
          />
        ))}

        <select
          value={width}
          onChange={(e) => setWidth(Number(e.target.value))}
          className="liquid-orb ml-1 rounded-full px-2.5 py-1 text-[11px] font-medium text-white outline-none"
        >
          <option value={2} className="bg-[#0B101B]">Thin</option>
          <option value={3} className="bg-[#0B101B]">Medium</option>
          <option value={6} className="bg-[#0B101B]">Thick</option>
        </select>

        <div className="mx-1 h-4 w-px bg-white/15" />

        <button
          type="button"
          onClick={onUndo}
          title="Undo"
          className="liquid-orb rounded-full p-2 text-white/80 hover:text-white"
        >
          <Undo2 className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onClear}
          title="Clear All"
          className="liquid-orb rounded-full p-2 text-rose-300 hover:bg-rose-500/20"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={exportPng}
          title="Export PNG"
          className="liquid-orb rounded-full p-2 text-emerald-300 hover:bg-emerald-500/20"
        >
          <Download className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onClose}
          title="Close"
          className="liquid-orb-ruby ml-1 flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-bold"
        >
          <X className="h-3.5 w-3.5" /> Done
        </button>
      </div>

      {/* Drawing Surface */}
      <div className="relative flex-1 overflow-hidden">
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="h-full w-full cursor-crosshair touch-none"
        />
      </div>
    </div>
  );
}
