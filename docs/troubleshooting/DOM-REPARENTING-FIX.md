# Terminal Split Pane Fix - DOM Reparenting Pattern

## Problem Summary

When splitting terminal panes (Ctrl+Shift+D/E), the original terminal content was completely cleared, showing only a blank screen with cursor.

**Root Cause**: React's declarative lifecycle conflicts with xterm.js's imperative state management. When split operations change the component tree structure, React unmounts/remounts components, causing `term.dispose()` to be called and clearing all terminal buffer content.

## Solution: DOM Reparenting Pattern

Inspired by VS Code's terminal architecture, we implemented the **DOM Reparenting** pattern:

1. **Global Terminal Pool** (`web/src/lib/terminalPool.ts`):
   - Manages xterm.js instances and their DOM containers OUTSIDE React's lifecycle
   - Instances are created once and reused forever
   - Only disposed when tab is closed, NOT during splits

2. **React Component as Placeholder** (`web/src/components/Terminal.tsx`):
   - React component provides only a placeholder `<div>`
   - Uses native DOM API (`appendChild`/`removeChild`) to attach/detach terminal containers
   - When React unmounts component, only the placeholder is removed; xterm.js instance stays alive

3. **Physical DOM Movement**:
   - When split occurs, React unmounts old component → removes placeholder div
   - React mounts new component → creates new placeholder div
   - useEffect attaches the SAME terminal container to new placeholder
   - Content is preserved because xterm.js instance never knew it was moved

## Implementation Details

### 1. Terminal Pool (`web/src/lib/terminalPool.ts`)

```typescript
class TerminalPool {
  private instances = new Map<string, TerminalInstance>();

  getOrCreate(paneId: string, config: {...}): TerminalInstance {
    // Create xterm instance + DOM container once
    // Store in Map keyed by paneId
  }

  dispose(paneId: string): void {
    // Only called when tab is closed
    // Calls term.dispose() and removes from Map
  }
}
```

### 2. Terminal Component (`web/src/components/Terminal.tsx`)

**Key Changes**:
- Added `paneId` prop (REQUIRED for pool lookup)
- Changed `terminalRef` to `placeholderRef` (just a placeholder div)
- Removed all xterm.js initialization code from component
- Main useEffect now:
  1. Gets instance from pool: `terminalPool.getOrCreate(paneId)`
  2. Attaches container: `placeholderRef.current.appendChild(instance.container)`
  3. Sets up event handlers (onData, onKey)
  4. Cleanup: `placeholderRef.current.removeChild(instance.container)` (NOT dispose)

### 3. TerminalArea Component (`web/src/components/TerminalArea.tsx`)

**Key Changes**:
- Pass `paneId={pane.id}` to Terminal component

### 4. SSH Store (`web/src/stores/ssh-store.ts`)

**Key Changes**:
- `closeTab()`: Dispose all terminal instances for the tab
- `closePane()`: Dispose terminal instance for the pane

## Testing Guide

### Test 1: Basic Split Horizontal
1. Connect to SSH server
2. Run command: `ls -la`
3. Press `Ctrl+Shift+D` (split horizontal)
4. **Expected**: Original terminal content preserved, new pane appears below
5. **Verify**: Both panes show content, can type in both

### Test 2: Basic Split Vertical
1. Connect to SSH server
2. Run command: `pwd`
3. Press `Ctrl+Shift+E` (split vertical)
4. **Expected**: Original terminal content preserved, new pane appears on right
5. **Verify**: Both panes show content, can type in both

### Test 3: Multiple Splits
1. Connect to SSH server
2. Run command: `echo "test 1"`
3. Split horizontal (Ctrl+Shift+D)
4. In new pane, run: `echo "test 2"`
5. Split vertical (Ctrl+Shift+E)
6. In new pane, run: `echo "test 3"`
7. **Expected**: All 3 panes preserve their content
8. **Verify**: Can see "test 1", "test 2", "test 3" in respective panes

### Test 4: Long Running Command
1. Connect to SSH server
2. Run: `docker logs -f <container>` (or `tail -f /var/log/syslog`)
3. Wait for output to appear
4. Split horizontal (Ctrl+Shift+D)
5. **Expected**: Original pane still shows all previous output
6. **Verify**: Can scroll up to see history, new output continues to appear

### Test 5: Close Pane
1. Create 2 split panes
2. Close one pane
3. **Expected**: Remaining pane still shows content
4. **Verify**: No memory leaks (check browser DevTools)

### Test 6: Close Tab
1. Create 2 split panes
2. Close the entire tab
3. **Expected**: All terminal instances disposed
4. **Verify**: Check console for "[TerminalPool] DISPOSING instance" messages

### Test 7: Tab Switching
1. Create 2 tabs with SSH connections
2. In Tab 1, split panes and run commands
3. Switch to Tab 2
4. Switch back to Tab 1
5. **Expected**: All panes in Tab 1 still show content
6. **Verify**: No black screens, content appears immediately

## Console Logs to Monitor

When working correctly, you should see:
```
[TerminalPool] Creating NEW instance for pane: pane-xxx
[Terminal] DOM Reparenting: Attaching terminal for pane: pane-xxx
[Terminal] DOM Reparenting: Detaching terminal for pane: pane-xxx
[TerminalPool] DISPOSING instance for pane: pane-xxx (only when closing tab/pane)
```

## Known Limitations

1. **Font size changes**: If you change font size after split, all panes will update (this is expected)
2. **Theme changes**: Theme changes apply to all panes (this is expected)
3. **First split**: There might be a brief flash as React reorganizes the layout (this is normal)

## Comparison with Previous Attempts

| Approach | Result | Why It Failed |
|----------|--------|---------------|
| Stable React keys | Failed | React still unmounts when parent changes |
| React.memo | Failed | Doesn't prevent unmount |
| Empty useEffect deps | Failed | Component still unmounted by React |
| Global TerminalManager | Partial | Event handlers got confused, input issues |
| **DOM Reparenting** | ✅ Success | Moves DOM nodes outside React's control |

## Technical Insights

1. **React's key only works for same-level siblings**: When split wraps components in `<SplitPane>`, parent changes, causing unmount
2. **xterm.js is imperative**: Cannot be managed declaratively by React
3. **VS Code's solution**: Keep terminal instances in global pool, use DOM APIs to move containers
4. **Critical**: `appendChild`/`removeChild` physically moves DOM nodes without destroying them

## References

- VS Code Terminal Architecture: https://github.com/microsoft/vscode/tree/main/src/vs/workbench/contrib/terminal
- React Portals (similar concept): https://react.dev/reference/react-dom/createPortal
- xterm.js API: https://xtermjs.org/docs/api/terminal/classes/terminal/

## Credits

Solution provided by expert consultation, based on industry-proven patterns used by VS Code and other professional terminal applications.
