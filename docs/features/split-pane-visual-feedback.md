# Split Pane Visual Feedback

## Feature Description

When using split panes, the active pane is visually distinguished from inactive panes using opacity to help users identify which pane is currently receiving input.

## Visual Indicators

### Active Pane
- **Opacity**: 100% (fully opaque)
- **Behavior**: Receives all keyboard input

### Inactive Pane
- **Opacity**: 60% (dimmed)
- **Behavior**: Click to activate

## Implementation Details

### Location
`web/src/components/TerminalArea.tsx` - `SingleTerminal` component

### CSS Classes
```typescript
// Container with transition
className="transition-opacity duration-200"
style={{ opacity: isPaneActive ? 1 : 0.6 }}
```

### Key Features
- **Smooth transition**: 200ms opacity transition when switching panes
- **Simple and clean**: Only uses opacity, no borders or other visual clutter
- **Click to activate**: Clicking any pane makes it active

## User Experience

1. **Split panes**: Press Ctrl+Shift+D (horizontal) or Ctrl+Shift+E (vertical)
2. **Visual feedback**: Active pane is bright (100%), inactive panes are dimmed (60%)
3. **Switch focus**: Click on any pane to make it active
4. **Keyboard input**: Only active pane receives keyboard input

## Technical Notes

- Opacity transition provides smooth visual feedback
- Minimal visual design - no borders or additional UI elements
- Works well with all terminal themes

## Future Enhancements

Possible improvements:
- Configurable opacity levels in settings
- Alternative visual indicators (subtle shadow, etc.)
- Keyboard shortcuts to cycle through panes

