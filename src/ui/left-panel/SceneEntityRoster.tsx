/**
 * SceneEntityRoster Component.
 * Displays compact categorized entity cards for Characters, Props, and Floor Markers
 * with theme color dots, 3D dimensions, and presentation styles.
 * Layer 5 UI Component.
 */

import React, { useMemo } from 'react';
import { User, Box, MapPin } from 'lucide-react';
import type { SceneEntityDef } from '../../core/types';

export interface SceneEntityRosterProps {
  entities: SceneEntityDef[];
}

export const SceneEntityRoster: React.FC<SceneEntityRosterProps> = ({ entities }) => {
  const { characters, props, markers } = useMemo(() => {
    const chars: SceneEntityDef[] = [];
    const prps: SceneEntityDef[] = [];
    const mrks: SceneEntityDef[] = [];

    entities.forEach((ent) => {
      const kind = ent.kind ?? 'character';
      if (kind === 'character') {
        chars.push(ent);
      } else if (kind === 'prop') {
        prps.push(ent);
      } else if (kind === 'marker') {
        mrks.push(ent);
      }
    });

    return { characters: chars, props: prps, markers: mrks };
  }, [entities]);

  if (entities.length === 0) return null;

  return (
    <div className="space-y-2">
      {/* 1. Cast / Characters */}
      {characters.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-[9.5px] font-mono uppercase tracking-wider text-text-muted font-bold">
            <User className="w-3 h-3 text-sky-500" />
            <span>Cast ({characters.length})</span>
          </div>

          <div className="flex flex-wrap gap-1">
            {characters.map((ent) => {
              const heightStr =
                typeof ent.height === 'number' && ent.height > 0
                  ? `${ent.height.toFixed(2)}m`
                  : '1.75m';
              const styleStr = ent.style ?? 'mannequin';

              return (
                <div
                  key={ent.id}
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-surface border border-border-main text-[11px] font-mono shadow-2xs"
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0 shadow-xs"
                    style={{ backgroundColor: ent.color || '#38bdf8' }}
                  />
                  <span className="font-semibold text-text-main">
                    {ent.label || ent.id}
                  </span>
                  <span className="text-[10px] text-text-muted font-normal">
                    ({heightStr})
                  </span>
                  {styleStr !== 'mannequin' && (
                    <span className="text-[9px] text-text-faint capitalize">
                      · {styleStr}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 2. Set Props & Architecture */}
      {props.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-[9.5px] font-mono uppercase tracking-wider text-text-muted font-bold">
            <Box className="w-3 h-3 text-amber-500" />
            <span>Set Props ({props.length})</span>
          </div>

          <div className="flex flex-wrap gap-1">
            {props.map((ent) => {
              const dimsStr =
                typeof ent.width === 'number' &&
                typeof ent.height === 'number' &&
                typeof ent.depth === 'number'
                  ? `${ent.width.toFixed(1)}×${ent.height.toFixed(1)}×${ent.depth.toFixed(1)}m`
                  : typeof ent.radius === 'number' && ent.radius > 0
                  ? `Ø${(ent.radius * 2).toFixed(1)}m`
                  : null;
              const shapeStr = ent.shape ?? 'box';

              return (
                <div
                  key={ent.id}
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-surface border border-border-main text-[11px] font-mono shadow-2xs"
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0 shadow-xs"
                    style={{ backgroundColor: ent.color || '#fb923c' }}
                  />
                  <span className="font-semibold text-text-main">
                    {ent.label || ent.id}
                  </span>
                  <span className="text-[10px] text-text-muted font-normal capitalize">
                    ({shapeStr}{dimsStr ? ` · ${dimsStr}` : ''})
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 3. Floor Spike Marks */}
      {markers.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-[9.5px] font-mono uppercase tracking-wider text-text-muted font-bold">
            <MapPin className="w-3 h-3 text-emerald-500" />
            <span>Spike Marks ({markers.length})</span>
          </div>

          <div className="flex flex-wrap gap-1">
            {markers.map((ent) => {
              const styleStr = ent.style ?? 'tape';
              const shapeStr = ent.shape ?? 'circle';

              return (
                <div
                  key={ent.id}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-lg bg-surface border border-border-main text-[10.5px] font-mono shadow-2xs"
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: ent.color || '#10b981' }}
                  />
                  <span className="font-medium text-text-body">
                    {ent.label || ent.id}
                  </span>
                  <span className="text-[9.5px] text-text-faint capitalize">
                    ({shapeStr} · {styleStr})
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
