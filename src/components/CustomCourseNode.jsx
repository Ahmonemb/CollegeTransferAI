// filepath: src/components/CustomCourseNode.jsx
import React, { memo } from 'react';
import { Handle, Position } from 'reactflow';

// Style for the node container - Light Theme
const nodeStyle = {
  padding: '12px 18px',
  background: '#ffffff', // White background
  border: '1px solid #ddd', // Light grey border
  borderRadius: '8px',
  textAlign: 'center',
  minWidth: '120px',
  fontSize: '14px',
  color: '#333', // Dark text color
  fontFamily: '"Roboto", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif', // Use Roboto font
  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)', // Soft shadow
  position: 'relative',
};

// Style for handles - Light Theme
const handleStyle = {
    background: '#777', // Medium grey handle
    width: '8px',
    height: '8px',
    border: '1px solid #fff', // White border for contrast on handle
};

// memo prevents unnecessary re-renders
const CustomCourseNode = ({ data }) => {
  return (
    <div style={nodeStyle}>
      <Handle
        type="target"
        position={Position.Top}
        id="handle-top"
        style={handleStyle}
      />
      <div>{data.label}</div>
      <Handle
        type="source"
        position={Position.Bottom}
        id="handle-bottom"
        style={handleStyle}
      />
    </div>
  );
};

export default memo(CustomCourseNode);