import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  MarkerType,
  useNodesState,
  useEdgesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './styles.css';
import { roadmapItems } from './roadmapData.js';

const statusLabels = {
  done: 'Done',
  inProgress: 'In Progress',
  planned: 'Planned',
  exploring: 'Exploring',
  pruned: 'Pruned',
};

const statusRank = {
  done: 1,
  inProgress: 2,
  planned: 3,
  exploring: 4,
  pruned: 5,
};

function RoadmapNode({ data }) {
  const isPruned = data.status === 'pruned';

  return (
    <div
      className={`roadmap-node status-${data.status} ${
        isPruned ? 'roadmap-node-pruned' : ''
      }`}
      style={{ '--column-color': data.columnColor }}
    >
      <div className="node-kicker">{data.category}</div>
      <div className="node-title">
        {isPruned && '✕ '}
        {data.title}
      </div>
      <div className="node-footer">
        <span className="node-status">{statusLabels[data.status]}</span>
        <span className="node-signal">{data.communitySignal}</span>
      </div>
    </div>
  );
}

const COLUMN_SPACING = 285;
const CARD_SPACING_Y = 155;
const HEADER_OFFSET_Y = 0;
const CARD_OFFSET_Y = 80;

const columnConfig = {
  foundations: { index: 0, label: 'Foundations', color: '#8fbf7f' },
  gameModes: { index: 1, label: 'Game Modes', color: '#7fa7bf' },
  biology: { index: 2, label: 'Biology', color: '#b18ad6' },
  biomes: { index: 3, label: 'Biomes', color: '#d4a64f' },
  progression: { index: 4, label: 'Progression', color: '#6fb7a8' },
  education: { index: 5, label: 'Education', color: '#c9877a' },
  dlc: { index: 6, label: 'DLC', color: '#b7a46a' },
};

function ColumnHeaderNode({ data }) {
  return (
    <div
      className="column-header-node"
      style={{ '--column-color': data.columnColor }}
    >
      {data.label}
    </div>
  );
}

const nodeTypes = {
  roadmapNode: RoadmapNode,
  columnHeader: ColumnHeaderNode,
};

/*
const nodeTypes = { roadmapNode: RoadmapNode };

function layoutRoadmap(items) {
  const columns = {
    gameModes: 0,
    mechanics: 1,
    biomes: 2,
    progression: 3,
    education: 4,
  };

  const rowCounts = {};

  return items
    .slice()
    .sort((a, b) => {
      const columnDelta = columns[a.column] - columns[b.column];
      if (columnDelta !== 0) return columnDelta;
      return statusRank[a.status] - statusRank[b.status];
    })
    .map((item) => {
      const row = rowCounts[item.column] || 0;
      rowCounts[item.column] = row + 1;
      return {
        id: item.id,
        type: 'roadmapNode',
        position: {
          x: columns[item.column] * 330,
          y: row * 170,
        },
        data: item,
      };
    });
}


function layoutRoadmap(items) {
  const columns = {
    foundations: 0,
    gameModes: 1,
    biology: 2,
    biomes: 3,
    progression: 4,
    education: 5,
    dlc: 6
  };

  const fallbackColumn = 0;
  const rowCounts = {};
  return items
  .slice()
  .sort((a, b) => {
    const aColumn = columns[a.column] ?? fallbackColumn;
    const bColumn = columns[b.column] ?? fallbackColumn;
    const columnDelta = aColumn - bColumn;
    if (columnDelta !== 0) return columnDelta;
    
    const aStatus = statusRank[a.status] ?? 999;
    const bStatus = statusRank[b.status] ?? 999;
    return aStatus - bStatus;
  })
  .map((item) => {
    const columnIndex = columns[item.column] ?? fallbackColumn;
    const rowKey = item.column || 'uncategorized';
    const row = rowCounts[rowKey] || 0;
    rowCounts[rowKey] = row + 1;
    
    return {
      id: item.id,
      type: 'roadmapNode',
      position: {
        x: columnIndex * 330,
        y: row * 170,
      },
      data: item,
    };
  });
}
*/

function makeColumnHeaders() {
  return Object.entries(columnConfig).map(([columnKey, column]) => ({
    id: `column-header-${columnKey}`,
    type: 'columnHeader',
    position: {
      //      x: column.index * 330,
      x: column.index * COLUMN_SPACING,
      y: 0,
    },
    /*    data: { label: column.label },*/
    data: {
      label: column.label,
      columnColor: column.color,
    },
    draggable: false,
    selectable: false,
    connectable: false,
  }));
}

function layoutRoadmap(items) {
  const fallbackColumn = 0;
  const rowCounts = {};

  return items
    .slice()
    .sort((a, b) => {
      const aColumn = columnConfig[a.column]?.index ?? fallbackColumn;
      const bColumn = columnConfig[b.column]?.index ?? fallbackColumn;
      const columnDelta = aColumn - bColumn;
      if (columnDelta !== 0) return columnDelta;

      const aStatus = statusRank[a.status] ?? 999;
      const bStatus = statusRank[b.status] ?? 999;
      return aStatus - bStatus;
    })
    .map((item) => {
      const columnIndex = columnConfig[item.column]?.index ?? fallbackColumn;
      const rowKey = item.column || 'uncategorized';
      const row = rowCounts[rowKey] || 0;
      rowCounts[rowKey] = row + 1;

      return {
        id: item.id,
        type: 'roadmapNode',
        position: {
          //          x: columnIndex * 330,
          x: columnIndex * COLUMN_SPACING,
          //          y: 80 + row * 170,
          y: CARD_OFFSET_Y + row * CARD_SPACING_Y,
        },
        data: {
          ...item,
          columnColor: columnConfig[item.column]?.color ?? '#fbf3dc',
        },
      };
    });
}

function makeEdges(items) {
  return items.flatMap((item) =>
    item.dependsOn.map((dependencyId) => ({
      id: `${dependencyId}-${item.id}`,
      source: dependencyId,
      target: item.id,
      type: 'smoothstep',
      markerEnd: { type: MarkerType.ArrowClosed },
      className: `edge-to-${item.status}`,
    }))
  );
}

function DetailPanel({ selectedItem, onClose }) {
  if (!selectedItem) {
    return (
      <aside className="detail-panel empty-panel">
        <h2>Atlas Vegrandis Roadmap</h2>
        <p>Select a feature card to see why it exists, what it depends on, and how the community might influence it.</p>
        <p className="panel-note">This is phase 1–2: static roadmap plus interactive graph. Voting and comments come next.</p>
      </aside>
    );
  }

  return (
    <aside className="detail-panel">
      <button className="close-button" onClick={onClose} aria-label="Close detail panel">×</button>
      <div className="panel-kicker">{selectedItem.category}</div>
      <h2>{selectedItem.title}</h2>
      <span className={`panel-status status-pill status-${selectedItem.status}`}>
        {statusLabels[selectedItem.status]}
      </span>
      <p>{selectedItem.description}</p>
      <h3>Why this matters</h3>
      <p>{selectedItem.details}</p>
      <h3>Dependencies</h3>
      {selectedItem.dependsOn.length ? (
        <ul>
          {selectedItem.dependsOn.map((dependencyId) => {
            const dependency = roadmapItems.find((item) => item.id === dependencyId);
            return <li key={dependencyId}>{dependency?.title || dependencyId}</li>;
          })}
        </ul>
      ) : (
        <p>No upstream dependencies.</p>
      )}
      <div className="feedback-box">
        <p>Community signal placeholder</p>
        <div className="feedback-actions">
          <button>Want this</button>
          <button>Not for me</button>
          <button>Comment</button>
        </div>
      </div>
    </aside>
  );
}

function App() {
  const initialNodes = useMemo(
    () => [...makeColumnHeaders(), ...layoutRoadmap(roadmapItems)],
    []
  );
  const initialEdges = useMemo(() => makeEdges(roadmapItems), []);
  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);
  const [selectedId, setSelectedId] = useState(null);

  const selectedItem = roadmapItems.find((item) => item.id === selectedId);
  const statusCounts = roadmapItems.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <main className="app-shell">
      <header className="site-header">
        <div>
          <p className="eyebrow">Atlas Vegrandis</p>
          <h1>Public Roadmap</h1>
          <p className="lede">A living map of planned systems, biomes, and experiments for a biology-first open world survival craft game.</p>
        </div>
        <div className="legend">
          {Object.entries(statusLabels).map(([status, label]) => (
            <span key={status} className={`status-pill status-${status}`}>{label}: {statusCounts[status] || 0}</span>
          ))}
        </div>
      </header>

      <section className="roadmap-layout">
        <div className="flow-card">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            /*            onNodeClick={(_, node) => setSelectedId(node.id)}*/
            onNodeClick={(_, node) => {
              if (node.type === 'columnHeader') return;
              setSelectedId(node.id);
            }}
            fitView
            minZoom={0.25}
            maxZoom={1.4}
          >
            <Background />
            <Controls />
            <MiniMap pannable zoomable />
          </ReactFlow>
        </div>
        <DetailPanel selectedItem={selectedItem} onClose={() => setSelectedId(null)} />
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
