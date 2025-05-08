import React from 'react';

export function formatText(text) {
  if (!text) return '';
  const lines = text.split('\n');
  const processedLines = lines.map(line => {
    if (line.trim().startsWith('* ')) {
      const starIndex = line.indexOf('*');
      const prefix = line.substring(0, starIndex);
      return prefix + '• ' + line.substring(starIndex + 2);
    }
    return line;
  });
  const textWithBullets = processedLines.join('\n');
  const regex = /(\*\*.*?\*\*|`.*?`)/g;
  let lastIndex = 0;
  const result = [];
  let match;

  try {
      while ((match = regex.exec(textWithBullets)) !== null) {
        if (match.index > lastIndex) {
          result.push(textWithBullets.substring(lastIndex, match.index));
        }

        const matchedText = match[0];
        if (matchedText.startsWith('**') && matchedText.endsWith('**')) {
          const content = matchedText.length > 4 ? matchedText.slice(2, -2) : '';
          result.push(<strong key={`bold-${lastIndex}`}>{content}</strong>);
        } else if (matchedText.startsWith('`') && matchedText.endsWith('`')) {
          const content = matchedText.length > 2 ? matchedText.slice(1, -1) : '';
          result.push(<em key={`italic-${lastIndex}`}>{content}</em>);
        } else {
           result.push(matchedText);
        }

        lastIndex = regex.lastIndex;
      }
      if (lastIndex < textWithBullets.length) {
        result.push(textWithBullets.substring(lastIndex));
      }
      return result.filter(part => part !== null && part !== '');
   } catch (error) {
       console.error("Error formatting text:", error, "Original text:", text);
       return text;
   }
}
