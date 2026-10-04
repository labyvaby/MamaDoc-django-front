import React from "react";
import { Box } from "@mui/material";

import { artSvgStyle, useArtColors } from "../../../pages/patient-program/ortho/art/artColors";
import { PEDIGREE, type PedigreeLayout, type PedigreeNode } from "./pedigreeLayout";

interface PedigreeChartProps {
  layout: PedigreeLayout;
  /** Нажатие на символ — окно этого родственника; на пустое место — новый с выбранным родством. */
  onNode?: (node: PedigreeNode) => void;
  minWidth?: number;
  maxWidth?: number;
}

/**
 * Родословная (ТЗ §4.4): мужчина — квадрат, женщина — круг, пол неизвестен —
 * ромб; есть болезни — закрашен; «нет сведений» — «?»; умерший перечёркнут;
 * ребёнок — стрелка; кровнородственный брак — двойная линия.
 */
export const PedigreeChart: React.FC<PedigreeChartProps> = ({ layout, onNode, minWidth = 400, maxWidth = 640 }) => {
  const c = useArtColors();
  const s = PEDIGREE.symbol;
  const h = s / 2;
  const warn = c.status("warn");
  const label = `Родословная: ${layout.nodes.filter((node) => !node.placeholder).length} человек, ${layout.rows.length} поколения`;

  const shape = (node: PedigreeNode) => {
    const fill = node.placeholder ? "transparent" : node.affected ? c.statusFill("warn") : c.surface;
    const stroke = node.placeholder ? c.inkSoft : node.affected ? warn : c.ink;
    const common = {
      fill,
      stroke,
      strokeWidth: 1.4,
      strokeDasharray: node.placeholder ? "3 3" : undefined,
    };
    if (node.sex === "male") return <rect x={node.x - h} y={node.y - h} width={s} height={s} {...common} />;
    if (node.sex === "female") return <circle cx={node.x} cy={node.y} r={h} {...common} />;
    return <path d={`M${node.x} ${node.y - h - 2} L${node.x + h + 2} ${node.y} L${node.x} ${node.y + h + 2} L${node.x - h - 2} ${node.y} Z`} {...common} />;
  };

  return (
    <Box sx={{ overflowX: "auto", scrollbarWidth: "thin" }}>
      <svg
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        role="img"
        aria-label={label}
        style={{
          ...artSvgStyle,
          minWidth: Math.min(minWidth, layout.width),
          // Не раздувать рисунок больше чем в 1,35 раза: подписи остаются соразмерны тексту страницы.
          maxWidth: Math.min(maxWidth, layout.width * 1.35),
          marginInline: "auto",
        }}
      >
        {layout.rows.map((row) => (
          <text key={row.roman} x={8} y={row.y + 4} fill={c.muted} fontSize={11} fontWeight={600}>
            {row.roman}
          </text>
        ))}
        {layout.lines.map((line) =>
          line.double ? (
            <g key={line.key}>
              <path d={line.d} transform="translate(0 -2)" stroke={c.ink} strokeWidth={1.2} fill="none" />
              <path d={line.d} transform="translate(0 2)" stroke={c.ink} strokeWidth={1.2} fill="none" />
            </g>
          ) : (
            <path key={line.key} d={line.d} stroke={line.dashed ? c.inkSoft : c.ink} strokeWidth={1.2} strokeDasharray={line.dashed ? "3 3" : undefined} fill="none" />
          ),
        )}
        {layout.nodes.map((node) => {
          const clickable = Boolean(onNode) && (node.memberId != null || node.placeholder != null);
          return (
            <g
              key={node.key}
              onClick={clickable ? () => onNode?.(node) : undefined}
              style={{ cursor: clickable ? "pointer" : "default" }}
              role={clickable ? "button" : undefined}
              tabIndex={clickable ? 0 : undefined}
              onKeyDown={
                clickable
                  ? (event) => {
                      if (event.key === "Enter" || event.key === " ") onNode?.(node);
                    }
                  : undefined
              }
            >
              <title>{node.tooltip}</title>
              {shape(node)}
              {node.placeholder && (
                <text x={node.x} y={node.y + 4.5} textAnchor="middle" fill={c.inkSoft} fontSize={14}>
                  +
                </text>
              )}
              {node.unknown && (
                <text x={node.x} y={node.y + 4.5} textAnchor="middle" fill={c.muted} fontSize={12} fontWeight={600}>
                  ?
                </text>
              )}
              {node.deceased && (
                <path d={`M${node.x - h - 4} ${node.y + h + 4} L${node.x + h + 4} ${node.y - h - 4}`} stroke={c.ink} strokeWidth={1.2} />
              )}
              {node.proband && (
                <>
                  <path d={`M${node.x - h - 24} ${node.y + 12} L${node.x - h - 6} ${node.y + 4}`} stroke={c.ink} strokeWidth={1.2} fill="none" />
                  <path d={`M${node.x - h - 1} ${node.y + 2} l-9 -2 l3 8 z`} fill={c.accent} />
                </>
              )}
              <text x={node.x} y={node.y + h + 15} textAnchor="middle" fill={node.placeholder ? c.inkSoft : c.muted} fontSize={10.5}>
                {node.role}
              </text>
              {node.diseases && (
                <text x={node.x} y={node.y + h + 28} textAnchor="middle" fill={warn} fontSize={11.5}>
                  {node.diseases}
                </text>
              )}
              {node.death && (
                <text x={node.x} y={node.y + h + (node.diseases ? 41 : 28)} textAnchor="middle" fill={c.muted} fontSize={10.5}>
                  {node.death}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </Box>
  );
};
