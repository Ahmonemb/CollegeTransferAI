import { useState, useRef, useCallback, useEffect } from 'react';

export function useResizeHandler(initialWidth, minColWidth, fixedMajorsWidth, isMajorsVisibleRef) {
    const [chatColumnWidth, setChatColumnWidth] = useState(initialWidth);
    const isResizingRef = useRef(false);
    const dividerRef = useRef(null);
    const containerRef = useRef(null);
    const dividerWidth = 1;

    const handleMouseMove = useCallback((e) => {
        if (!isResizingRef.current || !containerRef.current) {
            return;
        }

        const containerRect = containerRef.current.getBoundingClientRect();
        const mouseX = e.clientX;
        const containerLeft = containerRect.left;
        const totalWidth = containerRect.width;
        const gapWidth = 16;
        const currentVisibility = isMajorsVisibleRef.current;
        const majorsEffectiveWidth = currentVisibility ? fixedMajorsWidth : 0;
        const gap1EffectiveWidth = currentVisibility ? gapWidth : 0;
        const chatStartOffset = majorsEffectiveWidth + gap1EffectiveWidth;
        let newChatWidth = mouseX - containerLeft - chatStartOffset;
        const maxChatWidth = totalWidth - chatStartOffset - minColWidth - gapWidth - dividerWidth;
        newChatWidth = Math.max(minColWidth, Math.min(newChatWidth, maxChatWidth));

        setChatColumnWidth(newChatWidth);
    }, [minColWidth, fixedMajorsWidth, isMajorsVisibleRef]);

    const handleMouseUp = useCallback(() => {
        if (isResizingRef.current) {
            isResizingRef.current = false;
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        }
    }, [handleMouseMove]);

    useEffect(() => {
        return () => {
            if (isResizingRef.current) {
                window.removeEventListener('mousemove', handleMouseMove);
                window.removeEventListener('mouseup', handleMouseUp);
            }
        };
    }, [handleMouseMove, handleMouseUp]);

    const handleMouseDown = useCallback((e) => {
        e.preventDefault();
        isResizingRef.current = true;
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    }, [handleMouseMove, handleMouseUp]);

    return {
        chatColumnWidth,
        setChatColumnWidth,
        dividerRef,
        containerRef,
        handleMouseDown,
    };
}
