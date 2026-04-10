# Terminal Split Pane Content Loss - Issue Summary

## Project Context

**Project**: HeTaoSSH - Modern SSH client built with Tauri 2.0 + Rust + React  
**Terminal Library**: xterm.js 5.3.0  
**Framework**: React 18.3.1  
**Issue Date**: 2024-04-10  
**Status**: 🔴 UNRESOLVED

---

## Problem Description

### Symptoms

When using keyboard shortcuts to split terminal panes:
- **Ctrl+Shift+D** (horizontal split)
- **Ctrl+Shift+E** (vertical split)

The **original terminal content is completely cleared**, showing only a blank screen with a blinking cursor. The new pane appears empty as well.

### Expected Behavior

- Original terminal content should remain visible in the left/top pane
- New terminal should appear in the right/bottom pane
- Both terminals should be fully functional

### Actual Behavior

1. User connects to SSH server and runs commands (e.g., `ls`, `cat file.txt`)
2. Terminal displays output normally
3. User presses Ctrl+Shift+D to split horizontally
4. **Original terminal content disappears** - only prompt line visible
5. New pane appears but is also empty
6. Console shows multiple errors: `Cannot read properties of undefined (reading 'dimensions')`

---

## Technical Details

### Architecture

```
TerminalArea (manages pane layout)
  └─> PaneRenderer (recursive renderer)
      └─> SingleTerminal (wrapper with memo)
          └─> Terminal (xterm.js instance)
```

### Key Components

1. **Terminal.tsx**: Manages xterm.js instance lifecycle
2. **TerminalArea.tsx**: Manages split pane layout and state
3. **SplitPane.tsx**: Renders split layout with resizable dividers
4. **ssh-store.ts**: Zustand store managing pane groups and connections

### State Structure

```typescript
interface PaneGroup {
  id: string;
  direction: 'horizontal' | 'vertical';
  panes: (TerminalPane | PaneGroup)[];  // Recursive structure
  activePaneId: string | null;
}

interface TerminalPane {
  id: string;
  serverId: number;
  isLocal?: boolean;
  backendId: string;
}
```

---

## Root Cause Analysis

### Console Logs During Split

```
[Terminal] Creating terminal instance, serverId: 7
[Terminal] DISPOSING terminal instance, serverId: 7
[Terminal] Creating terminal instance, serverId: 7
```

**Key Finding**: Terminal component is being **unmounted and remounted** during split operation, causing xterm.js instance to be disposed and recreated, losing all content.

### Why Component is Unmounted

Despite having:
- ✅ Stable React keys (`key={pane.id}`)
- ✅ Memoized components with custom comparison
- ✅ Empty useEffect dependency array `[]`
- ✅ Stable pane IDs

React still decides to unmount and remount the Terminal component when:
1. Parent state updates (paneGroups changes)
2. Component tree structure changes (single pane → split panes)
3. Props change (even with memo)

---

## Attempted Solutions

### 1. Modified useEffect Dependencies ❌

**Attempt**: Changed Terminal's main useEffect from `[fontSize, lineHeight]` to `[]`

```typescript
useEffect(() => {
  // Terminal initialization
  return () => {
    term.dispose(); // Still called!
  };
}, []); // Empty deps
```

**Result**: FAILED - Component still unmounted during split

---

### 2. Added Stable React Keys ❌

**Attempt**: Added explicit `key={pane.id}` to all Terminal components

```typescript
<TerminalComponent
  key={pane.id}  // Stable ID like "pane-existing-term-123-7"
  ref={terminalRef}
  // ...
/>
```

**Result**: FAILED - React still remounted component

---

### 3. Used React.memo with Custom Comparison ❌

**Attempt**: Wrapped SingleTerminal in memo with custom comparison function

```typescript
const SingleTerminal = memo(function SingleTerminal({ pane, ... }) {
  // Component logic
}, (prevProps, nextProps) => {
  return (
    prevProps.pane.id === nextProps.pane.id &&
    prevProps.pane.serverId === nextProps.pane.serverId &&
    // ... other comparisons
  );
});
```

**Result**: FAILED - Component still remounted

---

### 4. Global TerminalManager Pattern ❌

**Attempt**: Created global singleton to manage xterm.js instances outside React lifecycle

```typescript
class TerminalManager {
  private instances = new Map<string, TerminalInstance>();
  
  getOrCreate(paneId: string): TerminalInstance {
    // Keep instances alive across React re-renders
  }
  
  attach(paneId: string, container: HTMLElement) {
    // Attach existing instance to new container
  }
}
```

**Result**: PARTIALLY WORKED but introduced new issues:
- ✅ Instances not disposed
- ❌ First split only showed one pane
- ❌ Original terminal couldn't receive input
- ❌ Complex implementation with attach/detach cycles

---

### 5. Changed to DOM Renderer ❌

**Attempt**: Used `rendererType: 'dom'` (same as previous tab-switching fix)

```typescript
const term = new XTerm({
  // ...
  rendererType: 'dom',
});
```

**Result**: FAILED - Same issue persists

---

### 6. Unified Component Tree Structure ❌

**Attempt**: Always render through PaneRenderer, even for single pane

**Result**: FAILED - Component still remounted

---

### 7. Moved Pane Initialization to Store ❌

**Attempt**: Initialize paneGroup in `openTerminalTab` instead of lazily

```typescript
openTerminalTab: (serverId: number) => {
  const initialPaneGroup: PaneGroup = {
    id: `group-single-${newTab.id}`,
    direction: 'horizontal',
    panes: [singlePane],
    activePaneId: singlePane.id
  };
  
  set({ 
    paneGroups: {
      ...get().paneGroups,
      [newTab.id]: initialPaneGroup
    }
  });
}
```

**Result**: FAILED - Component still remounted

---

## Comparison with Previous Fix

### Terminal Tab Switching (✅ FIXED)

**Problem**: Switching tabs cleared terminal content  
**Solution**: 
- Used DOM renderer
- Wait for `.xterm-rows` element before operations
- Changed tab container from `display: none` to `visibility: hidden`
- Removed `isActive` from useEffect dependencies

**Why it worked**: Tabs don't unmount components, just hide/show them

### Split Pane (❌ FAILED)

**Problem**: Splitting panes clears terminal content  
**Difference**: Split operation **restructures component tree**, causing React to unmount/remount components

**Key Insight**: Tab switching = visibility change, Split pane = component tree change

---

## Error Messages

```
RenderService.ts:52 Uncaught TypeError: Cannot read properties of undefined (reading 'dimensions')
  at get dimensions (RenderService.ts:52:77)
  at t2.Viewport._innerRefresh (Viewport.ts:122:52)
  at Viewport.ts:116:102
```

**Note**: These errors occur during xterm.js initialization when renderer is accessed before ready. They are **symptoms**, not the root cause.

---

## Fundamental Conflict

### React's Declarative Model

```
State Change → Virtual DOM Diff → Reconciliation → DOM Update
```

React decides when to:
- Reuse components (same type + key)
- Unmount/remount components (structure change)

### xterm.js's Imperative Model

```
new XTerm() → term.open(container) → term.write(data) → term.dispose()
```

xterm.js manages:
- Terminal buffer (scrollback history)
- Cursor position
- Screen content

**Conflict**: When React unmounts component, xterm.js instance is disposed, losing all state.

---

## Proposed Solutions

### Option 1: Global Instance Manager (Complex)

**Approach**: Move xterm.js lifecycle completely outside React

```typescript
// Global manager
const terminalManager = new TerminalManager();

// React component only renders container
function Terminal({ paneId }) {
  useEffect(() => {
    const instance = terminalManager.getOrCreate(paneId);
    terminalManager.attach(paneId, containerRef.current);
    
    return () => {
      terminalManager.detach(paneId); // Don't dispose!
    };
  }, [paneId]);
  
  return <div ref={containerRef} />;
}
```

**Pros**: 
- Instances survive React re-renders
- Content preserved across splits

**Cons**:
- Complex lifecycle management
- Manual cleanup required
- Attach/detach cycles can cause issues
- Need to handle edge cases (tab close, reconnect, etc.)

**Estimated Effort**: 8-16 hours

---

### Option 2: Portal-based Rendering (Medium)

**Approach**: Use React Portals to keep terminal DOM stable

```typescript
// Create stable container outside React tree
const terminalContainer = document.createElement('div');

function Terminal({ paneId }) {
  return createPortal(
    <XTermComponent />,
    terminalContainer
  );
}
```

**Pros**:
- Leverages React's portal API
- DOM stays stable

**Cons**:
- Still need to manage container lifecycle
- Portal positioning can be tricky

**Estimated Effort**: 4-8 hours

---

### Option 3: Alternative Terminal Library (High Risk)

**Approach**: Replace xterm.js with React-friendly alternative

Options:
- `react-terminal-ui`
- `react-console-emulator`
- Custom implementation

**Pros**:
- Built for React lifecycle
- No imperative/declarative conflict

**Cons**:
- Major refactor required
- May lack xterm.js features
- Unknown compatibility with SSH backend

**Estimated Effort**: 16-40 hours

---

### Option 4: Disable Split Pane Feature (Temporary)

**Approach**: Remove split pane functionality until architectural refactor

**Pros**:
- Immediate solution
- No risk of data loss

**Cons**:
- Loss of feature
- User disappointment

**Estimated Effort**: 1 hour

---

## Questions for Expert

1. **Is there a way to prevent React from unmounting a component during state updates**, even when the component tree structure changes?

2. **Has anyone successfully integrated xterm.js with React split panes** without content loss? Are there known patterns?

3. **Is the Global Instance Manager approach viable**, or are there hidden pitfalls we haven't considered?

4. **Could React 18's `useSyncExternalStore`** help manage xterm.js instances outside React's lifecycle?

5. **Are there React reconciliation hints** (like `key`, but more powerful) that can force component reuse?

6. **Would using a different state management library** (like Jotai, Valtio) help avoid component remounts?

---

## Reproduction Steps

1. Clone repository: `git clone <repo>`
2. Install dependencies: `pnpm install`
3. Run dev server: `pnpm tauri dev`
4. Connect to SSH server
5. Run commands: `ls`, `cat file.txt`
6. Press **Ctrl+Shift+D** to split horizontally
7. **Observe**: Original terminal content is cleared

---

## Environment

- **OS**: Windows 11
- **Node**: v20.x
- **pnpm**: v8.x
- **React**: 18.3.1
- **xterm.js**: 5.3.0
- **Tauri**: 2.10.1

---

## Related Files

- `web/src/components/Terminal.tsx` - Terminal component with xterm.js
- `web/src/components/TerminalArea.tsx` - Split pane layout manager
- `web/src/components/SplitPane.tsx` - Resizable split pane component
- `web/src/stores/ssh-store.ts` - Zustand store for pane state
- `AGENTS.md` - Project documentation with previous fixes

---

## Additional Context

### Previous Similar Issue (FIXED)

**Terminal Tab Switching Black Screen** was successfully fixed by:
- Using DOM renderer
- Waiting for renderer initialization
- Using `visibility: hidden` instead of `display: none`

However, **split pane issue is fundamentally different** because:
- Tab switching = visibility change (component stays mounted)
- Split pane = tree restructure (component gets unmounted)

---

## Request for Help

We've exhausted our attempts to fix this issue within the current architecture. We need expert guidance on:

1. Best practices for integrating imperative libraries (xterm.js) with React
2. Patterns for preserving component state across tree restructures
3. Whether our Global Instance Manager approach is sound
4. Alternative architectural approaches we haven't considered

Any insights would be greatly appreciated!

---

**Contact**: [Your contact information]  
**Repository**: [Repository URL if public]  
**Date**: 2024-04-10
