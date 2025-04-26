// filepath: src/components/CustomCourseNode.jsx
import React, { memo } from 'react';
import { Handle, Position } from 'reactflow';

// Style for the node container
const nodeStyle = {
  padding: '12px 18px', // Slightly more padding
  // background: 'linear-gradient(145deg, #f0f0f0, #ffffff)', // Subtle gradient
  background: '#ffffff', // Clean white background
  border: '1px solid #ddd', // Lighter border
  borderRadius: '8px', // Slightly more rounded corners
  textAlign: 'center',
  minWidth: '120px', // Slightly wider minimum width
  fontSize: '14px', // Slightly larger font size
  color: '#333', // Darker text color for contrast
  fontFamily: 'Arial, sans-serif', // Cleaner font
  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)', // Soft shadow for depth
  position: 'relative', // Keep for handle positioning if needed later
};

// Style for handles
const handleStyle = {
    background: '#777', // Slightly lighter handle color
    width: '8px',
    height: '8px',
    border: '1px solid #fff', // Add a small border to handles
};

// memo prevents unnecessary re-renders
const CustomCourseNode = ({ data }) => {
  return (
    <div style={nodeStyle}>
      {/* Target Handle at the Top (for incoming prerequisites) */}
      <Handle
        type="target"
        position={Position.Top}
        id="handle-top" // Unique ID for this handle
        style={handleStyle}
      />

      {/* Node Label */}
      <div>{data.label}</div>

      {/* Source Handle at the Bottom (for outgoing connections) */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="handle-bottom" // Unique ID for this handle
        style={handleStyle}
      />
    </div>
  );
};

export default memo(CustomCourseNode);