import React from 'react';

// Helper function to parse basic markdown (bold/italic/bullets)
export function formatText(text) {
  if (!text) return ''; // Handle null or undefined text

  // 1. Pre-process lines for bullets ('* ' -> '• ')
  const lines = text.split('\n');
  const processedLines = lines.map(line => {
    // Use trim() to handle potential leading whitespace before '*'
    if (line.trim().startsWith('* ')) {
      // Replace '* ' with '• ' and keep the rest of the line content
      // Use indexOf to find the first '*' to correctly handle indentation
      const starIndex = line.indexOf('*');
      const prefix = line.substring(0, starIndex); // Keep indentation
      return prefix + '• ' + line.substring(starIndex + 2);
    }
    return line;
  });
  const textWithBullets = processedLines.join('\n');

  // 2. Apply bold/italic formatting to the text with bullets
  const regex = /(\*\*.*?\*\*|`.*?`)/g; // Regex to find **bold** or `italic`
  let lastIndex = 0;
  const result = [];
  let match;

  try {
      // Use textWithBullets for bold/italic parsing
      while ((match = regex.exec(textWithBullets)) !== null) {
        // Add text before the match
        if (match.index > lastIndex) {
          result.push(textWithBullets.substring(lastIndex, match.index));
        }

        const matchedText = match[0];
        // Add bold or italic element
        if (matchedText.startsWith('**') && matchedText.endsWith('**')) {
          // Ensure content exists before slicing
          const content = matchedText.length > 4 ? matchedText.slice(2, -2) : '';
          result.push(<strong key={`bold-${lastIndex}`}>{content}</strong>); // Use unique keys
        } else if (matchedText.startsWith('`') && matchedText.endsWith('`')) {
           // Ensure content exists before slicing
          const content = matchedText.length > 2 ? matchedText.slice(1, -1) : '';
          result.push(<em key={`italic-${lastIndex}`}>{content}</em>); // Use unique keys
        } else {
           // Should not happen with this regex, but as fallback, add the raw match
           result.push(matchedText);
        }

        lastIndex = regex.lastIndex;
      }

      // Add any remaining text after the last match
      if (lastIndex < textWithBullets.length) {
        result.push(textWithBullets.substring(lastIndex));
      }

      // Filter out potential empty strings and ensure valid React children
      return result.filter(part => part !== null && part !== '');
   } catch (error) {
       console.error("Error formatting text:", error, "Original text:", text);
       return text; // Return original text on error
   }
}
