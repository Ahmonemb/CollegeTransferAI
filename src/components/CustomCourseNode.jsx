import React, { memo } from 'react';
import { Handle, Position } from 'reactflow';

const nodeStyle = {
  padding: '12px 18px',
  background: '#ffffff', 
  border: '1px solid #ddd', 
  borderRadius: '8px',
  textAlign: 'center',
  minWidth: '120px',
  fontSize: '14px',
  color: '#333', 
  fontFamily: '"Roboto", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif', 
  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)', 
  position: 'relative',
};

const handleStyle = {
    background: '#777', 
    width: '8px',
    height: '8px',
    border: '1px solid #fff', 
};

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