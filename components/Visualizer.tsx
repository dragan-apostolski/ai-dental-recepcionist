
import React, { useEffect, useRef } from 'react';

interface VisualizerProps {
  isActive: boolean;
  isModelSpeaking: boolean;
}

const Visualizer: React.FC<VisualizerProps> = ({ isActive, isModelSpeaking }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    const bars = 40;
    const barWidth = 3;
    const gap = 3;

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const centerY = canvas.height / 2;

      for (let i = 0; i < bars; i++) {
        const x = i * (barWidth + gap);
        // Simulate wave height based on status
        let height = 4;
        if (isActive) {
          const time = Date.now() / 150;
          const factor = isModelSpeaking ? 1.2 : 0.3;
          // Create a more natural looking wave with multiple sine functions
          const baseHeight = Math.sin(time + i * 0.2) * 15 + Math.sin(time * 0.5 + i * 0.1) * 10;
          height = Math.abs(baseHeight) * factor + 6;
        } else {
            // Idle subtle pulse
            const time = Date.now() / 1000;
            height = 4 + Math.sin(time + i * 0.1) * 2;
        }
        
        // Gradient effect
        const gradient = ctx.createLinearGradient(0, centerY - height / 2, 0, centerY + height / 2);
        if (isActive && isModelSpeaking) {
            gradient.addColorStop(0, '#14b8a6');
            gradient.addColorStop(1, '#0d9488');
        } else if (isActive) {
            gradient.addColorStop(0, '#94a3b8');
            gradient.addColorStop(1, '#64748b');
        } else {
            gradient.addColorStop(0, '#e2e8f0');
            gradient.addColorStop(1, '#cbd5e1');
        }

        ctx.fillStyle = gradient;
        ctx.beginPath();
        // Drawing rounded rect manually for better compatibility
        const r = 1.5;
        const h = Math.max(height, 3);
        const y = centerY - h / 2;
        ctx.roundRect(x, y, barWidth, h, r);
        ctx.fill();
      }

      animationId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animationId);
  }, [isActive, isModelSpeaking]);

  return (
    <div className="flex justify-center items-center h-full w-full bg-slate-50/50 rounded-3xl overflow-hidden border border-slate-100 shadow-inner">
      <canvas ref={canvasRef} width={240} height={80} className="w-full h-full p-4" />
    </div>
  );
};

export default Visualizer;
