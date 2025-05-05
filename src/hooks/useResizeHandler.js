import { useState, useRef, useCallback, useEffect } from 'react';

export function useResizeHandler(initialWidth, minColWidth, fixedMajorsWidth, isMajorsVisibleRef) {
    const [chatColumnWidth, setChatColumnWidth] = useState(initialWidth);
    const isResizingRef = useRef(false);
    const dividerRef = useRef(null);
    const containerRef = useRef(null);
    const dividerWidth = 1; // Assuming divider width is 1px

    const handleMouseMove = useCallback((e) => {
        if (!isResizingRef.current || !containerRef.current) {
            return;
        }

        const containerRect = containerRef.current.getBoundingClientRect();
        const mouseX = e.clientX;
        const containerLeft = containerRect.left;
        const totalWidth = containerRect.width;
        const gapWidth = 16; // Assuming 1em = 16px gap

        // Read the *current* visibility from the ref
        const currentVisibility = isMajorsVisibleRef.current;

        // Calculate the starting position of the chat column
        const majorsEffectiveWidth = currentVisibility ? fixedMajorsWidth : 0;
        const gap1EffectiveWidth = currentVisibility ? gapWidth : 0;
        const chatStartOffset = majorsEffectiveWidth + gap1EffectiveWidth;

        // Calculate desired chat width based on mouse position relative to chat start
        let newChatWidth = mouseX - containerLeft - chatStartOffset;

        // Constraints: ensure chat and PDF columns have minimum width
        const maxChatWidth = totalWidth - chatStartOffset - minColWidth - gapWidth - dividerWidth;
        newChatWidth = Math.max(minColWidth, Math.min(newChatWidth, maxChatWidth));

        setChatColumnWidth(newChatWidth);
    }, [minColWidth, fixedMajorsWidth, isMajorsVisibleRef]); // Dependencies updated

    const handleMouseUp = useCallback(() => {
        if (isResizingRef.current) {
            isResizingRef.current = false;
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        }
    }, [handleMouseMove]); // Dependency on handleMouseMove

    useEffect(() => {
        // Cleanup function to remove listeners if component unmounts while resizing
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
        setChatColumnWidth, // Expose setter if needed externally
        dividerRef,
        containerRef,
        handleMouseDown,
    };
}
