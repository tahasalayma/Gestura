# Gestura – Live Classroom

Premium gesture-controlled teaching tool with glossy iOS-style interface.

**Suggested Netlify name:** `gestura`  
→ https://gestura.netlify.app

## Features

### Interface (iOS glossy style)
- Frosted glass panels
- Side menu (top-right)
- Slide-in Whiteboard / Blackboard from the left
- Floating PDF panel
- Bottom notes sheet
- Clean top status bar

### Teaching tools
- Whiteboard & Blackboard
- Air drawing + Highlighter + Eraser
- Laser pointer
- PDF board (upload & view)
- Private teacher notes
- Class timer (5 / 10 / 15 min)
- Undo / Clear

### Gestures
| Gesture | Action |
|---------|--------|
| Open Palm (hold) | Toggle side menu |
| Fist (hold) | Close panels / cancel |
| Pinch | Draw / select |
| Swipe Right → Left | Open Whiteboard |
| Index finger | Cursor / Laser |

## Deploy

1. Go to https://app.netlify.com/drop
2. Drag the `gestura` folder
3. Change site name to `gestura`
4. Open https://gestura.netlify.app on any device

## Stack
- MediaPipe Hands
- Vanilla JS + modern CSS (backdrop-filter)
- No build step required
