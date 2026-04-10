# Split Pane Clears Terminal Content - FIXED ✅

**Date**: 2024-04-10  
**Status**: ✅ FIXED

## Problem Description

When using keyboard shortcuts to split terminal panes (Ctrl+Shift+D for horizontal split, Ctrl+Shift+E for vertical split), the original terminal content was cleared, showing only a blank screen with a blinking cursor.

## Symptoms

1. User connects to SSH server and runs commands
2. Terminal displays output normally
3. User presses Ctrl+Shift+D or Ctrl+Shift+E to split
4. Original terminal content disappears
5. Only the prompt line is visible
6. Console shows error: `Cannot read properties of undefined (reading 'dimensions')`

## Root Cause

The Terminal component's main initialization useEffect had `fontSize` and `lineHeight` in its dependency array:

```typescript
useEffect(() => {
  // ... terminal initialization code
}, [fontSize, lineHeight]);
```

**Why this caused the problem:**

1. When parent components re-rendered (during split operations), React would check if dependencies changed
2. Even if `fontSize` and `lineHeight` values were the same, React might see them as new references
3. This triggered the useEffect cleanup function, which disposed the xterm.js instance
4. A new terminal was then created, losing all previous content
5. The error `Cannot read properties of undefined (reading 'dimensions')` occurred because the DOM renderer was accessed before full initialization

## Solution

**Changed the dependency array to empty `[]`:**

```typescript
useEffect(() => {
  // ... terminal initialization code
  
  return () => {
    // Cleanup
    term.dispose();
  };
}, []); // Empty deps - terminal only created once per mount
```

**Why this works:**

1. Terminal is now only created once when the component mounts
2. Font size changes are already handled by a separate useEffect that updates terminal options without recreating the instance
3. React keys (`key={pane.id}`) ensure stable component identity across renders
4. Split operations no longer trigger terminal disposal

## Code Changes

### Terminal.tsx

**Before:**
```typescript
useEffect(() => {
  // Terminal initialization
  return () => {
    term.dispose();
  };
}, [fontSize, lineHeight]); // ❌ Causes recreation on every parent re-render
```

**After:**
```typescript
useEffect(() => {
  // Terminal initialization
  return () => {
    term.dispose();
  };
}, []); // ✅ Only create once per mount
```

Font changes are handled separately:
```typescript
useEffect(() => {
  if (xtermRef.current) {
    if (fontSize) xtermRef.current.options.fontSize = fontSize;
    if (lineHeight) xtermRef.current.options.lineHeight = lineHeight;
    // ... safe fit logic
  }
}, [fontSize, lineHeight]); // This only updates options, doesn't recreate terminal
```

## Files Modified

1. **web/src/components/Terminal.tsx**
   - Changed main useEffect dependency array from `[fontSize, lineHeight]` to `[]`
   - Removed debug console.log statements

2. **web/src/components/TerminalArea.tsx**
   - Cleaned up debug console.log statements

3. **AGENTS.md**
   - Updated Bug Fix #5 with correct root cause and solution

4. **CHANGELOG.md**
   - Updated v1.1.15 entry with accurate fix description

## Testing

To verify the fix:

1. **Connect to SSH server**
   ```bash
   ssh user@server
   ```

2. **Generate some content**
   ```bash
   ls -la
   cat /etc/os-release
   echo "Test content that should persist"
   ```

3. **Split pane horizontally** (Ctrl+Shift+D)
   - ✅ Original terminal content should remain visible in left pane
   - ✅ New terminal appears in right pane
   - ✅ No console errors

4. **Split pane vertically** (Ctrl+Shift+E)
   - ✅ All terminal content should remain visible
   - ✅ New terminal appears below
   - ✅ No console errors

5. **Close panes**
   - ✅ Remaining panes preserve their content
   - ✅ No errors in console

## Key Learnings

1. **useEffect dependencies matter**: Including props in dependency arrays can cause unexpected re-initialization
2. **Separate concerns**: Handle initialization and updates in separate useEffects
3. **xterm.js is expensive**: Creating/destroying terminal instances loses all content and state
4. **React keys help but aren't enough**: Even with stable keys, wrong dependencies can cause recreation

## Related Issues

- **Terminal Tab Switching Black Screen** (Fixed 2024-03-23) - DOM renderer timing issue
- **Ctrl+C Not Working** (Fixed 2024-03-23) - PTY terminal modes not set
- **Terminal Size Mismatch** (Fixed 2024-04-10) - Hardcoded PTY size vs actual terminal size

## Prevention

To prevent similar issues in the future:

1. **Keep useEffect dependencies minimal** - only include what actually needs to trigger re-initialization
2. **Separate initialization from updates** - use different useEffects for different concerns
3. **Test component lifecycle** - verify components aren't being recreated unnecessarily
4. **Monitor console warnings** - React will warn about missing dependencies, but sometimes they shouldn't be added

